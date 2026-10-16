import { useEffect, useRef, useState } from 'react';

const KEY = 'cold_email_gemini_key';
const PROFILE = 'cold_email_profile';
const PROFILE_NAME = 'cold_email_profile_name';
const PROFILE_DISTILLED = 'cold_email_profile_distilled';
const ACCEPTED = ['txt', 'md', 'pdf', 'docx'];
const MAX_FILE = 3 * 1024 * 1024;
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
  if (file.size > MAX_FILE) return 'Choose a file smaller than 3 MB.';
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
    if (result && window.matchMedia('(max-width: 900px)').matches) resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not read that resume.');
      save(PROFILE, data.text);
      save(PROFILE_NAME, data.name);
      remove(PROFILE_DISTILLED);
      setProfile(data.text);
      setProfileName(data.name);
      setResumeFile(null);
      if (resumeFileRef.current) resumeFileRef.current.value = '';
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
    if (resumeFileRef.current) resumeFileRef.current.value = '';
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
    if (!savedKey) { setError('Add your Gemini API key in Personal setup.'); setEditingKey(true); setSetupOpen(true); return; }
    if (!profile) { setError('Upload and save your resume in Personal setup.'); setEditingResume(true); setSetupOpen(true); return; }
    if (!company.trim() && !jd.trim() && !jdFile) { setError('Add a company name or a job description.'); return; }
    if (research && !company.trim()) { setError('Add a company name to research it.'); return; }
    setBusy(true);
    try {
      const payload = { api_key: savedKey, profile, profile_distilled: stored(PROFILE_DISTILLED) === '1', company: company.trim(), job_description: jd.trim(), role: role.trim(), name: name.trim(), research };
      if (jdFile) payload.file = { name: jdFile.name, content: await fileAsBase64(jdFile) };
      const response = await fetch(apiUrl('/api/generate'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
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

  return <div className="site-shell">
    <header className="site-header"><div className="page-width header-inner">
      <a href="/" className="brand" aria-label="Postscript home"><span className="brand-mark">ps</span><span>postscript<span className="brand-dot">.</span></span></a>
      <span className="header-descriptor">THE THOUGHTFUL OUTREACH STUDIO</span>
      <a className="header-link" href="#workspace">Start writing <Icon name="arrow" className="h-4 w-4" /></a>
    </div></header>

    <main className="page-width" id="workspace">
      <div className="intro"><div><p className="eyebrow"><span /> YOUR NEXT CONVERSATION</p><h1>Write an introduction<br />worth <em>opening.</em></h1></div><p className="intro-copy">A little context goes a long way. Turn a company or job description into three personal emails you can make your own.</p></div>

      <section className={`setup ${ready ? 'setup-ready' : ''}`} aria-labelledby="setup-title">
        <button type="button" className="setup-toggle" onClick={() => setSetupOpen(!setupOpen)} aria-expanded={setupOpen} aria-controls="setup-details"><span className="setup-icon">{ready ? <Icon name="check" className="h-5 w-5" /> : '✳'}</span><span className="setup-summary"><strong id="setup-title">Personal setup</strong><span>{ready ? 'Your resume and Gemini key are ready' : 'Add your Gemini key and resume to get started'}</span></span><span className="setup-progress"><span className={savedKey ? 'done' : ''}>01 Key</span><span className={profile ? 'done' : ''}>02 Resume</span></span><span className={`setup-chevron ${setupOpen ? 'open' : ''}`}>⌄</span></button>
        {setupOpen && <div id="setup-details" className="setup-details">
          <div className="setup-item"><div className="setup-item-title"><span>01</span><div><h3>Gemini API key</h3><p>Saved in this browser and sent to the API when you generate.</p></div></div>
            {editingKey ? <div className="setup-actions"><div className="key-input-wrap"><input ref={keyRef} aria-label="Gemini API key" type={showKey ? 'text' : 'password'} value={keyInput} onChange={e => setKeyInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); keepKey(); } }} placeholder="Paste your API key" autoComplete="off" spellCheck="false" /><button type="button" onClick={() => setShowKey(!showKey)}>{showKey ? 'Hide' : 'Show'}</button></div><button type="button" className="button button-secondary" onClick={keepKey}>Save key</button>{keyMessage && <p className="inline-error" role="alert">{keyMessage}</p>}</div> : <div className="saved-control"><span><Icon name="check" className="h-4 w-4" /> Key saved</span><button type="button" onClick={() => { setKeyInput(savedKey); setEditingKey(true); }}>Change</button></div>}
          </div>
          <div className="setup-item"><div className="setup-item-title"><span>02</span><div><h3>Your resume</h3><p>We use it to connect your experience to the role.</p></div></div>
            {editingResume ? <div className="setup-actions"><input ref={resumeFileRef} type="file" accept=".txt,.md,.pdf,.docx" className="sr-only" aria-label="Upload resume" onChange={e => chooseResume(e.target.files?.[0])} /><button type="button" className="button button-outline" onClick={() => resumeFileRef.current?.click()}><Icon name="upload" className="h-4 w-4" /> Choose file</button><span className="selected-file">{resumeFile?.name || 'PDF, DOCX, TXT or MD · max 3 MB'}</span><button type="button" className="button button-secondary" disabled={!resumeFile || savingResume} onClick={keepResume}>{savingResume ? 'Saving…' : 'Save resume'}</button>{resumeMessage && <p className="inline-error" role="alert">{resumeMessage}</p>}</div> : <div className="saved-control"><span><Icon name="check" className="h-4 w-4 shrink-0" /> <span className="truncate">{profileName || 'Resume'} saved</span></span><button type="button" onClick={() => setEditingResume(true)}>Replace</button><button type="button" onClick={clearResume}>Remove</button></div>}
          </div>
        </div>}
      </section>

      <div className="workspace-grid">
        <section className="compose" aria-labelledby="compose-title"><div className="panel-heading"><span className="section-number">01 / THE BRIEF</span><h2 id="compose-title">Tell us about the opportunity.</h2><p>Add a company, a job description, or both.</p></div>
          <form onSubmit={generate} className="compose-form"><div className="field"><label htmlFor="company">Company name</label><input id="company" value={company} onChange={e => setCompany(e.target.value)} maxLength={150} autoComplete="organization" placeholder="e.g. Linear" /></div><div className="field-divider"><span>AND / OR</span></div><div className="field"><label htmlFor="jd">Job description</label><textarea id="jd" value={jd} onChange={e => setJd(e.target.value)} maxLength={60000} placeholder="Paste the role, responsibilities, and requirements here…" rows={7} /></div>
            <div className={`dropzone ${dragging ? 'dragging' : ''}`} onDragEnter={e => { e.preventDefault(); setDragging(true); }} onDragOver={e => e.preventDefault()} onDragLeave={e => { e.preventDefault(); setDragging(false); }} onDrop={e => { e.preventDefault(); setDragging(false); chooseJd(e.dataTransfer.files?.[0]); }}><input ref={jdFileRef} type="file" accept=".txt,.md,.pdf,.docx" className="sr-only" aria-label="Upload job description" onChange={e => chooseJd(e.target.files?.[0])} /><span className="drop-icon"><Icon name="upload" className="h-5 w-5" /></span><div className="drop-copy"><strong>{jdFile ? jdFile.name : 'Have the job description as a file?'}</strong><span>{jdFile ? 'Ready to use with your pasted text' : 'Drop it here or browse your files · max 3 MB'}</span></div>{jdFile ? <button type="button" className="drop-action" onClick={() => { setJdFile(null); jdFileRef.current.value = ''; }} aria-label="Remove uploaded job description">×</button> : <button type="button" className="drop-action" onClick={() => jdFileRef.current?.click()}>Browse</button>}</div>
            <div className="field-pair"><div className="field"><label htmlFor="role">Your target role</label><input id="role" value={role} onChange={e => setRole(e.target.value)} maxLength={150} placeholder="e.g. AI Engineer" /></div><div className="field"><div className="field-label-row"><label htmlFor="name">Their first name</label><span>Optional</span></div><input id="name" value={name} onChange={e => setName(e.target.value)} maxLength={100} placeholder="e.g. Alex" /></div></div>
            <label className="research-row"><span className="research-copy"><strong>Research this company</strong><span>Gemini will look for company context. This may take longer.</span></span><input type="checkbox" checked={research} onChange={e => setResearch(e.target.checked)} /><span className="switch-track" aria-hidden="true" /></label>
            {error && <p className="form-error" role="alert">{error}</p>}<button className="generate-button" disabled={busy} type="submit"><span>{busy ? 'Writing your drafts…' : 'Generate three emails'}</span>{busy ? <span className="spinner" /> : <Icon name="arrow" className="h-5 w-5" />}</button><p className="form-note"><Icon name="lock" className="h-3.5 w-3.5" /> Your key and resume stay in this browser between visits.</p>
          </form>
        </section>

        <section className="preview" ref={resultRef} aria-labelledby="preview-title"><div className="panel-heading preview-heading"><div><span className="section-number">02 / THE DRAFTS</span><h2 id="preview-title">The first hello, drafted.</h2><p>Choose the voice that fits the person you're writing to.</p></div><span className={`status ${busy ? 'status-working' : result ? 'status-ready' : ''}`} aria-live="polite"><span />{busy ? 'Writing' : result ? 'Ready to review' : 'Awaiting brief'}</span></div>
          {busy ? <div className="preview-state busy-state" role="status"><div className="state-art"><span className="art-orbit" /><span className="art-letter"><span /><span /><span /></span><span className="art-spark">✳</span></div><h3>Finding the right words.</h3><p>{research ? 'Researching the company and shaping your three drafts.' : 'Connecting your experience to the opportunity.'}</p><div className="loading-line"><span /></div></div> : result ? <div className="result-body"><div className="recipient-tabs" role="tablist" aria-label="Email recipient">{order.map(person => <button key={person} type="button" role="tab" aria-selected={recipient === person} onClick={() => { setRecipient(person); setSubjectIndex(0); }} className={recipient === person ? 'active' : ''}>{result.labels?.[person] || person}</button>)}</div><div className="subject-heading"><span>SUBJECT LINE</span><button type="button" onClick={() => copy(subjects[subjectIndex], 'subject')} disabled={!subjects.length}><Icon name="copy" className="h-3.5 w-3.5" /> {copied === 'subject' ? 'Copied' : 'Copy subject'}</button></div><div className="subject-options" role="radiogroup" aria-label="Subject line options">{subjects.length ? subjects.map((subject, index) => <button type="button" role="radio" aria-checked={subjectIndex === index} key={`${recipient}-${index}`} className={`subject-option ${subjectIndex === index ? 'selected' : ''}`} onClick={() => setSubjectIndex(index)}><span className="radio-dot" />{subject}</button>) : <p className="missing-subject">No subject lines were returned. Try generating again.</p>}</div><div className="email-heading"><span>EMAIL BODY</span><button type="button" onClick={() => copy(variant?.email, 'email')} disabled={!variant?.email}><Icon name="copy" className="h-3.5 w-3.5" /> {copied === 'email' ? 'Copied' : 'Copy email'}</button></div><div className="email-paper"><pre>{variant?.email || ''}</pre></div></div> : <div className="preview-state empty-state"><div className="state-art"><span className="art-orbit" /><span className="art-letter"><span /><span /><span /></span><span className="art-spark">✳</span></div><span className="empty-kicker">A BLANK PAGE, FOR NOW</span><h3>Good conversations<br />start somewhere.</h3><p>Add a company or job description, then generate. Your drafts will appear here.</p></div>}
          <div className="preview-footer"><span>THREE PERSPECTIVES</span><span>ONE BETTER INTRODUCTION <span aria-hidden="true">✳</span></span></div>
        </section>
      </div>
    </main>
    <footer className="site-footer page-width"><span>© Postscript</span><span>Made for introductions that feel human.</span></footer>
  </div>;
}
