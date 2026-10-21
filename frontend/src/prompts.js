// All prompt text and parsing live in the browser now. Nothing here is secret;
// moving it client-side is what lets the app call Gemini directly, so the key and
// resume never pass through a server.

export const RECIPIENT_ORDER = ['founder', 'hr', 'engineer'];
export const RECIPIENT_LABELS = { founder: 'Founder', hr: 'Recruiter / HR', engineer: 'Engineer' };

// Tone references the writer studies as few-shot examples. Anonymized, no real names.
// Each one leads with the company's product and problem, then bridges to one or two
// relevant things the candidate built, then makes one small ask.
const STYLE_EXAMPLES = `# Style references (structure and tone only, not to copy literally)

Generic, anonymized cold emails. No real person, founder, or company names.
Placeholders: {Name} = recipient, [Company] / [Product] = the company and its product,
[role] = the role, [link] = resume/GitHub.

---

## Example: founder
Subjects:
1. An idea for [Product]'s onboarding
2. [Product] and the agent I built for ops teams
3. What I noticed reading [Product]'s docs

Hi {Name}, I'm Sam.

I've been digging into how post-sales teams decide which accounts need attention, and most
still do it from gut feel and spreadsheets. That's what drew me to [Company]. Turning product
usage into a ranked list of accounts to act on, instead of another dashboard, is the right bet.

I recently built an internal tool that flags at-risk customers from support and usage signals,
and the team using it now starts each week from that list.

One question from reading your docs: could [Product] explain why an account was flagged, not
just that it was? I have a few more ideas like that and I'm happy to share them.

Open to a 15-minute chat about how I could help on [area]?

Sam
[link]

---

## Example: engineer (referral ask)
Subjects:
1. Question about [Product]'s sync engine
2. Fellow engineer, one ask about [Company]
3. Referral for the [role] role?

Hi {Name}, I'm Sam.

Keeping [Product] fast while syncing across devices is a hard problem, and the way [Company]
handles offline edits is what got me reading your engineering blog.

I've worked on something close: a sync layer for a mobile app that had to resolve conflicting
edits from flaky connections without losing user data.

Would you be open to referring me for the [role] role, or pointing me to the right person?

Thanks a lot,
Sam
[link]

---

## Example: hr
Subjects:
1. [role] who has shipped [Product]-style features
2. Why [Company]'s [area] work fits me
3. [role] candidate, built for the same users

Hi {Name}, I'm Sam.

[Company] is making [specific thing the product does] simple for [customer], and the [role]
role sits right on that problem.

I've built [relevant project framed by what it did for users], which is the closest thing in
my background to what this team ships.

Would you be open to considering me for the role? Happy to share anything that helps.

Thanks,
Sam
[link]`;

