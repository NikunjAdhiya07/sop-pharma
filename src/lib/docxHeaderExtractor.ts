import AdmZip from 'adm-zip';
import { parseStringPromise } from 'xml2js';

const RELS_HEADER =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header';

/**
 * Extract body and header HTML then strip HTML tags to get pure document text.
 */
export async function extractAllDOCXContent(buffer: Buffer): Promise<string> {
  const headerHtml = await extractHeaderHtmlFromDocx(buffer);
  const bodyHtml = await extractDocumentBodyHtmlFromDocx(buffer);
  
  const strip = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  
  const headerText = strip(headerHtml);
  const bodyText = strip(bodyHtml);
  
  return (headerText + '\n\n' + bodyText).trim();
}

/**
 * Extract header HTML from a DOCX buffer so the preview shows the full document.
 * Word often puts the title and metadata table in the header.
 */
export async function extractHeaderHtmlFromDocx(buffer: Buffer): Promise<string> {
  try {
    const zip = new AdmZip(buffer);
    const relsPath = 'word/_rels/document.xml.rels';
    const relsXml = zip.readAsText(relsPath);
    if (!relsXml) return '';

    const rels = await parseStringPromise(relsXml);
    const relationships =
      rels?.['Relationships']?.['Relationship'] ?? [];
    const relList = Array.isArray(relationships) ? relationships : [relationships];
    const headerTarget = relList.find(
      (r: any) =>
        r?.$?.Type === RELS_HEADER || (r?.$?.Type && r.$.Type.endsWith('/header'))
    )?.$?.Target;
    if (!headerTarget) return '';

    const headerPath = headerTarget.startsWith('word/')
      ? headerTarget
      : `word/${headerTarget}`;
    const headerXml = zip.readAsText(headerPath);
    if (!headerXml) return '';

    const parsed = await parseStringPromise(headerXml);
    const rootKey = Object.keys(parsed || {}).find(
      (k) => k === 'w:hdr' || k.endsWith(':hdr') || k === 'hdr'
    );
    const hdrRaw = rootKey ? parsed?.[rootKey] : undefined;
    const hdr = Array.isArray(hdrRaw) ? hdrRaw[0] : hdrRaw;
    if (!hdr || typeof hdr !== 'object') return '';

    return convertBodyToHtml(hdr);
  } catch {
    return '';
  }
}

/**
 * Extract main document body HTML from DOCX using the same conversion as the header,
 * so the preview matches the uploaded SOP (tables, borders, bold, layout).
 */
export async function extractDocumentBodyHtmlFromDocx(buffer: Buffer): Promise<string> {
  try {
    const zip = new AdmZip(buffer);
    const docXml = zip.readAsText('word/document.xml');
    if (!docXml) return '';

    const parsed = await parseStringPromise(docXml);

    // The parsed root is w:document (or similar); body is inside it
    const docKey = Object.keys(parsed || {}).find(
      (k) => k === 'w:document' || k.endsWith(':document') || k === 'document'
    );
    const docObj = docKey ? (Array.isArray(parsed[docKey]) ? parsed[docKey][0] : parsed[docKey]) : parsed;

    // Now find w:body inside the document object
    const bodyKey = Object.keys(docObj || {}).find(
      (k) => k === 'w:body' || k.endsWith(':body') || k === 'body'
    );
    const bodyRaw = bodyKey ? docObj?.[bodyKey] : undefined;
    const body = Array.isArray(bodyRaw) ? bodyRaw[0] : bodyRaw;
    if (!body || typeof body !== 'object') return '';

    return convertBodyToHtml(body);
  } catch {
    return '';
  }
}

/** Convert Word body (w:body or w:hdr) to HTML - same logic for header and main document. */
function convertBodyToHtml(body: any): string {
  const parts: string[] = [];
  const childKeys = Object.keys(body).filter((k) => k !== '$');
  for (const key of childKeys) {
    const raw = body[key];
    const items = Array.isArray(raw) ? raw : [raw];
    for (const item of items) {
      if (key === 'w:p') {
        parts.push(paragraphToHtml(item));
      } else if (key === 'w:tbl') {
        parts.push(tableToHtml(item));
      }
    }
  }
  return parts.join('\n');
}

