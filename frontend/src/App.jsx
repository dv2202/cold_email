import { useEffect, useRef, useState } from 'react';

const KEY = 'cold_email_gemini_key';
const PROFILE = 'cold_email_profile';
const PROFILE_NAME = 'cold_email_profile_name';
const PROFILE_DISTILLED = 'cold_email_profile_distilled';
const ACCEPTED = ['txt', 'md', 'pdf', 'docx'];
const MAX_FILE = 5 * 1024 * 1024;
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const apiUrl = (path) => `${API_BASE_URL}${path}`;

function stored(key) {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
function save(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Private browsing may block storage. */ }
}
function remove(key) {
  try { localStorage.removeItem(key); } catch { /* Nothing to remove. */ }
}
function validateFile(file) {
  if (!file) return 'Choose a file first.';
  if (!ACCEPTED.includes(file.name.split('.').pop().toLowerCase())) return 'Choose a TXT, MD, PDF, or DOCX file.';
  if (file.size > MAX_FILE) return 'Choose a file smaller than 5 MB.';
  return '';
}
function fileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.readAsDataURL(file);
  });
}

function Icon({ name, className = 'h-5 w-5' }) {
  const paths = {
    arrow: <><path d="M4 16 16 4M6 4h10v10" /></>,
    upload: <><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" /><path d="M4 16.5v2A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-2" /></>,
    copy: <><rect x="7" y="5" width="12" height="15" rx="2" /><path d="M16 5V4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h2" /></>,
    check: <path d="m4 12 5 5L20 6" />,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M7 10V7a5 5 0 0 1 10 0v3" /></>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Field({ label, hint, children, className = '' }) {
  return <div className={className}><div className="mb-2 flex flex-wrap items-baseline justify-between gap-2"><label className="text-sm font-semibold text-ink">{label}</label>{hint && <span className="text-[10px] font-bold tracking-[0.13em] text-muted uppercase">{hint}</span>}</div>{children}</div>;
}

const inputClass = 'w-full rounded-xl border border-[#dedfd7] bg-white px-4 py-3.5 text-sm text-ink outline-none transition placeholder:text-[#a2aaa2] focus:border-leaf focus:ring-3 focus:ring-leaf/10';
const smallButton = 'rounded-lg border border-[#dce1d8] bg-white px-3.5 py-2 text-xs font-bold text-ink transition hover:border-leaf hover:text-leaf disabled:opacity-50';

export default function App() {
  const [savedKey, setSavedKey] = useState(() => stored(KEY));
  const [keyInput, setKeyInput] = useState(() => stored(KEY));
  const [editingKey, setEditingKey] = useState(() => !stored(KEY));
  const [showKey, setShowKey] = useState(false);
  const [keyMessage, setKeyMessage] = useState('');
  const [profile, setProfile] = useState(() => stored(PROFILE));
  const [profileName, setProfileName] = useState(() => stored(PROFILE_NAME));
  const [editingResume, setEditingResume] = useState(() => !stored(PROFILE));
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeMessage, setResumeMessage] = useState('');
  const [savingResume, setSavingResume] = useState(false);
  const [setupOpen, setSetupOpen] = useState(() => !stored(KEY) || !stored(PROFILE));
  const [company, setCompany] = useState('');
  const [jd, setJd] = useState('');
  const [jdFile, setJdFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [role, setRole] = useState('AI Engineer');
  const [name, setName] = useState('');
  const [research, setResearch] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [recipient, setRecipient] = useState('founder');
  const [subjectIndex, setSubjectIndex] = useState(0);
  const [copied, setCopied] = useState('');
  const jdFileRef = useRef(null);
  const resumeFileRef = useRef(null);
  const keyRef = useRef(null);
  const resultRef = useRef(null);

  const ready = Boolean(savedKey && profile);
  const setupStatus = ready ? 'Gemini key and resume ready' : savedKey ? 'Add your resume to continue' : profile ? 'Add your Gemini key to continue' : 'Add your Gemini key and resume';
  const order = result?.order || Object.keys(result?.variants || {});
  const variant = result?.variants?.[recipient];
  const subjects = variant?.subjects || [];

  useEffect(() => {
    if (result && window.matchMedia('(max-width: 940px)').matches) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [result]);

  function keepKey() {
    const value = keyInput.trim();
    if (!value) { setKeyMessage('Paste your Gemini API key, then save it.'); keyRef.current?.focus(); return; }
    save(KEY, value);
    setSavedKey(value);
    setEditingKey(false);
    setKeyMessage('');
    if (profile) setSetupOpen(false);
  }

  function chooseResume(file) {
    const message = validateFile(file);
    setResumeMessage(message);
    setResumeFile(message ? null : file);
  }

  async function keepResume() {
    if (!resumeFile) { setResumeMessage('Choose a resume file first.'); return; }
    setSavingResume(true);
    setResumeMessage('');
    try {
      const content = await fileAsBase64(resumeFile);
      const response = await fetch(apiUrl('/api/save-resume'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: { name: resumeFile.name, content } }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not read that resume.');
      save(PROFILE, data.text);
      save(PROFILE_NAME, data.name);
      remove(PROFILE_DISTILLED);
      setProfile(data.text);
      setProfileName(data.name);
      setResumeFile(null);
      setEditingResume(false);
      if (savedKey) setSetupOpen(false);
    } catch (err) { setResumeMessage(err.message || 'Could not read that resume.'); }
    finally { setSavingResume(false); }
  }

  function clearResume() {
    [PROFILE, PROFILE_NAME, PROFILE_DISTILLED].forEach(remove);
    setProfile('');
    setProfileName('');
    setResumeFile(null);
    setEditingResume(true);
    setSetupOpen(true);
  }

  function chooseJd(file) {
    const message = validateFile(file);
    setError(message);
    setJdFile(message ? null : file);
  }

  async function generate(event) {
    event.preventDefault();
    setError('');
    if (!savedKey) { setError('Save your Gemini API key first.'); setEditingKey(true); setSetupOpen(true); keyRef.current?.focus(); return; }
    if (!profile) { setError('Save your resume first.'); setEditingResume(true); setSetupOpen(true); return; }
    if (!company.trim() && !jd.trim() && !jdFile) { setError('Add a company name or a job description to continue.'); return; }
    if (research && !company.trim()) { setError('Add a company name to research it.'); return; }
    setBusy(true);
    try {
      const payload = { api_key: savedKey, profile, profile_distilled: stored(PROFILE_DISTILLED) === '1', company: company.trim(), job_description: jd.trim(), role: role.trim(), name: name.trim(), research };
      if (jdFile) payload.file = { name: jdFile.name, content: await fileAsBase64(jdFile) };
      const response = await fetch(apiUrl('/api/generate'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not generate your emails.');
      if (data.profile) { save(PROFILE, data.profile); save(PROFILE_DISTILLED, '1'); setProfile(data.profile); }
      setResult(data);
      setRecipient((data.order || Object.keys(data.variants || {}))[0] || 'founder');
      setSubjectIndex(0);
    } catch (err) { setError(err.message || 'Could not generate your emails.'); }
    finally { setBusy(false); }
  }

  async function copy(value, kind) {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); setCopied(kind); window.setTimeout(() => setCopied(''), 1700); }
    catch { setError('Could not copy automatically. Select and copy the text above.'); }
  }

  return <div className="min-h-screen font-sans">
    <div className="mx-auto max-w-[1400px] px-5 sm:px-8 lg:px-12">
      <header className="flex h-20 items-center justify-between gap-4 border-b border-[#dce1d9]">
        <a href="/" className="flex items-center gap-2.5 text-[21px] font-bold tracking-[-0.055em] text-ink" aria-label="Postscript home"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink font-display text-[26px] font-normal leading-none text-white">p<span className="text-coral">.</span></span>postscript<span className="-ml-2 text-coral">.</span></a>
        <div className="hidden items-center gap-2 text-xs font-medium text-muted sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#75a787]" /> Your personal cold email studio</div>
        <span className="hidden text-[10px] font-bold tracking-[0.16em] text-muted uppercase lg:block">Write with intention ↗</span>
      </header>

      <main>
        <section className="max-w-3xl py-12 sm:py-16"><p className="mb-5 flex items-center gap-3 text-[11px] font-bold tracking-[0.19em] text-leaf uppercase"><span className="h-px w-8 bg-leaf" /> Your outreach workspace</p><h1 className="font-display text-[clamp(3.1rem,6vw,5.6rem)] leading-[1.04] tracking-[-0.045em]">Make the first <em className="font-normal text-coral">hello</em> count.</h1><p className="mt-5 max-w-xl text-base leading-7 text-[#68776c] sm:text-lg">Turn a company or job description into three thoughtful emails, each ready to make your own.</p></section>

        <div className="grid items-start gap-6 pb-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.93fr)]">
          <section className="overflow-hidden rounded-[24px] border border-[#e0e4dc] bg-white shadow-[0_20px_60px_rgba(38,59,43,0.05)]" aria-labelledby="form-title">
            <div className="flex items-start justify-between border-b border-[#edf0e9] px-6 py-6 sm:px-8"><div><p className="text-[11px] font-bold tracking-[0.17em] text-coral uppercase">01 <span className="text-muted">/ Compose</span></p><h2 id="form-title" className="mt-2 font-display text-[28px] tracking-[-0.02em]">Tell us about the role</h2></div><span className="text-3xl text-coral" aria-hidden="true">✳</span></div>
            <form id="email-form" onSubmit={generate} className="space-y-6 px-6 py-7 sm:px-8">
              <div className="overflow-hidden rounded-2xl border border-[#dfe6da] bg-[#f8faf6]"><button type="button" onClick={() => setSetupOpen(!setupOpen)} aria-expanded={setupOpen} className="flex w-full items-center gap-3 px-4 py-4 text-left"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e8eee5] text-leaf">✳</span><span className="flex-1"><strong className="block text-sm">Personal setup</strong><small className="mt-0.5 block text-xs text-muted">{setupStatus}</small></span><span className={`text-xl text-muted transition ${setupOpen ? 'rotate-180' : ''}`}>⌄</span></button>
                {setupOpen && <div className="space-y-5 border-t border-[#e2e8de] px-4 py-5">
                  {editingKey ? <Field label="Gemini API key" hint="Stored in this browser"><div className="flex gap-2"><div className="relative min-w-0 flex-1"><input ref={keyRef} className={`${inputClass} pr-14`} type={showKey ? 'text' : 'password'} value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="Paste your Gemini API key" autoComplete="off" spellCheck="false" /><button type="button" onClick={() => setShowKey(!showKey)} className="absolute inset-y-0 right-3 text-xs font-bold text-leaf">{showKey ? 'Hide' : 'Show'}</button></div><button type="button" onClick={keepKey} className={smallButton}>Save</button></div>{keyMessage && <p role="alert" className="mt-2 text-xs text-[#b45242]">{keyMessage}</p>}</Field> : <div className="flex flex-wrap items-center gap-3"><span className="flex flex-1 items-center gap-2 text-sm text-leaf"><Icon name="check" className="h-4 w-4" /> Gemini key saved in this browser</span><button type="button" onClick={() => { setKeyInput(savedKey); setEditingKey(true); }} className="text-xs font-bold text-leaf underline underline-offset-4">Change</button></div>}
                  <div className="border-t border-[#e3e8e0]" />
                  {editingResume ? <Field label="Your resume" hint="Stored in this browser"><input ref={resumeFileRef} type="file" accept=".txt,.md,.pdf,.docx" className="hidden" onChange={e => chooseResume(e.target.files?.[0])} /><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => resumeFileRef.current?.click()} className={smallButton}>Choose resume</button><span className="min-w-0 flex-1 truncate text-xs text-muted">{resumeFile?.name || 'No file chosen'}</span><button type="button" disabled={!resumeFile || savingResume} onClick={keepResume} className={smallButton}>{savingResume ? 'Saving…' : 'Save'}</button></div><p className="mt-2 text-xs text-muted">PDF, DOCX, TXT or MD · up to 5 MB</p>{resumeMessage && <p role="alert" className="mt-2 text-xs text-[#b45242]">{resumeMessage}</p>}</Field> : <div className="flex flex-wrap items-center gap-3"><span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-leaf"><Icon name="check" className="h-4 w-4 shrink-0" /><span className="truncate">Resume saved {profileName && `(${profileName})`}</span></span><button type="button" onClick={() => setEditingResume(true)} className="text-xs font-bold text-leaf underline underline-offset-4">Replace</button><button type="button" onClick={clearResume} className="text-xs font-bold text-[#b45242] underline underline-offset-4">Remove</button></div>}
                </div>}
              </div>

              <Field label="Company name" hint="Or add a JD below"><input className={inputClass} value={company} onChange={e => setCompany(e.target.value)} maxLength={150} autoComplete="organization" placeholder="e.g. Linear, Anthropic, Stripe..." /></Field>
              <Field label="Job description" hint="Paste or upload"><textarea className={`${inputClass} min-h-44 resize-y`} value={jd} onChange={e => setJd(e.target.value)} maxLength={60000} placeholder="Paste the job description here. The more detail you share, the more tailored your email will be." /></Field>
              <div onDragEnter={e => { e.preventDefault(); setDragging(true); }} onDragOver={e => e.preventDefault()} onDragLeave={e => { e.preventDefault(); setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); chooseJd(e.dataTransfer.files?.[0]); }} className={`flex items-center gap-4 rounded-2xl border border-dashed px-4 py-4 transition ${dragging ? 'border-leaf bg-[#edf4e9]' : 'border-[#cbd8c8] bg-[#f8faf7] hover:border-leaf'}`}><input ref={jdFileRef} type="file" accept=".txt,.md,.pdf,.docx" className="hidden" onChange={e => chooseJd(e.target.files?.[0])} /><button type="button" onClick={() => jdFileRef.current?.click()} className="flex min-w-0 flex-1 items-center gap-4 text-left"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#e8efe7] text-leaf"><Icon name="upload" /></span><span className="min-w-0"><strong className="block truncate text-sm font-semibold">{jdFile ? jdFile.name : <>Drop a JD here, or <span className="text-leaf underline underline-offset-2">browse files</span></>}</strong><small className="mt-1 block text-xs text-muted">PDF, DOCX, TXT or MD · up to 5 MB</small></span></button>{jdFile && <button type="button" onClick={() => { setJdFile(null); if (jdFileRef.current) jdFileRef.current.value = ''; }} aria-label="Remove uploaded job description" className="rounded-full px-2 text-xl text-muted hover:text-ink">×</button>}</div>

              <div className="grid gap-5 border-t border-[#e9ede7] pt-6 sm:grid-cols-2"><Field label="Role you're interested in"><input className={inputClass} value={role} onChange={e => setRole(e.target.value)} maxLength={150} /></Field><Field label="Their first name" hint="If you know it"><input className={inputClass} value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="e.g. Alex" /></Field></div>
              <p className="-mt-2 text-xs leading-5 text-muted">We draft all three versions for a founder, recruiter, and engineer, so you can pick the best fit.</p>
              <label className="flex cursor-pointer items-center gap-4 rounded-2xl border border-[#e3e8de] bg-[#fafbf9] px-4 py-4"><span className="flex-1"><strong className="block text-sm">Research the company first</strong><small className="mt-1 block text-xs leading-5 text-muted">Lets Gemini search the web for more specific context. Adds a little time.</small></span><input type="checkbox" checked={research} onChange={e => setResearch(e.target.checked)} className="h-5 w-5 accent-leaf" /></label>
              {error && <p role="alert" className="rounded-xl border border-[#edc9be] bg-[#fff4f0] px-4 py-3 text-sm text-[#a54334]">{error}</p>}
              <button disabled={busy} type="submit" className="flex w-full items-center justify-between rounded-xl bg-ink px-5 py-4 text-sm font-bold text-white transition hover:bg-[#344d3b] disabled:opacity-65"><span>{busy ? 'Writing your emails…' : 'Generate my emails'}</span>{busy ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Icon name="arrow" className="h-5 w-5" />}</button>
              <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted"><Icon name="lock" className="h-3.5 w-3.5" /> Your key is saved in this browser and sent to Gemini through the API.</p>
            </form>
          </section>

          <section ref={resultRef} className="flex min-h-[620px] flex-col overflow-hidden rounded-[24px] border border-[#e0e4dc] bg-white shadow-[0_20px_60px_rgba(38,59,43,0.05)]" aria-labelledby="result-title">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#edf0e9] px-6 py-6 sm:px-8"><div><p className="text-[11px] font-bold tracking-[0.17em] text-coral uppercase">02 <span className="text-muted">/ The draft</span></p><h2 id="result-title" className="mt-2 font-display text-[28px] tracking-[-0.02em]">Your emails, ready to copy</h2></div><span aria-live="polite" className={`rounded-full px-2.5 py-1 text-[10px] font-bold tracking-[0.1em] uppercase ${busy ? 'bg-[#fff0df] text-[#a6681d]' : result ? 'bg-[#e9f2e9] text-leaf' : 'bg-[#f1f3ef] text-muted'}`}>{busy ? 'Writing your emails' : result ? 'Drafts ready' : 'Waiting for input'}</span></div>
            {busy ? <div className="flex flex-1 flex-col items-center justify-center px-8 py-20 text-center"><div className="mb-8 h-12 w-12 animate-spin rounded-full border-4 border-[#e3e9df] border-t-leaf" /><h3 className="font-display text-3xl">Finding the right words...</h3><p className="mt-3 max-w-xs text-sm leading-6 text-muted">{research ? 'Researching the company, then writing all three drafts.' : 'Matching your experience to the opportunity.'}</p></div> : result ? <div className="flex-1 px-6 py-7 sm:px-8"><div role="tablist" aria-label="Choose who the email is for" className="flex flex-wrap gap-2 border-b border-[#e9ede7] pb-4">{order.map(person => <button key={person} type="button" role="tab" aria-selected={recipient === person} onClick={() => { setRecipient(person); setSubjectIndex(0); }} className={`rounded-full px-4 py-2 text-xs font-bold transition ${recipient === person ? 'bg-ink text-white' : 'bg-[#f2f5f0] text-muted hover:text-ink'}`}>{result.labels?.[person] || person}</button>)}</div><div className="mt-7 flex items-center justify-between gap-3"><h3 className="text-[11px] font-bold tracking-[0.16em] text-muted uppercase">Pick a subject line</h3><button type="button" onClick={() => copy(subjects[subjectIndex], 'subject')} disabled={!subjects.length} className="text-xs font-bold text-leaf hover:underline disabled:opacity-50">{copied === 'subject' ? 'Copied!' : 'Copy selected ↗'}</button></div><div role="radiogroup" aria-label="Subject line options" className="mt-3 space-y-2">{subjects.length ? subjects.map((subject, index) => <button type="button" key={`${recipient}-${index}`} role="radio" aria-checked={subjectIndex === index} onClick={() => setSubjectIndex(index)} className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left text-sm transition ${subjectIndex === index ? 'border-leaf bg-[#f2f7ef]' : 'border-[#e4e8e1] hover:border-[#b5c7b4]'}`}><span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${subjectIndex === index ? 'border-leaf' : 'border-[#b7c4b8]'}`}>{subjectIndex === index && <span className="h-2 w-2 rounded-full bg-leaf" />}</span>{subject}</button>) : <p className="rounded-xl bg-[#f6f7f3] p-4 text-sm text-muted">No subject lines were returned. Try generating again.</p>}</div><div className="mt-8 flex items-center justify-between gap-3"><h3 className="text-[11px] font-bold tracking-[0.16em] text-muted uppercase">The email</h3><button type="button" onClick={() => copy(variant?.email, 'email')} className="flex items-center gap-1.5 text-xs font-bold text-leaf hover:underline"><Icon name="copy" className="h-3.5 w-3.5" />{copied === 'email' ? 'Copied!' : 'Copy email'}</button></div><div className="mt-3 rounded-2xl border border-[#e6e9e3] bg-[#fcfcfa] p-5 sm:p-6"><pre className="whitespace-pre-wrap wrap-break-word font-sans text-sm leading-7 text-[#35443a]">{variant?.email || ''}</pre></div></div> : <div className="flex flex-1 flex-col items-center justify-center px-8 py-20 text-center"><div className="relative mb-9 flex h-40 w-44 items-center justify-center"><span className="absolute inset-3 rounded-full bg-[#eff4ea]" /><span className="absolute top-3 right-4 text-2xl text-coral">✳</span><div className="absolute top-7 h-26 w-24 rotate-[-8deg] rounded-lg border border-[#dce5d5] bg-white p-4 shadow-sm"><span className="block h-1 w-11 rounded bg-[#cad9c8]" /><span className="mt-3 block h-1 w-14 rounded bg-[#e1e9dd]" /><span className="mt-3 block h-1 w-9 rounded bg-[#e1e9dd]" /></div><div className="absolute bottom-4 h-19 w-33 rounded-lg border border-[#d3dfcf] bg-[#dce9d8] shadow-md"><div className="mx-auto h-12 w-24 rotate-45 border-r border-b border-[#c6d7c3] bg-[#e7f0e3]" /></div></div><h3 className="font-display text-[32px] leading-tight">Good conversations<br /><em className="text-coral">start somewhere.</em></h3><p className="mt-4 max-w-xs text-sm leading-6 text-muted">Add a company or job description and your tailored drafts will appear here.</p></div>}
            <div className="mt-auto flex flex-wrap justify-between gap-3 border-t border-[#edf0e9] px-6 py-5 text-[10px] font-bold tracking-[0.12em] text-muted uppercase sm:px-8"><span>Personalized with your resume</span><span>✳ &nbsp; Made to feel human</span></div>
          </section>
        </div>
      </main>
      <footer className="flex flex-wrap justify-between gap-3 border-t border-[#dce1d9] py-7 text-[10px] font-bold tracking-[0.14em] text-muted uppercase"><span>Postscript / Your next conversation starts here</span><span>Built for thoughtful outreach</span></footer>
    </div>
  </div>;
}