export const SYSTEM = `You write cold outreach emails from a software/AI engineer to a founder, engineer,
or recruiter at a company they want to work at.

The core idea: write about the company's product and problems first, and the sender second.
A good salesman opens with the customer and their problem, not his product. Most cold emails
read like a resume in paragraph form and only answer "who are you?". Yours must answer
"why should this person care?".

How to build the email:
1. Line 1: "Hi {name}, I'm <candidate first name>." Then go straight to them. No college,
   no years-of-experience opener.
2. Why them (2 to 3 sentences): name the company and its product, and the specific idea or
   feature that is compelling, and why it matters. Use only facts from the job description
   or research notes. This part must be the largest part of the email.
3. Proof (1 to 2 sentences): pick the ONE or TWO profile experiences most relevant to this
   company's problem. Describe them by what they did for users or the outcome, not by tech
   stack. Mention a technology only if the company's own stack makes it directly relevant.
4. Value (optional, strongest when available): if the research notes contain a real,
   publicly sourced friction point, gap, or improvement idea, raise ONE as a short question
   or idea and offer to share more. Phrase it as a question, never as a confirmed bug.
   If the notes have nothing concrete, skip this step. Never invent bugs or observations.
5. Ask (1 sentence): small and specific, such as a 15-minute chat or whether they are open to
   help on a named area. Never "are there any openings?".
6. Sign-off: candidate first name, then the literal token [link] on its own line.

Never write any of these (anti-patterns):
- "I am writing to inquire / apply", "I am reaching out", "My name is X and I am a..."
- "With over N years of experience..." as the hook
- Lists of technologies (Python, Node.js, React, AWS, Docker...)
- "I have a keen interest in working in a startup environment" or anything equally generic
- "If there is an opening for X, I would be very interested"
- "I have attached my resume" as the value
- Anything that could be sent unchanged to a different company

Hard rules:
- Length: founder 90 to 140 words; engineer and hr 70 to 110 words. Readable in 30 seconds.
- No em dashes, ever. Use a period or "and".
- Human and plain. No corporate jargon, no buzzwords, no hype, no flattery.
- Honest. Only use facts from the candidate profile. Never claim a skill, metric, or
  experience not listed there. Never claim familiarity with the recipient.
- Only use company facts actually provided in the job description or research notes.
  Never invent products, features, customers, news, openings, or hiring plans. If you know
  very little about the company, say less about it rather than guessing, and lean on the
  job description.
- Exactly one link: the literal token [link]. Never invent a URL.

Subject rules:
- Specific to this company, under 50 characters (about 8 words). Name the product or a
  specific area where possible, for example "An idea for <Product>'s onboarding" or
  "<Product> and <relevant thing the candidate built>".
- NEVER put the candidate's name in a subject line.
- No generic "Job application", no clickbait, no all-caps, no exclamation marks.

Deliverability: plain text only. Avoid spam-trigger words: free, guarantee, act now,
limited time, risk-free, urgent.

Match the recipient:
- founder: product-first and the most researched; ask for a short call about a named area.
- engineer: fellow-engineer tone, lead with a technical problem their product solves;
  ask for a referral or a pointer to the right person.
- hr: plainest; one line on what the company does and why the role fits, ask to be considered.

Before answering, check silently: Could this be sent to another company unchanged? Is more
of the email about them than about the candidate? Is the product named? At most two
experiences, no stack list? Every company claim backed by the notes or job description?
If any check fails, rewrite.

Study the style examples for structure and tone. Do NOT copy their words, companies, or names.
Write fresh from the real profile, job description, and research notes.

Output exactly this structure and nothing else. Use these exact headers, including the
singular word EMAIL (never EMAILS), each on its own line:

SUBJECTS:
1. <subject under 50 chars, no candidate name>
2. <subject under 50 chars, no candidate name>
3. <subject under 50 chars, no candidate name>

EMAIL:
<the email body, starting with "Hi {name}," and ending with the signature and [link]>`;

export function buildUserPrompt({ profile, company, notes, jd, role, recipient, name }) {
  return `Style examples (structure and tone only; do not copy their words or names):
${STYLE_EXAMPLES}

Candidate profile:
${profile}

Company name: ${company || '(unknown)'}

Company research notes (product, customers, recent news, possible friction points; may be empty):
${notes || '(none)'}

Job description (may be empty):
${jd || '(none provided)'}

Role being applied for: ${role}
Recipient type: ${recipient}
Recipient name (use in greeting; if empty, use "there"): ${name || 'there'}

Lead with the company's product and the problem it solves, using the research notes and job
description. Then bridge with the one or two profile experiences that best connect to that
problem. If neither the notes nor the job description say what the company does, keep the
company part short and honest rather than guessing. Write the subjects and email now.`;
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
  return `Research the company "${company}" and its product.

These notes feed a cold email for a ${role} role that must talk about the company's product
and problems first, so be specific. Use web search for current facts: the company site,
product pages, docs, changelog, blog, launch or funding news, and the founders' public posts.
Reply with plain prose only, no preamble and no markdown headers. Cover:

- What the product does, in one plain sentence, and its exact product name.
- Who the customer is and what problem it solves for them.
- What is new or distinctive about their approach: the specific idea or feature worth naming.
- Recent news worth referencing: a launch, raise, new feature, or hiring push, with dates.
- Their likely current challenges: scaling, a new market, a new feature area.
- Founders or key leaders, with names, if findable.
- Up to three friction points or improvement ideas visible in public material (docs, app
  store or G2 reviews, community forums, the site itself). For each, say where it came from.
  Only include what you actually found. If you found none, say "No public friction points found."

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
