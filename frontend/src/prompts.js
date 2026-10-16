// All prompt text and parsing live in the browser now. Nothing here is secret;
// moving it client-side is what lets the app call Gemini directly, so the key and
// resume never pass through a server.

export const RECIPIENT_ORDER = ['founder', 'hr', 'engineer'];
export const RECIPIENT_LABELS = { founder: 'Founder', hr: 'Recruiter / HR', engineer: 'Engineer' };

// Tone references the writer studies as few-shot examples. Anonymized, no real names.
const STYLE_EXAMPLES = `# Style references (tone only, not to copy literally)

Generic, anonymized cold emails. No real person, founder, or company names.
Placeholders: {Name} = recipient, [Company] = the company, [role] = the role, [link] = resume/GitHub.

---

## Example: founder
Subjects:
1. Your agents, my last two years
2. Engineer who ships agents in prod
3. Quick fit for the [role] role

Hi {Name},

You are building [Company] around real production agents. That is exactly what I have spent
the last two years doing: agents with real tool access, human handoff, and the observability
to keep them from failing quietly.

That overlap is why I am reaching out. I would love to help build it with you.

Worth a short call?

[link]

---

## Example: engineer (referral ask)
Subjects:
1. One ask from an agents engineer
2. Fellow engineer, 20 seconds
3. Referral for the [role] role?

Hi {Name},

Short one. I build the same stack you work on, agents and RAG in production, and I would love
a shot at [Company].

Would you be open to referring me, or pointing me to the right person? Happy to send whatever helps.

My work: [link]

Thanks a lot,

---

## Example: hr
Subjects:
1. [role] with production agent experience
2. Backend and AI engineer for [role]
3. Strong fit for the [role] role

Hi {Name},

I build production AI agents and the systems that keep them reliable, which is a close match
for the [role] role.

The short version: multi-tool agents with human handoff, RAG pipelines, and evals, all running
in production today.

My work: [link]. I would love to be considered.

Thanks,`;

export const SYSTEM = `You write cold job-application emails for a software/AI engineer.

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
<the email body, starting with "Hi {name}," and ending with the signature>`;

export function buildUserPrompt({ profile, company, notes, jd, role, recipient, name }) {
  return `Style examples (tone, length, and opening punch only; do not copy their words or names):
${STYLE_EXAMPLES}

Candidate profile:
${profile}

Company name: ${company || '(unknown)'}

Company research notes (may be empty):
${notes || '(none)'}

Job description (use as the main source when provided):
${jd || '(none provided)'}

Role being applied for: ${role}
Recipient type: ${recipient}
Recipient name (use in greeting; if empty, use "there"): ${name || 'there'}

When a job description is provided, pick the one or two profile facts that best
match it. When only a company name is provided, write a concise exploratory note
about relevant work and interest in connecting, without claiming a specific opening
or pretending to know what the company does. Write the subjects and email now.`;
}

export const DISTILL_SYSTEM = `You turn a raw resume into a concise candidate profile used later to
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
the candidate, so preserve concrete, specific achievements.`;

export function buildResearchPrompt({ company, role }) {
  return `Research the company "${company}".

Produce short, factual notes a job applicant can use to write a cold email for a
${role} role. Use web search for current facts. Reply with plain prose only, no
preamble and no markdown headers. Cover:

- What the company does and its main product, in one or two sentences.
- The technology and engineering problems they work on.
- Who their customers are.
- Anything recent and relevant: funding, launches, direction.
- Founders or key leaders, with names, if findable.
- Two or three concrete reasons a ${role} candidate would be a strong fit.

Keep it tight. Facts only. If something is unknown, say so rather than guessing.`;
}

// Mirror of the Python parser: tolerant of EMAIL:, EMAILS:, or "The email:".
export function parseEmail(output) {
  const text = (output || '').trim();
  const match = text.match(/^[ \t]*(?:the\s+)?emails?\s*:\s*/im);
  if (!match) return { subjects: [], email: text };
  const splitAt = match.index;
  const subjectBlock = text.slice(0, splitAt);
  const subjects = subjectBlock
    .split('\n')
    .filter((line) => /^\s*\d+[.)]\s*\S/.test(line))
    .map((line) => line.replace(/^\s*\d+[.)]\s*/, '').trim())
    .slice(0, 3);
  const email = text.slice(splitAt + match[0].length).trim();
  return { subjects, email };
}

// Belt and suspenders: strip any em/en dashes the model slips in.
export function stripDashes(text) {
  return (text || '').replace(/—/g, ', ').replace(/–/g, '-').trim();
}
