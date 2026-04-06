import AdmZip from 'adm-zip';
import { parseStringPromise } from 'xml2js';
import pdfParse from 'pdf-parse';

/**
 * Extract all plain text from a DOCX buffer (header + body paragraphs).
 */
async function extractDocxText(buffer: Buffer): Promise<string> {
  try {
    const zip = new AdmZip(buffer);

    const getText = (xmlStr: string): string => {
      if (!xmlStr) return '';
      // Strip XML tags and get text content
      return xmlStr
        .replace(/<w:br[^/]*/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/\s+/g, ' ')
        .trim();
    };

    const parts: string[] = [];

    // Read header XML(s)
    const relsXml = zip.readAsText('word/_rels/document.xml.rels');
    if (relsXml) {
      const headerTargets = [...relsXml.matchAll(/Type="[^"]*\/header"[^>]*Target="([^"]+)"/g)]
        .map((m) => m[1]);
      for (const target of headerTargets) {
        const hPath = target.startsWith('word/') ? target : `word/${target}`;
        const hXml = zip.readAsText(hPath);
        if (hXml) parts.push(getText(hXml));
      }
    }

    // Read body
    const docXml = zip.readAsText('word/document.xml');
    if (docXml) parts.push(getText(docXml));

    return parts.join('\n');
  } catch {
    return '';
  }
}

/**
 * Given plain text from a SOP document (DOCX or PDF), find the best title.
 *
 * SOP files typically have a header table with rows like:
 *   | Title of SOP | Cleaning Procedure for XYZ |
 *   | SOP No.      | QAGE40-04                  |
 *
 * Strategy (in order of priority):
 * 1. Look for "Title" label row in the header table — value in same/next cell
 * 2. Look for "Name of SOP", "SOP Name", "Subject" label row
 * 3. Use the first non-code, non-short, meaningful line
 */
export function extractTitleFromDocText(
  text: string,
  identifier: string,
): string | null {
  if (!text || text.trim().length < 5) return null;

  const lines = text
    .split(/[\n\r]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1);

  const idUpper = identifier.toUpperCase().replace(/[-\s]/g, '');

  const isJunk = (s: string): boolean => {
    const t = s.trim();
    if (!t || t.length < 3) return true;
    // Is it just the SOP code?
    if (t.toUpperCase().replace(/[-\s]/g, '') === idUpper) return true;
    // Is it a path
    if (/[/\\]/.test(t)) return true;
    // Is it a page number or date alone
    if (/^[\d\s\-./]+$/.test(t)) return true;
    // Very short
    if (t.length < 4) return true;
    // Common header noise
    if (/^(page|rev|revision|version|date|effective|approved|prepared|checked|issue|no\.|sr\.?\s*no\.?|s\.?\s*no\.?)$/i.test(t)) return true;
    return false;
  };

  const titleLabels = [
    /^title\s+of\s+(?:the\s+)?sop/i,
    /^title\s+of\s+(?:the\s+)?procedure/i,
    /^(?:name|title)\s+of\s+(?:the\s+)?(?:sop|procedure|document)/i,
    /^sop\s+(?:name|title)/i,
    /^name\s+of\s+(?:the\s+)?sop/i,
    /^subject/i,
    /^procedure\s+(?:name|title)/i,
    /^document\s+(?:name|title)/i,
  ];

  // Pass 1: look for label → value pattern (label on one line, value on the next)
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    if (titleLabels.some((re) => re.test(line))) {
      // Value might be on the same line after a colon/tab, or on the next line
      const sameLineVal = line.replace(/^[^:]+:\s*/, '').trim();
      const nextLine = lines[i + 1]?.trim() || '';

      // Check same-line colon value first
      if (sameLineVal && sameLineVal !== line && !isJunk(sameLineVal)) {
        return cleanExtractedTitle(sameLineVal, identifier);
      }
      // Check next line
      if (nextLine && !isJunk(nextLine) && !titleLabels.some((re) => re.test(nextLine))) {
        return cleanExtractedTitle(nextLine, identifier);
      }
    }
  }

  // Pass 2: look for "Title : VALUE" on a single line
  for (const line of lines) {
    const m = line.match(/^(?:title|name|subject)\s*[:\-–—]\s*(.+)$/i);
    if (m) {
      const val = m[1].trim();
      if (!isJunk(val)) return cleanExtractedTitle(val, identifier);
    }
  }

  // Pass 3: first non-junk, non-header-noise line that looks like a real title
  // (at least 8 chars, contains letters, not a code)
  for (const line of lines) {
    if (isJunk(line)) continue;
    if (line.length < 8) continue;
    // Skip lines that are just a SOP code pattern
    if (/^[A-Z]{1,6}\d+[-–]\d+$/i.test(line.trim())) continue;
    // Skip lines starting with "Standard Operating Procedure" alone
    if (/^standard\s+operating\s+procedure\s*$/i.test(line)) continue;
    // Must have at least 2 real words
    const words = line.split(/\s+/).filter((w) => /[A-Za-z\u0A80-\u0AFF]/.test(w));
    if (words.length < 2) continue;
    return cleanExtractedTitle(line, identifier);
  }

  return null;
}

function cleanExtractedTitle(raw: string, identifier: string): string {
  let t = raw.trim();
  // Strip file extensions
  t = t.replace(/\.(docx|doc|pdf)$/i, '').trim();
  // Strip leading/trailing punctuation
  t = t.replace(/^[\s\-–—:.]+/, '').replace(/[\s\-–—:.]+$/, '').trim();
  // Strip trailing SOP code
  t = t.replace(/[\s,\-–—]*[A-Za-z]{1,8}\d{1,4}[-\u2013\u2014]\d{1,4}\s*$/i, '').trim();
  // Strip trailing Annexure
  t = t.replace(/[\s,\-–—]*Ann(?:exure)?[-\s]*(?:[IVX\d]+)?\s*$/i, '').trim();
  t = t.replace(/[\s\-–—:.]+$/, '').trim();
  return t;
}

/**
 * Try to extract a clean SOP title from a DOCX buffer.
 * Returns null if unable to determine a usable title.
 */
export async function extractTitleFromDocx(
  buffer: Buffer,
  identifier: string,
): Promise<string | null> {
  const text = await extractDocxText(buffer);
  return extractTitleFromDocText(text, identifier);
}

/**
 * Try to extract a clean SOP title from a PDF buffer.
 */
export async function extractTitleFromPdf(
  buffer: Buffer,
  identifier: string,
): Promise<string | null> {
  try {
    const data = await pdfParse(buffer);
    const text = data.text || '';
    return extractTitleFromDocText(text, identifier);
  } catch {
    return null;
  }
}
