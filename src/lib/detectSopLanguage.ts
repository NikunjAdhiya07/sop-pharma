/**
 * Infer whether uploaded SOP content is primarily Gujarati (script) vs English.
 * Uses the Gujarati Unicode block; robust for mixed headers/footers in Latin script.
 */

const GUJARATI_SCRIPT = /[\u0A80-\u0AFF]/g;

export function inferSopLanguageFromText(text: string): 'English' | 'Gujarati' {
  if (!text || text.trim().length < 8) return 'English';
  const sample = text.slice(0, 25000);
  const gujMatches = sample.match(GUJARATI_SCRIPT);
  const gujCount = gujMatches?.length ?? 0;
  const lettersEtc = sample.replace(/[\s0-9.,;:!?'"()[\]{}\\/\-_=@#%&+*<>\n\r\t]/g, '');
  if (lettersEtc.length < 10) return 'English';
  const ratio = gujCount / lettersEtc.length;
  if (gujCount >= 18 || ratio >= 0.06) return 'Gujarati';
  return 'English';
}

/** Folder layout hints (e.g. …/Gujarati SOP/…). */
export function inferSopLanguageFromPath(relativePath: string): 'Gujarati' | null {
  if (!relativePath) return null;
  const p = relativePath.replace(/\\/g, '/');
  if (/\bGujarati\s*SOP\b/i.test(p)) return 'Gujarati';
  if (/\/Gujarati\s*SOP\//i.test(p)) return 'Gujarati';
  if (/\bgujarati\b/i.test(p) && /\bsop\b/i.test(p)) return 'Gujarati';
  return null;
}

export function inferSopLanguageFromFileName(baseName: string): 'Gujarati' | null {
  if (!baseName) return null;
  return /[\u0A80-\u0AFF]/.test(baseName) ? 'Gujarati' : null;
}

export function resolveSopLanguageForUpload(options: {
  batchLanguage: 'English' | 'Gujarati' | 'auto';
  text: string;
  relativePath: string;
  baseName: string;
}): 'English' | 'Gujarati' {
  const { batchLanguage, text, relativePath, baseName } = options;
  if (batchLanguage === 'English') return 'English';
  if (batchLanguage === 'Gujarati') return 'Gujarati';
  const fromName = inferSopLanguageFromFileName(baseName);
  if (fromName) return fromName;
  const fromPath = inferSopLanguageFromPath(relativePath);
  if (fromPath) return fromPath;
  return inferSopLanguageFromText(text);
}