const TABLE_STYLE = 'border-collapse:collapse;border:1px solid #000;width:100%;font-family:\'Times New Roman\',serif;font-size:11pt;';
const CELL_STYLE_BASE = 'border:1px solid #000;padding:4px 8px;vertical-align:top;text-align:left;';

function getParagraphAlignment(p: any): string {
  const pPr = p?.['w:pPr'];
  if (!pPr || typeof pPr !== 'object') return 'left';
  const jc = pPr['w:jc'] ?? pPr['w:jc'];
  const list = Array.isArray(jc) ? jc : jc != null ? [jc] : [];
  const val = list[0]?.$?.['w:val'];
  if (val === 'center') return 'center';
  if (val === 'right') return 'right';
  if (val === 'both' || val === 'distribute') return 'justify';
  return 'left';
}

function paragraphToHtml(p: any): string {
  const html = getParagraphAsHtml(p);
  const align = getParagraphAlignment(p);
  const style = `margin:0 0 2px 0;text-align:${align}`;
  if (!html.trim()) return `<p style="${style}"></p>`;
  return `<p style="${style}">${html}</p>`;
}

function isBold(run: any): boolean {
  const pr = run?.['w:rPr'];
  if (!pr || typeof pr !== 'object') return false;
  const b = pr['w:b'] ?? pr['w:bCs'];
  const list = Array.isArray(b) ? b : b != null ? [b] : [];
  return list.some((x: any) => {
    if (x == null) return false;
    const val = x.$?.['w:val'];
    return val === undefined || val === 'true' || val === '1';
  });
}

function getTextFromRun(run: any): string {
  let text = '';
  const ts = run?.['w:t'] ?? [];
  const tList = Array.isArray(ts) ? ts : [ts];
  for (const t of tList) {
    if (typeof t === 'string') text += t;
    else if (t?._) text += t._;
  }
  return text;
}

function isItalic(run: any): boolean {
  const pr = run?.['w:rPr'];
  if (!pr || typeof pr !== 'object') return false;
  const i = pr['w:i'] ?? pr['w:iCs'];
  const list = Array.isArray(i) ? i : i != null ? [i] : [];
  return list.some((x: any) => {
    if (x == null) return false;
    const val = x.$?.['w:val'];
    return val === undefined || val === 'true' || val === '1';
  });
}

function isUnderline(run: any): boolean {
  const pr = run?.['w:rPr'];
  if (!pr || typeof pr !== 'object') return false;
  const u = pr['w:u'];
  const list = Array.isArray(u) ? u : u != null ? [u] : [];
  return list.some((x: any) => {
    if (x == null) return false;
    const val = x.$?.['w:val'];
    return val != null && val !== 'none' && val !== '0';
  });
}

function hasLineBreak(run: any): boolean {
  const br = run?.['w:br'];
  return br != null;
}

function renderRun(run: any): string {
  const text = getTextFromRun(run);
  const safe = escapeHtml(text);
  const br = hasLineBreak(run) ? '<br />' : '';
  if (!safe && !br) return '';
  let out = safe || '';
  if (isBold(run) && out) out = `<strong>${out}</strong>`;
  if (isItalic(run) && out) out = `<em>${out}</em>`;
  if (isUnderline(run) && out) out = `<u>${out}</u>`;
  return out + br;
}

function getParagraphAsHtml(p: any): string {
  const parts: string[] = [];

  // Normal runs
  const runs = p?.['w:r'] ?? [];
  const runList = Array.isArray(runs) ? runs : [runs];
  for (const run of runList) parts.push(renderRun(run));

  // Tracked insertions (w:ins > w:r)
  const ins = p?.['w:ins'] ?? [];
  const insList = Array.isArray(ins) ? ins : [ins];
  for (const insEl of insList) {
    const insRuns = insEl?.['w:r'] ?? [];
    const insRunList = Array.isArray(insRuns) ? insRuns : [insRuns];
    for (const run of insRunList) parts.push(renderRun(run));
  }

  // Hyperlinks (w:hyperlink > w:r)
  const hyperlinks = p?.['w:hyperlink'] ?? [];
  const hyperlinkList = Array.isArray(hyperlinks) ? hyperlinks : [hyperlinks];
  for (const hl of hyperlinkList) {
    const hlRuns = hl?.['w:r'] ?? [];
    const hlRunList = Array.isArray(hlRuns) ? hlRuns : [hlRuns];
    const hlText = hlRunList.map(renderRun).join('');
    if (hlText) parts.push(`<span style="color:#1155CC;text-decoration:underline">${hlText}</span>`);
  }

  return parts.filter(Boolean).join('');
}

