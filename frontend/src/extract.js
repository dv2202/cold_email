// Read resume / job-description files to text entirely in the browser. The file
// bytes never leave the device. PDF and DOCX parsers are loaded on demand so the
// initial bundle stays small.

export const ACCEPTED = ['txt', 'md', 'pdf', 'docx'];
export const MAX_FILE = 3 * 1024 * 1024;

export function validateFile(file) {
  if (!file) return 'Choose a file first.';
  const ext = file.name.split('.').pop().toLowerCase();
  if (!ACCEPTED.includes(ext)) return 'Choose a TXT, MD, PDF, or DOCX file.';
  if (file.size > MAX_FILE) return 'Choose a file smaller than 3 MB.';
  return '';
}

async function extractPdf(arrayBuffer) {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str || '').join(' '));
  }
  return pages.join('\n');
}

async function extractDocx(arrayBuffer) {
  const mammoth = (await import('mammoth/mammoth.browser.js')).default;
  const { value } = await mammoth.extractRawText({ arrayBuffer });
  return value || '';
}

// Returns the file's text, or throws an Error with a user-facing message.
export async function extractText(file) {
  const message = validateFile(file);
  if (message) throw new Error(message);
  const ext = file.name.split('.').pop().toLowerCase();
  try {
    if (ext === 'txt' || ext === 'md') {
      return (await file.text()).trim();
    }
    const arrayBuffer = await file.arrayBuffer();
    const text = ext === 'pdf' ? await extractPdf(arrayBuffer) : await extractDocx(arrayBuffer);
    return text.trim();
  } catch (err) {
    if (err instanceof Error && err.message && err.message.startsWith('Choose')) throw err;
    throw new Error('Could not read text from that file. Try a different file or paste the text.');
  }
}
