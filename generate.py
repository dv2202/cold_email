"""Writing step: Gemini turns research notes + profile + JD into a cold email.

Style rules (short, no em dashes, human, [link] placeholder) and the
deliverability guidance are baked into the prompt so output stays out of spam.
"""

import os

from google import genai

# He mentioned a "flash lite" model. 2.5 Flash-Lite is the real id as of now;
# override with GEMINI_MODEL if the account has a newer one (e.g. gemini-3-flash-lite).
MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash-lite")

SYSTEM = """You write cold job-application emails for a software/AI engineer.

Keep it short and make people want to reply.

Body rules, never break:
- Short. Aim for 60 to 100 words. Shorter beats longer.
- Open with a punchy, specific first line that earns the next line. Never open with
  "I am writing to apply", "I am reaching out", or "I am a software engineer with".
  Lead with the single strongest, most relevant thing, or a sharp line about the company.
- No em dashes, ever. Use a period or "and".
- Human and plain. No corporate jargon, no buzzword stacking, no hype.
- Leave the literal token [link] where the resume/GitHub link goes. Never invent a URL.
- Honest. Only use facts from the candidate profile. Never claim a skill not listed there.
- Personalize using only company or job details actually provided. If there is no job
  description, stay honest and broadly relevant. Do not invent products, openings, or hiring plans.
- One clear, low-pressure ask. End with a simple first-name signature.

Subject rules, never break:
- Catchy and specific, under 50 characters. Make the reader curious or signal a clear fit.
- NEVER put the candidate's name (first or full) in a subject line. It is generic, not personal.
- No generic filler like "Job application" alone. No clickbait, no all-caps, no exclamation marks.

Deliverability (keep it out of spam):
- Plain text only. No images, no tracking, exactly one link ([link]).
- Avoid spam-trigger words: free, guarantee, act now, limited time, risk-free, urgent.

Match the recipient:
- founder: lead with what the candidate builds and why it maps to their product; ask for a short call.
- engineer: fellow-engineer tone; ask for a referral or a pointer to the right person.
- hr: plainest; signal the role fit in one or two lines, ask to be considered.

Study the style examples for tone, length, and opening punch. Do NOT copy their words,
companies, or names. Write fresh from the real profile and job description.

Output exactly this structure and nothing else. Use these exact headers, including the
singular word EMAIL (never EMAILS), each on its own line:

SUBJECTS:
1. <subject under 50 chars, no candidate name>
2. <subject under 50 chars, no candidate name>
3. <subject under 50 chars, no candidate name>

EMAIL:
<the email body, starting with "Hi {name}," and ending with the signature>"""

USER = """Style examples (tone, length, and opening punch only; do not copy their words or names):
{examples}

Candidate profile:
{profile}

Company name: {company}

Company research notes (may be empty):
{notes}

Job description (use as the main source when provided):
{jd}

Role being applied for: {role}
Recipient type: {recipient}
Recipient name (use in greeting; if empty, use "there"): {name}

When a job description is provided, pick the one or two profile facts that best
match it. When only a company name is provided, write a concise exploratory note
about relevant work and interest in connecting, without claiming a specific opening
or pretending to know what the company does. Write the subjects and email now."""


def _load_examples() -> str:
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "style_examples.md")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except OSError:
        return "(none)"


def generate_email(
    profile: str,
    notes: str,
    role: str,
    recipient: str = "hr",
    name: str = "",
    jd: str = "",
    company: str = "",
    api_key: str = "",
) -> str:
    client = genai.Client(api_key=api_key or os.environ.get("GEMINI_API_KEY"))
    prompt = USER.format(
        examples=_load_examples(),
        profile=profile,
        company=company or "(unknown)",
        notes=notes or "(none)",
        jd=jd or "(none provided)",
        role=role,
        recipient=recipient,
        name=name or "there",
    )
    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=prompt,
            config={"system_instruction": SYSTEM},
        )
    finally:
        client.close()
    text = response.text or ""
    # Belt and suspenders: strip any em/en dashes the model slips in.
    return text.replace("—", ", ").replace("–", "-").strip()


DISTILL_SYSTEM = """You turn a raw resume into a concise candidate profile used later to
write cold job emails. Extract only what the resume actually says. Never invent facts,
numbers, employers, or skills.

Never assume, guess, or insert placeholders. If a detail is not in the resume, leave it
out entirely. Never write parentheticals like "(assumed)" or "(not provided)".

Output plain text, no preamble, under 350 words, with these sections (omit any section,
and any line, the resume does not support):

- Name and contact: only the name, email, phone, or links that literally appear.
- Summary: one or two lines on who they are and years of experience.
- Experience: for each role, one line "Title, Company (dates):" then 2 to 3 short bullets
  of what they built or achieved, keeping any real metrics.
- Skills: grouped simply (languages, backend, frontend, cloud and data, AI), using only
  terms that appear in the resume.
- Projects: name and one line each, if any.

Keep it tight and factual. This profile is the only thing the email writer will know about
the candidate, so preserve concrete, specific achievements."""


def distill_profile(resume_text: str, api_key: str = "", model: str | None = None) -> str:
    """One-time analysis: raw resume text in, clean structured profile out."""
    client = genai.Client(api_key=api_key or os.environ.get("GEMINI_API_KEY"))
    prompt = f"Raw resume text:\n\n{resume_text}\n\nProduce the candidate profile now."
    try:
        response = client.models.generate_content(
            model=model or MODEL,
            contents=prompt,
            config={"system_instruction": DISTILL_SYSTEM},
        )
    finally:
        client.close()
    text = response.text or ""
    return text.replace("—", ", ").replace("–", "-").strip()
