"""Research step: ask Gemini (with Google Search grounding) for notes on a company.

Uses the same Gemini key as the writer, so there is only one provider and one key.
Google Search grounding lets Gemini pull current facts on its own.
"""

import os

from google import genai
from google.genai import types

# The model is chosen in the app and passed through. This is only the fallback for
# the CLI and for requests that omit a model. "flash" tiers handle grounded lookups well.
DEFAULT_MODEL = "gemini-3.5-flash-lite"

PROMPT = """Research the company "{company}"{site}.

Produce short, factual notes a job applicant can use to write a cold email for a
{role} role. Use web search for current facts. Reply with plain prose only, no
preamble and no markdown headers. Cover:

- What the company does and its main product, in one or two sentences.
- The technology and engineering problems they work on.
- Who their customers are.
- Anything recent and relevant: funding, launches, direction.
- Founders or key leaders, with names, if findable.
- Two or three concrete reasons a {role} candidate would be a strong fit.

Keep it tight. Facts only. If something is unknown, say so rather than guessing."""


def research_company(company: str, role: str, website: str | None = None, api_key: str = "", model: str = "") -> str:
    client = genai.Client(api_key=api_key or os.environ.get("GEMINI_API_KEY"))
    site = f" (website: {website})" if website else ""
    prompt = PROMPT.format(company=company, role=role, site=site)
    try:
        response = client.models.generate_content(
            model=model or DEFAULT_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
            ),
        )
    finally:
        client.close()
    return (response.text or "").strip()


if __name__ == "__main__":
    import sys

    company = sys.argv[1] if len(sys.argv) > 1 else "Example Co"
    role = sys.argv[2] if len(sys.argv) > 2 else "AI Engineer"
    print(research_company(company, role))