function getTextFromParagraph(p: any): string {
  const runs = p?.['w:r'] ?? [];
  const runList = Array.isArray(runs) ? runs : [runs];
  let text = '';
  for (const run of runList) text += getTextFromRun(run);
  return text;
}

function getGridSpan(tc: any): number {
  const tcPr = tc?.['w:tcPr'];
  if (!tcPr || typeof tcPr !== 'object') return 1;
  const gridSpan = tcPr['w:gridSpan'];
  const list = Array.isArray(gridSpan) ? gridSpan : gridSpan != null ? [gridSpan] : [];
  const val = list[0]?.$?.['w:val'];
  if (val == null) return 1;
  const n = parseInt(String(val), 10);
  return isNaN(n) || n < 1 ? 1 : n;
}

/** 'restart' = start of vertical merge, 'continue' = part of merge (no own cell), null = normal */
function getVMerge(tc: any): 'restart' | 'continue' | null {
  const tcPr = tc?.['w:tcPr'];
  if (!tcPr || typeof tcPr !== 'object') return null;
  const vMerge = tcPr['w:vMerge'];
  const list = Array.isArray(vMerge) ? vMerge : vMerge != null ? [vMerge] : [];
  const el = list[0];
  if (!el) return null;
  const val = el?.$?.['w:val'];
  if (val === 'restart') return 'restart';
  return 'continue'; // empty or continue
}

function getCellAlign(tc: any): { vertical?: string; horizontal?: string } {
  const out: { vertical?: string; horizontal?: string } = {};
  const tcPr = tc?.['w:tcPr'];
  if (!tcPr || typeof tcPr !== 'object') return out;
  const vAlign = tcPr['w:vAlign'];
  let list = Array.isArray(vAlign) ? vAlign : vAlign != null ? [vAlign] : [];
  const vVal = list[0]?.$?.['w:val'];
  if (vVal === 'center') out.vertical = 'middle';
  else if (vVal === 'top') out.vertical = 'top';
  else if (vVal === 'bottom') out.vertical = 'bottom';
  const jc = tcPr['w:jc'];
  list = Array.isArray(jc) ? jc : jc != null ? [jc] : [];
  const jVal = list[0]?.$?.['w:val'];
  if (jVal === 'center') out.horizontal = 'center';
  else if (jVal === 'right') out.horizontal = 'right';
  else if (jVal === 'both' || jVal === 'distribute') out.horizontal = 'justify';
  return out;
}

/** Column widths from w:tblGrid (w:gridCol w:w in twentieths of a point). */
function getTblGridWidths(tbl: any): number[] {
  const grid = tbl?.['w:tblGrid'];
  if (!grid || typeof grid !== 'object') return [];
  const cols = grid['w:gridCol'] ?? [];
  const list = Array.isArray(cols) ? cols : [cols];
  const widths: number[] = [];
  for (const col of list) {
    const w = col?.$?.['w:w'];
    if (w != null) widths.push(parseFloat(String(w)) || 0);
    else widths.push(0);
  }
  return widths;
}

interface CellInfo {
  tc: any;
  gridSpan: number;
  vMerge: 'restart' | 'continue' | null;
  colIndex: number;
  rowspan: number;
}

