// Direct, in-browser calls to Gemini with the user's own key. The key and the
// resume never leave the browser except in these requests to Google.

import { GoogleGenAI } from '@google/genai';
import {
  SYSTEM,
  DISTILL_SYSTEM,
  buildUserPrompt,
  buildResearchPrompt,
  stripDashes,
} from './prompts.js';

export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

// Turn whatever the SDK throws into a short, actionable message for the UI.
export function geminiMessage(error) {
  const status = Number(error?.status ?? error?.code ?? 0);
  const text = String(error?.message || error || '').toLowerCase();
  if (status === 400 && (text.includes('api key') || text.includes('api_key'))) {
    return 'Gemini rejected the API key. Check the key you entered.';
  }
  if (status === 401 || text.includes('api key not valid') || text.includes('invalid api key')) {
    return 'Gemini rejected the API key. Check the key you entered.';
  }
  if (status === 403) return 'Gemini denied this request. Check the API key and model access.';
  if (status === 404 || text.includes('not found')) {
    return 'Gemini could not find the model. Pick a different model and try again.';
  }
  if (status === 429 || text.includes('quota') || text.includes('rate limit')) {
    return 'Gemini quota or rate limit was reached. Check your quota or try again later.';
  }
  if (status >= 500) return 'Gemini is temporarily unavailable. Try again shortly.';
  if (text.includes('failed to fetch') || text.includes('networkerror')) {
    return 'Could not reach Gemini. Check your connection and try again.';
  }
  return 'Gemini rejected the request. Try again, or pick a different model.';
}

function client(apiKey) {
  return new GoogleGenAI({ apiKey });
}

// Run a Gemini call and rethrow any failure as a plain Error with a friendly
// message, so callers can just read err.message.
async function call(apiKey, request) {
  try {
    return await client(apiKey).models.generateContent(request);
  } catch (err) {
    throw new Error(geminiMessage(err));
  }
}

export async function distillProfile({ apiKey, model, resumeText }) {
  const response = await call(apiKey, {
    model: model || DEFAULT_MODEL,
    contents: `Raw resume text:\n\n${resumeText}\n\nProduce the candidate profile now.`,
    config: { systemInstruction: DISTILL_SYSTEM },
  });
  return stripDashes(response.text || '');
}

export async function researchCompany({ apiKey, model, company, role }) {
  const response = await call(apiKey, {
    model: model || DEFAULT_MODEL,
    contents: buildResearchPrompt({ company, role }),
    config: { tools: [{ googleSearch: {} }] },
  });
  return (response.text || '').trim();
}

export async function generateEmail({ apiKey, model, profile, notes, role, recipient, name, jd, company }) {
  const response = await call(apiKey, {
    model: model || DEFAULT_MODEL,
    contents: buildUserPrompt({ profile, company, notes, jd, role, recipient, name }),
    config: { systemInstruction: SYSTEM },
  });
  return stripDashes(response.text || '');
}
