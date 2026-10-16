"""FastAPI backend for the Gemini cold email endpoints."""

import base64
import binascii
import asyncio
import io
import json
import os
import re
import traceback
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

from config import load_env


HERE = Path(__file__).resolve().parent
load_env(HERE / ".env")
MAX_REQUEST_BYTES = 4_300_000
MAX_FILE_BYTES = 3 * 1024 * 1024
MAX_JD_CHARS = 60_000
MAX_PROFILE_CHARS = 40_000
app = FastAPI(title="Postscript", description="Cold email generator API")
allowed_origins = ["http://127.0.0.1:5173", "http://localhost:5173"]
frontend_origin = os.environ.get("FRONTEND_ORIGIN", "").rstrip("/")
if frontend_origin:
    allowed_origins.append(frontend_origin)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["POST"],
    allow_headers=["Content-Type"],
)


class InputError(ValueError):
    pass


class GeminiError(RuntimeError):
    pass


def gemini_error_message(code: int, status: str | None = None, message: str | None = None) -> str:
    if code == 401 or (code == 400 and (status == "API_KEY_INVALID" or "api key" in (message or "").lower())):
        return "Gemini rejected the API key. Check the key you entered."
    if code == 403:
        return "Gemini denied this request. Check the API key and model access."
    if code == 404:
        return "Gemini could not find the model. Check the GEMINI_MODEL setting."
    if code == 429:
        return "Gemini quota or rate limit was reached. Check your quota or try again later."
    if code >= 500:
        return "Gemini is temporarily unavailable. Try again shortly."
    return f"Gemini rejected the request ({code}). Check the server log for details."


def extract_file(file_data: dict) -> str:
    if not isinstance(file_data, dict):
        raise InputError("The uploaded file is invalid.")
    name = str(file_data.get("name", ""))
    extension = Path(name).suffix.lower()
    if extension not in {".txt", ".md", ".pdf", ".docx"}:
        raise InputError("Use a TXT, MD, PDF, or DOCX file.")
    try:
        raw = base64.b64decode(file_data.get("content", ""), validate=True)
    except (binascii.Error, ValueError, TypeError):
        raise InputError("The uploaded file could not be read.") from None
    if not raw or len(raw) > MAX_FILE_BYTES:
        raise InputError("Choose a file smaller than 3 MB.")

    try:
        if extension in {".txt", ".md"}:
            return raw.decode("utf-8-sig").strip()
        if extension == ".pdf":
            from pypdf import PdfReader

            return "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(raw)).pages).strip()
        from docx import Document

        return "\n".join(paragraph.text for paragraph in Document(io.BytesIO(raw)).paragraphs).strip()
    except ImportError:
        raise InputError("File reading dependencies are missing. Run pip install -r requirements.txt.") from None
    except Exception:
        raise InputError("Could not extract text from that file. Try a different file or paste the text.") from None


def parse_email(output: str) -> dict:
    # Tolerant of the model writing EMAIL:, EMAILS:, or "The email:" etc.
    match = re.search(r"(?im)^\s*(?:the\s+)?emails?\s*:\s*", output)
    if not match:
        return {"subjects": [], "email": output.strip(), "raw": output.strip()}
    subject_block = output[:match.start()]
    subjects = [
        re.sub(r"^\s*\d+[.)]\s*", "", line).strip()
        for line in subject_block.splitlines()
        if re.match(r"^\s*\d+[.)]\s*\S", line)
    ][:3]
    return {"subjects": subjects, "email": output[match.end():].strip(), "raw": output.strip()}


# Order the recipient variants are generated and shown in.
RECIPIENT_ORDER = ["founder", "hr", "engineer"]
RECIPIENT_LABELS = {"founder": "Founder", "hr": "Recruiter / HR", "engineer": "Engineer"}