function tableToHtml(tbl: any): string {
  const trList = tbl?.['w:tr'] ?? [];
  const trs = Array.isArray(trList) ? trList : [trList];
  const gridWidths = getTblGridWidths(tbl);
  const rowsCells: CellInfo[][] = [];
  let colIndex = 0;
  for (const tr of trs) {
    const tcList = tr?.['w:tc'] ?? [];
    const tcs = Array.isArray(tcList) ? tcList : [tcList];
    const rowInfos: CellInfo[] = [];
    colIndex = 0;
    for (const tc of tcs) {
      const gridSpan = getGridSpan(tc);
      const vMerge = getVMerge(tc);
      rowInfos.push({ tc, gridSpan, vMerge, colIndex, rowspan: 1 });
      colIndex += gridSpan;
    }
    rowsCells.push(rowInfos);
  }
  // Compute rowspan for vMerge restart: count following rows that have continue in same column
  for (let r = 0; r < rowsCells.length; r++) {
    for (const info of rowsCells[r]) {
      if (info.vMerge !== 'restart') continue;
      let rowspan = 1;
      const startCol = info.colIndex;
      const endCol = info.colIndex + info.gridSpan;
      for (let rr = r + 1; rr < rowsCells.length; rr++) {
        let hasContinue = false;
        let c = 0;
        for (const inf of rowsCells[rr]) {
          if (c === startCol && inf.vMerge === 'continue') {
            hasContinue = true;
            break;
          }
          c += inf.gridSpan;
        }
        if (!hasContinue) break;
        rowspan++;
      }
      info.rowspan = rowspan;
    }
  }
  const colgroupHtml =
    gridWidths.length > 0
      ? '<colgroup>' +
        gridWidths
          .map((w) => {
            const pt = w / 20;
            return `<col style="width:${pt}pt" />`;
          })
          .join('') +
        '</colgroup>'
      : '';
  const rows: string[] = [];
  const rowspanRemaining: Record<number, number> = {};
  for (let r = 0; r < rowsCells.length; r++) {
    const rowInfos = rowsCells[r];
    const tds: string[] = [];
    let logicalCol = 0;
    for (const info of rowInfos) {
      if (info.vMerge === 'continue') {
        for (let k = 0; k < info.gridSpan; k++) {
          const col = logicalCol + k;
          if (rowspanRemaining[col] > 0) rowspanRemaining[col]--;
        }
        logicalCol += info.gridSpan;
        continue;
      }
      while (rowspanRemaining[logicalCol] > 0) {
        rowspanRemaining[logicalCol]--;
        logicalCol++;
      }
      const colspan = info.gridSpan > 1 ? ` colspan="${info.gridSpan}"` : '';
      const rowspan = info.rowspan > 1 ? ` rowspan="${info.rowspan}"` : '';
      tds.push(`<td${colspan}${rowspan} style="${getCellStyle(info.tc)}">${cellContent(info.tc)}</td>`);
      if (info.rowspan > 1) {
        for (let k = 0; k < info.gridSpan; k++) {
          rowspanRemaining[logicalCol + k] = info.rowspan - 1;
        }
      }
      logicalCol += info.gridSpan;
    }
    if (tds.length) rows.push('<tr>' + tds.join('') + '</tr>');
  }
  if (!rows.length) return '';
  return `<table style="${TABLE_STYLE}" cellpadding="0" cellspacing="0">${colgroupHtml}<tbody>${rows.join('')}</tbody></table>`;
}

function getCellStyle(tc: any): string {
  const align = getCellAlign(tc);
  let s = CELL_STYLE_BASE;
  if (align.vertical) s += `vertical-align:${align.vertical};`;
  if (align.horizontal) s += `text-align:${align.horizontal};`;
  return s;
}

function cellContent(tc: any): string {
  const parts: string[] = [];
  const childKeys = Object.keys(tc || {}).filter((k) => k !== '$');
  for (const key of childKeys) {
    const raw = tc[key];
    const items = Array.isArray(raw) ? raw : [raw];
    for (const item of items) {
      if (key === 'w:p') {
        const html = getParagraphAsHtml(item);
        const align = getParagraphAlignment(item);
        const text = getTextFromParagraph(item);
        const style = `margin:0 0 2px 0;text-align:${align}`;
        if (text.trim()) parts.push(`<p style="${style}">${html}</p>`);
        else parts.push(`<p style="${style}"></p>`);
      } else if (key === 'w:tbl') {
        parts.push(tableToHtml(item));
      }
    }
  }
  return parts.length ? parts.join('') : '';
}

