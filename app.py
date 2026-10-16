"""Static file server for the Postscript single-page app.

All generation happens in the browser: the client calls Gemini directly with the
user's own key. This server only serves the built frontend. No API key, no resume,
and no user data ever reach it, and there is no endpoint that accepts any.
"""

import mimetypes
import os
import re
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import JSONResponse, PlainTextResponse, Response

HERE = Path(__file__).resolve().parent


def _find_web_root() -> Path:
    for candidate in (HERE / "public", HERE.parent / "public", Path.cwd() / "public", Path("/var/task/public")):
        if (candidate / "index.html").is_file():
            return candidate
    return HERE / "public"


WEB_ROOT = _find_web_root()
app = FastAPI(title="Postscript", description="Static host for the Postscript SPA")

# Serve JS/CSS with correct types; .mjs often has no system mapping and must not
# fall back to octet-stream or the browser refuses to run the module.
_EXPLICIT_TYPES = {
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".map": "application/json; charset=utf-8",
}


def json_response(status: int, data: dict) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content=data,
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


def static_asset(path: str) -> tuple[bytes, str] | None:
    """Serve the Vite entry point and files inside its assets directory."""
    if path == "/":
        filename = WEB_ROOT / "index.html"
    elif re.fullmatch(r"/assets/[A-Za-z0-9_.-]+", path):
        filename = WEB_ROOT / path.lstrip("/")
    else:
        return None
    if not filename.is_file():
        return None
    content_type = _EXPLICIT_TYPES.get(filename.suffix.lower())
    if content_type is None:
        content_type = mimetypes.guess_type(filename.name)[0] or "application/octet-stream"
        if content_type.startswith("text/"):
            content_type += "; charset=utf-8"
    return filename.read_bytes(), content_type


def serve_asset(path: str) -> Response:
    asset = static_asset(path)
    if asset is None:
        return json_response(404, {"error": "Not found."})
    body, content_type = asset
    return Response(content=body, media_type=content_type, headers={"X-Content-Type-Options": "nosniff"})


@app.get("/", include_in_schema=False)
def index() -> Response:
    return serve_asset("/")


@app.get("/assets/{filename}", include_in_schema=False)
def built_asset(filename: str) -> Response:
    return serve_asset(f"/assets/{filename}")


@app.get("/health", include_in_schema=False)
def health() -> PlainTextResponse:
    return PlainTextResponse("ok")


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("app:app", host="127.0.0.1", port=port)