def generate(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise InputError("Invalid request.")
    api_key = str(payload.get("api_key") or "").strip()
    company = str(payload.get("company") or "").strip()[:150]
    role = str(payload.get("role") or "AI Engineer").strip()[:150] or "AI Engineer"
    name = str(payload.get("name") or "").strip()[:100]
    jd = str(payload.get("job_description") or "").strip()
    if payload.get("file"):
        extracted = extract_file(payload["file"])
        jd = "\n\n".join(part for part in (jd, extracted) if part)
    if len(jd) > MAX_JD_CHARS:
        raise InputError("The job description is too long. Keep it under 60,000 characters.")
    if not company and not jd:
        raise InputError("Add a company name or a job description to continue.")
    if payload.get("file") and not jd:
        raise InputError("No text was found in the file. Try pasting the job description.")
    if not api_key:
        raise InputError("Add your Gemini API key to continue.")
    research = payload.get("research") is True
    if research and not company:
        raise InputError("Add a company name to research it.")

    from generate import generate_email
    from google.genai import errors

    profile = str(payload.get("profile") or "").strip()[:MAX_PROFILE_CHARS]
    profile_distilled = payload.get("profile_distilled") is True
    distilled_update = None
    if not profile:
        raise InputError("Save your resume first.")

    try:
        if not profile_distilled:
            # Analyze the raw resume once; cache the result in the browser afterwards.
            from generate import distill_profile

            cleaned = distill_profile(profile, api_key=api_key)
            if cleaned:
                profile = cleaned[:MAX_PROFILE_CHARS]
                distilled_update = profile

        notes = ""
        if research:
            from research import research_company

            notes = research_company(company, role, api_key=api_key)

        variants = {}
        for recipient in RECIPIENT_ORDER:
            output = generate_email(
                profile=profile,
                notes=notes,
                role=role,
                recipient=recipient,
                name=name,
                jd=jd,
                company=company,
                api_key=api_key,
            )
            if not output:
                raise RuntimeError("The model returned an empty response.")
            variants[recipient] = parse_email(output)
    except errors.APIError as exc:
        raise GeminiError(gemini_error_message(exc.code, exc.status, exc.message)) from exc
    result = {"order": RECIPIENT_ORDER, "labels": RECIPIENT_LABELS, "variants": variants}
    if distilled_update is not None:
        # Browser caches this so the resume is never analyzed again.
        result["profile"] = distilled_update
    return result


def save_resume(payload: dict) -> dict:
    """Extract text from an uploaded resume. No API key needed.

    The resume is analyzed once later, on the first generate (which uses the key),
    and the cleaned profile is cached in the browser from then on.
    """
    if not isinstance(payload, dict) or not payload.get("file"):
        raise InputError("Choose a resume file to save.")
    text = extract_file(payload["file"])
    if not text:
        raise InputError("No text was found in that file. Try a different resume file.")
    name = str(payload["file"].get("name", "resume"))
    return {"text": text[:MAX_PROFILE_CHARS], "name": name}


def json_response(status: int, data: dict) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content=data,
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


@app.get("/health", include_in_schema=False)
def health() -> PlainTextResponse:
    return PlainTextResponse("ok")


async def read_json(request: Request) -> dict:
    if request.headers.get("content-type", "").split(";", 1)[0].lower() != "application/json":
        raise InputError("Send a JSON request.")
    length = request.headers.get("content-length")
    if length is not None:
        try:
            declared_length = int(length)
        except ValueError:
            raise InputError("Invalid request length.") from None
        if declared_length > MAX_REQUEST_BYTES:
            raise InputError("The request is too large. Use a file smaller than 3 MB.")
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_REQUEST_BYTES:
            raise InputError("The request is too large. Use a file smaller than 3 MB.")
    if not body:
        raise InputError("Send a JSON request.")
    try:
        return json.loads(body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise InputError("Send valid JSON.") from None


async def handle_json(request: Request, handler) -> JSONResponse:
    try:
        payload = await read_json(request)
        result = await asyncio.to_thread(handler, payload)
        return json_response(200, result)
    except InputError as exc:
        return json_response(400, {"error": str(exc)})
    except GeminiError as exc:
        traceback.print_exc()
        return json_response(502, {"error": str(exc)})
    except Exception:
        traceback.print_exc()
        return json_response(500, {"error": "Generation failed. Check the server log and try again."})


@app.post("/api/generate")
async def generate_route(request: Request) -> JSONResponse:
    return await handle_json(request, generate)


@app.post("/api/save-resume")
async def save_resume_route(request: Request) -> JSONResponse:
    return await handle_json(request, save_resume)


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("app:app", host="127.0.0.1", port=port)