function cellToHtml(tc: any): string {
  const content = cellContent(tc);
  return `<td style="${getCellStyle(tc)}">${content}</td>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Extract all plain text from a table cell (joins paragraphs with newline). */
function getAllCellText(tc: any): string {
  const parts: string[] = [];
  const keys = Object.keys(tc || {}).filter((k) => k !== '$');
  for (const key of keys) {
    const raw = tc[key];
    const items = Array.isArray(raw) ? raw : [raw];
    for (const item of items) {
      if (key === 'w:p') {
        const t = getTextFromParagraph(item).trim();
        if (t) parts.push(t);
      }
    }
  }
  return parts.join('\n');
}

export interface SOPHeaderTableData {
  /** e.g. "QAGE21-05" extracted from the "SOP NO." cell */
  sopNo: string | null;
  /** Raw date string from "EFF. DATE" cell, e.g. "23/07/2022" */
  effDate: string | null;
  /** Raw date string from "REVIEW DT." cell, e.g. "22/07/2024" */
  reviewDate: string | null;
  subject: string | null;
  department: string | null;
  area: string | null;
}

const EMPTY_HEADER_DATA: SOPHeaderTableData = {
  sopNo: null,
  effDate: null,
  reviewDate: null,
  subject: null,
  department: null,
  area: null,
};

/**
 * Parse the SOP header table from a DOCX buffer and extract key metadata:
 * SOP NO., EFF. DATE, REVIEW DT., SUBJECT, DEPARTMENT, AREA.
 *
 * Handles two common layouts:
 *  - Label and value in the same cell separated by a newline
 *  - Label in one cell, value in the adjacent/next cell
 */
export async function extractSOPHeaderTableData(buffer: Buffer): Promise<SOPHeaderTableData> {
  try {
    const zip = new AdmZip(buffer);
    const docXml = zip.readAsText('word/document.xml');
    if (!docXml) return EMPTY_HEADER_DATA;

    const parsed = await parseStringPromise(docXml);
    const docKey = Object.keys(parsed || {}).find(
      (k) => k === 'w:document' || k.endsWith(':document') || k === 'document',
    );
    const docObj = docKey
      ? Array.isArray(parsed[docKey])
        ? parsed[docKey][0]
        : parsed[docKey]
      : parsed;
    const bodyKey = Object.keys(docObj || {}).find(
      (k) => k === 'w:body' || k.endsWith(':body') || k === 'body',
    );
    const bodyRaw = bodyKey ? docObj[bodyKey] : undefined;
    const body = Array.isArray(bodyRaw) ? bodyRaw[0] : bodyRaw;
    if (!body || typeof body !== 'object') return EMPTY_HEADER_DATA;

    const result: SOPHeaderTableData = { ...EMPTY_HEADER_DATA };

    // Collect all cell texts from the first 3 tables (the SOP header is in the first 1-2 tables)
    const tblRaw = body['w:tbl'] ?? [];
    const tables = Array.isArray(tblRaw) ? tblRaw : tblRaw ? [tblRaw] : [];
    const allCellTexts: string[] = [];

    for (const tbl of tables.slice(0, 3)) {
      const trRaw = tbl['w:tr'] ?? [];
      const rows = Array.isArray(trRaw) ? trRaw : trRaw ? [trRaw] : [];
      for (const tr of rows) {
        const tcRaw = tr['w:tc'] ?? [];
        const cells = Array.isArray(tcRaw) ? tcRaw : tcRaw ? [tcRaw] : [];
        for (const tc of cells) {
          const text = getAllCellText(tc).trim();
          if (text) allCellTexts.push(text);
        }
      }
    }

    const SOP_ID_RE = /\b([A-Z]{2,6}\d{1,4}-\d{1,4})\b/i;
    const DATE_RE = /([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/;

    for (let i = 0; i < allCellTexts.length; i++) {
      const raw = allCellTexts[i];
      const norm = raw.replace(/\s+/g, ' ').trim();
      const next = i + 1 < allCellTexts.length ? allCellTexts[i + 1].replace(/\s+/g, ' ').trim() : '';
      const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);

      // ── SOP NO ──────────────────────────────────────────────────────────────
      if (!result.sopNo) {
        if (/^sop\s*no\.?\s*$/i.test(norm)) {
          // Label-only cell → value in next cell
          const m = next.match(SOP_ID_RE);
          if (m) result.sopNo = m[1].toUpperCase();
        } else {
          // "SOP NO. QAGE21-05" or "SOP NO.: QAGE21-05" in same cell (single line or multi-line)
          const inline = norm.match(/sop\s*no\.?\s*[:\s]+([A-Z]{2,6}\d{1,4}-\d{1,4})/i);
          if (inline) {
            result.sopNo = inline[1].toUpperCase();
          } else {
            // Label on one line, value on next line within the same cell
            const li = lines.findIndex((l) => /^sop\s*no\.?\s*$/i.test(l));
            if (li >= 0 && li + 1 < lines.length) {
              const vm = lines[li + 1].match(SOP_ID_RE);
              if (vm) result.sopNo = vm[1].toUpperCase();
            }
          }
        }
      }

      // ── EFF DATE ─────────────────────────────────────────────────────────────
      if (!result.effDate && /eff\.?\s*(?:date|dt)\.?/i.test(norm)) {
        const inline = norm.match(
          /eff\.?\s*(?:date|dt)\.?\s*[:\s]+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/i,
        );
        if (inline) {
          result.effDate = inline[1];
        } else {
          // Check next line within same cell
          const li = lines.findIndex((l) => /eff\.?\s*(?:date|dt)/i.test(l));
          if (li >= 0) {
            const sameLine = lines[li].match(
              /eff\.?\s*(?:date|dt)\.?\s*[:\s]+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/i,
            );
            if (sameLine) {
              result.effDate = sameLine[1];
            } else if (li + 1 < lines.length) {
              const dm = lines[li + 1].match(DATE_RE);
              if (dm) result.effDate = dm[1];
            }
          }
          // Next cell
          if (!result.effDate) {
            const nm = next.match(/^([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/);
            if (nm) result.effDate = nm[1];
          }
        }
      }

      // ── REVIEW DATE ──────────────────────────────────────────────────────────
      if (!result.reviewDate && /review\.?\s*(?:dt|date)\.?/i.test(norm)) {
        const inline = norm.match(
          /review\.?\s*(?:dt|date)\.?\s*[:\s]+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/i,
        );
        if (inline) {
          result.reviewDate = inline[1];
        } else {
          const li = lines.findIndex((l) => /review\.?\s*(?:dt|date)/i.test(l));
          if (li >= 0) {
            const sameLine = lines[li].match(
              /review\.?\s*(?:dt|date)\.?\s*[:\s]+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/i,
            );
            if (sameLine) {
              result.reviewDate = sameLine[1];
            } else if (li + 1 < lines.length) {
              const dm = lines[li + 1].match(DATE_RE);
              if (dm) result.reviewDate = dm[1];
            }
          }
          if (!result.reviewDate) {
            const nm = next.match(/^([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/);
            if (nm) result.reviewDate = nm[1];
          }
        }
      }

      // ── SUBJECT ──────────────────────────────────────────────────────────────
      if (!result.subject && /^subject\s*[:\s]/i.test(norm)) {
        const val = norm.replace(/^subject\s*[:\s]+/i, '').trim();
        result.subject = val || next || null;
      }

      // ── DEPARTMENT ───────────────────────────────────────────────────────────
      if (!result.department && /^department\s*[:\s]/i.test(norm)) {
        const val = norm.replace(/^department\s*[:\s]+/i, '').trim();
        result.department = val || next || null;
      }

      // ── AREA ─────────────────────────────────────────────────────────────────
      if (!result.area && /^area\s*[:\s]/i.test(norm)) {
        const val = norm.replace(/^area\s*[:\s]+/i, '').trim();
        result.area = val || next || null;
      }
    }

    return result;
  } catch {
    return EMPTY_HEADER_DATA;
  }
}
