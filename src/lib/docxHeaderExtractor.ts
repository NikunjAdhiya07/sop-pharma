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
    _imageMap = buildImageMap(zip);
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
/** Build a map of rId → base64 data URI for all images in the DOCX. */
function buildImageMap(zip: AdmZip): Map<string, string> {
  const map = new Map<string, string>();
  try {
    const relsXml = zip.readAsText('word/_rels/document.xml.rels');
    if (!relsXml) return map;
    // Simple regex parse — avoids async for a sync helper
    const rel = /Type="[^"]*\/image"[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = rel.exec(relsXml)) !== null) {
      const rId = m[1];
      const target = m[2];
      const path = target.startsWith('word/') ? target : `word/${target}`;
      try {
        const entry = zip.getEntry(path);
        if (!entry) continue;
        const data = entry.getData();
        const ext = path.split('.').pop()?.toLowerCase() || 'png';
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
          : ext === 'png' ? 'image/png'
          : ext === 'gif' ? 'image/gif'
          : ext === 'emf' || ext === 'wmf' ? 'image/x-emf'
          : 'image/png';
        map.set(rId, `data:${mime};base64,${data.toString('base64')}`);
      } catch { /* skip missing entries */ }
    }
  } catch { /* ignore */ }
  return map;
}

// Module-level image map — set before parsing each document, consumed by renderRun
let _imageMap: Map<string, string> = new Map();

export async function extractDocumentBodyHtmlFromDocx(buffer: Buffer): Promise<string> {
  try {
    const zip = new AdmZip(buffer);
    // Build image map so renderRun can embed inline images
    _imageMap = buildImageMap(zip);
    const docXml = zip.readAsText('word/document.xml');
    if (!docXml) return '';

    // Parse 1: standard parse — child element data is accessible by key (w:p, w:tbl, w:r, etc.)
    // This is what all helper functions (paragraphToHtml, tableToHtml, etc.) expect.
    const parsed = await parseStringPromise(docXml);

    // Parse 2: order-preserving parse — gives us the correct w:p / w:tbl sequence via $$
    const parsedOrdered = await parseStringPromise(docXml, {
      explicitArray: true,
      explicitChildren: true,
      preserveChildrenOrder: true,
      charsAsChildren: false,
    });

    // Navigate both parse results to w:body
    function getBody(obj: any): any {
      const docKey = Object.keys(obj || {}).find(
        (k) => k === 'w:document' || k.endsWith(':document') || k === 'document'
      );
      const docObj = docKey ? (Array.isArray(obj[docKey]) ? obj[docKey][0] : obj[docKey]) : obj;
      const bodyKey = Object.keys(docObj || {}).find(
        (k) => k === 'w:body' || k.endsWith(':body') || k === 'body'
      );
      const bodyRaw = bodyKey ? docObj?.[bodyKey] : undefined;
      return Array.isArray(bodyRaw) ? bodyRaw[0] : bodyRaw;
    }

    const body = getBody(parsed);
    const bodyOrdered = getBody(parsedOrdered);
    if (!body || typeof body !== 'object') return '';

    return convertBodyToHtmlOrdered(bodyOrdered, body);
  } catch {
    return '';
  }
}

/**
 * Convert body preserving document order.
 * @param bodyOrdered - parsed with explicitChildren+preserveChildrenOrder; provides $$ order list
 * @param bodyData    - standard parse result; provides element data consumed by helper functions
 */
function convertBodyToHtmlOrdered(bodyOrdered: any, bodyData: any): string {
  const parts: string[] = [];
  // $$ contains [{#name:'w:p',...}, {#name:'w:tbl',...}] in document order
  const ordered: any[] = Array.isArray(bodyOrdered?.$$) ? bodyOrdered.$$ : [];
  if (ordered.length === 0) {
    return convertBodyToHtml(bodyData);
  }

  // Build index maps from the standard parse so helpers get correct data format
  const pList: any[] = Array.isArray(bodyData?.['w:p']) ? bodyData['w:p'] : bodyData?.['w:p'] != null ? [bodyData['w:p']] : [];
  const tList: any[] = Array.isArray(bodyData?.['w:tbl']) ? bodyData['w:tbl'] : bodyData?.['w:tbl'] != null ? [bodyData['w:tbl']] : [];
  let pIdx = 0;
  let tIdx = 0;

  for (const child of ordered) {
    const name: string = child['#name'] || '';
    if (name === 'w:p') {
      if (pIdx < pList.length) parts.push(paragraphToHtml(pList[pIdx++]));
    } else if (name === 'w:tbl') {
      if (tIdx < tList.length) parts.push(tableToHtml(tList[tIdx++]));
    }
  }
  return parts.join('\n');
}

/** Convert Word body (w:body or w:hdr) to HTML - same logic for header and main document. */
function convertBodyToHtml(body: any): string {
  const parts: string[] = [];
  const childKeys = Object.keys(body).filter((k) => k !== '$' && k !== '$$');
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

const TABLE_STYLE = 'border-collapse:collapse;table-layout:fixed;width:100%;font-family:\'Times New Roman\',serif;font-size:11pt;word-break:break-word;';
const CELL_STYLE_BASE = 'border:1px solid #000;padding:3px 6px;vertical-align:top;text-align:left;overflow-wrap:break-word;word-break:break-word;';

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

function getParagraphSpacing(p: any): { before: number; after: number; line: number | null } {
  const pPr = p?.['w:pPr'];
  const spacing = pPr?.['w:spacing'];
  const list = Array.isArray(spacing) ? spacing : spacing != null ? [spacing] : [];
  const el = list[0];
  // Values in twentieths of a point (twips); convert to pt
  const before = el?.$?.['w:before'] != null ? parseFloat(String(el.$['w:before'])) / 20 : 0;
  const after = el?.$?.['w:after'] != null ? parseFloat(String(el.$['w:after'])) / 20 : 0;
  const lineRaw = el?.$?.['w:line'];
  // line is in 240ths of a line (240 = single); convert to em-ish
  const line = lineRaw != null ? parseFloat(String(lineRaw)) / 240 : null;
  return { before, after, line };
}

function paragraphToHtml(p: any): string {
  const html = getParagraphAsHtml(p);
  const align = getParagraphAlignment(p);
  const { before, after, line } = getParagraphSpacing(p);
  let style = `margin:${before > 0 ? before + 'pt' : '0'} 0 ${after > 0 ? after + 'pt' : '2px'} 0;text-align:${align};`;
  if (line !== null) style += `line-height:${line.toFixed(3)};`;
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

function getRunFontSize(run: any): number | null {
  const pr = run?.['w:rPr'];
  if (!pr || typeof pr !== 'object') return null;
  // w:sz is in half-points; w:szCs is for complex scripts (Gujarati)
  const sz = pr['w:szCs'] ?? pr['w:sz'];
  const list = Array.isArray(sz) ? sz : sz != null ? [sz] : [];
  const val = list[0]?.$?.['w:val'];
  if (val == null) return null;
  const n = parseFloat(String(val));
  return Number.isFinite(n) && n > 0 ? n / 2 : null; // half-points → points
}

function getRunColor(run: any): string | null {
  const pr = run?.['w:rPr'];
  if (!pr || typeof pr !== 'object') return null;
  const color = pr['w:color'];
  const list = Array.isArray(color) ? color : color != null ? [color] : [];
  const val = list[0]?.$?.['w:val'];
  if (!val || val === 'auto' || val === '000000') return null;
  return `#${val}`;
}

/** Extract rId from a w:drawing element (supports both inline and anchor). */
function getDrawingRId(run: any): string | null {
  // w:drawing > wp:inline or wp:anchor > a:graphic > a:graphicData > pic:pic > pic:blipFill > a:blip @r:embed
  const drawing = run?.['w:drawing'];
  const drawList = Array.isArray(drawing) ? drawing : drawing != null ? [drawing] : [];
  for (const d of drawList) {
    // Try inline
    for (const wrapKey of ['wp:inline', 'wp:anchor']) {
      const wrap = d?.[wrapKey];
      const wList = Array.isArray(wrap) ? wrap : wrap != null ? [wrap] : [];
      for (const w of wList) {
        const graphic = w?.['a:graphic'];
        const gList = Array.isArray(graphic) ? graphic : graphic != null ? [graphic] : [];
        for (const g of gList) {
          const gd = g?.['a:graphicData'];
          const gdList = Array.isArray(gd) ? gd : gd != null ? [gd] : [];
          for (const gdi of gdList) {
            const pic = gdi?.['pic:pic'];
            const pList = Array.isArray(pic) ? pic : pic != null ? [pic] : [];
            for (const pi of pList) {
              const blipFill = pi?.['pic:blipFill'];
              const bfList = Array.isArray(blipFill) ? blipFill : blipFill != null ? [blipFill] : [];
              for (const bf of bfList) {
                const blip = bf?.['a:blip'];
                const blipList = Array.isArray(blip) ? blip : blip != null ? [blip] : [];
                for (const b of blipList) {
                  const rId = b?.$?.['r:embed'];
                  if (rId) return rId;
                }
              }
            }
          }
        }
      }
    }
  }
  return null;
}

/** Extract image dimensions from w:drawing in EMUs (1 in = 914400 EMU). */
function getDrawingSize(run: any): { w: number; h: number } | null {
  const drawing = run?.['w:drawing'];
  const drawList = Array.isArray(drawing) ? drawing : drawing != null ? [drawing] : [];
  for (const d of drawList) {
    for (const wrapKey of ['wp:inline', 'wp:anchor']) {
      const wrap = d?.[wrapKey];
      const wList = Array.isArray(wrap) ? wrap : wrap != null ? [wrap] : [];
      for (const w of wList) {
        const ext = w?.['wp:extent'];
        const extList = Array.isArray(ext) ? ext : ext != null ? [ext] : [];
        for (const e of extList) {
          const cx = parseFloat(String(e?.$?.cx ?? '0'));
          const cy = parseFloat(String(e?.$?.cy ?? '0'));
          if (cx > 0 && cy > 0) {
            // EMU → points (1 pt = 12700 EMU)
            return { w: cx / 12700, h: cy / 12700 };
          }
        }
      }
    }
  }
  return null;
}

function renderRun(run: any): string {
  // Handle inline images (w:drawing)
  const rId = getDrawingRId(run);
  if (rId) {
    const src = _imageMap.get(rId);
    if (src) {
      const size = getDrawingSize(run);
      const style = size
        ? `width:${size.w.toFixed(1)}pt;height:${size.h.toFixed(1)}pt;display:inline-block;vertical-align:middle;`
        : `max-width:100%;height:auto;display:inline-block;vertical-align:middle;`;
      return `<img src="${src}" alt="" style="${style}" />`;
    }
  }

  const text = getTextFromRun(run);
  const safe = escapeHtml(text);
  const br = hasLineBreak(run) ? '<br />' : '';
  if (!safe && !br) return '';
  let out = safe || '';
  if (isBold(run) && out) out = `<strong>${out}</strong>`;
  if (isItalic(run) && out) out = `<em>${out}</em>`;
  if (isUnderline(run) && out) out = `<u>${out}</u>`;
  const fontSize = getRunFontSize(run);
  const color = getRunColor(run);
  if ((fontSize !== null || color !== null) && out) {
    let spanStyle = '';
    if (fontSize !== null) spanStyle += `font-size:${fontSize}pt;`;
    if (color !== null) spanStyle += `color:${color};`;
    out = `<span style="${spanStyle}">${out}</span>`;
  }
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

function getTblWidth(tbl: any): string | null {
  const tblPr = tbl?.['w:tblPr'];
  if (!tblPr || typeof tblPr !== 'object') return null;
  const tblW = tblPr['w:tblW'];
  const list = Array.isArray(tblW) ? tblW : tblW != null ? [tblW] : [];
  const el = list[0];
  if (!el) return null;
  const w = el?.$?.['w:w'];
  const type = el?.$?.['w:type'];
  if (w == null) return null;
  const n = parseFloat(String(w));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (type === 'pct') return `${(n / 50).toFixed(2)}%`;
  if (type === 'dxa') return `${(n / 20).toFixed(2)}pt`;
  return null;
}

function tableToHtml(tbl: any): string {
  const trList = tbl?.['w:tr'] ?? [];
  const trs = Array.isArray(trList) ? trList : [trList];
  const gridWidths = getTblGridWidths(tbl);
  const tblWidth = getTblWidth(tbl);
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
    if (tds.length) {
      const trPr = trs[r]?.['w:trPr'];
      const trHList = Array.isArray(trPr?.['w:trHeight']) ? trPr['w:trHeight'] : trPr?.['w:trHeight'] != null ? [trPr['w:trHeight']] : [];
      const trHVal = trHList[0]?.$?.['w:val'];
      const trHRule = trHList[0]?.$?.['w:hRule'];
      let trStyle = '';
      if (trHVal != null) {
        const hPt = parseFloat(String(trHVal)) / 20;
        if (Number.isFinite(hPt) && hPt > 0) {
          // exact = fixed height; atLeast = min height
          trStyle = trHRule === 'exact'
            ? `style="height:${hPt}pt;overflow:hidden;"`
            : `style="height:${hPt}pt;"`;
        }
      }
      rows.push(`<tr${trStyle ? ' ' + trStyle : ''}>${tds.join('')}</tr>`);
    }
  }
  if (!rows.length) return '';
  const widthOverride = tblWidth ? `width:${tblWidth};` : '';
  const tableStyle = widthOverride ? TABLE_STYLE.replace('width:100%;', widthOverride) : TABLE_STYLE;
  return `<table style="${tableStyle}" cellpadding="0" cellspacing="0">${colgroupHtml}<tbody>${rows.join('')}</tbody></table>`;
}

function getCellBackground(tc: any): string | null {
  const tcPr = tc?.['w:tcPr'];
  if (!tcPr || typeof tcPr !== 'object') return null;
  const shd = tcPr['w:shd'];
  const list = Array.isArray(shd) ? shd : shd != null ? [shd] : [];
  const fill = list[0]?.$?.['w:fill'];
  if (!fill || fill === 'auto' || fill === 'FFFFFF' || fill === 'ffffff') return null;
  return `#${fill}`;
}

function getCellWidth(tc: any): string | null {
  const tcPr = tc?.['w:tcPr'];
  if (!tcPr || typeof tcPr !== 'object') return null;
  const tcW = tcPr['w:tcW'];
  const list = Array.isArray(tcW) ? tcW : tcW != null ? [tcW] : [];
  const el = list[0];
  if (!el) return null;
  const w = el?.$?.['w:w'];
  const type = el?.$?.['w:type'];
  if (w == null) return null;
  const n = parseFloat(String(w));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (type === 'pct') return `${(n / 50).toFixed(2)}%`; // fifths of a percent
  if (type === 'dxa') return `${(n / 20).toFixed(2)}pt`; // twips
  return null;
}

function getCellStyle(tc: any): string {
  const align = getCellAlign(tc);
  let s = CELL_STYLE_BASE;
  if (align.vertical) s += `vertical-align:${align.vertical};`;
  if (align.horizontal) s += `text-align:${align.horizontal};`;
  const bg = getCellBackground(tc);
  if (bg) s += `background-color:${bg};`;
  const w = getCellWidth(tc);
  if (w) s += `width:${w};`;
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
  /** Raw date string from "EXPIRY DATE" / "VALID TILL" cell, e.g. "22/07/2026" */
  expiryDate: string | null;
  subject: string | null;
  department: string | null;
  area: string | null;
}

const EMPTY_HEADER_DATA: SOPHeaderTableData = {
  sopNo: null,
  effDate: null,
  reviewDate: null,
  expiryDate: null,
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
/** Collect cell texts from up to `maxTables` tables in a parsed XML body/header object. */
function collectCellTextsFromBody(body: any, maxTables = 3): string[] {
  const texts: string[] = [];
  const tblRaw = body['w:tbl'] ?? [];
  const tables = Array.isArray(tblRaw) ? tblRaw : tblRaw ? [tblRaw] : [];
  for (const tbl of tables.slice(0, maxTables)) {
    const trRaw = tbl['w:tr'] ?? [];
    const rows = Array.isArray(trRaw) ? trRaw : trRaw ? [trRaw] : [];
    for (const tr of rows) {
      const tcRaw = tr['w:tc'] ?? [];
      const cells = Array.isArray(tcRaw) ? tcRaw : tcRaw ? [tcRaw] : [];
      for (const tc of cells) {
        const text = getAllCellText(tc).trim();
        if (text) texts.push(text);
      }
    }
  }
  return texts;
}

export async function extractSOPHeaderTableData(buffer: Buffer): Promise<SOPHeaderTableData> {
  try {
    const zip = new AdmZip(buffer);

    // Collect cell texts from ALL header XMLs + the document body.
    // Many SOPs put the metadata table (SOP NO., EFF. DATE, REVIEW DT.) in a
    // Word page-header (header1/2/3.xml) rather than the document body.
    const allCellTexts: string[] = [];

    // 1. Read all header files referenced in the rels
    const relsXml = zip.readAsText('word/_rels/document.xml.rels');
    if (relsXml) {
      const rels = await parseStringPromise(relsXml);
      const relList: any[] = Array.isArray(rels?.Relationships?.Relationship)
        ? rels.Relationships.Relationship
        : rels?.Relationships?.Relationship
        ? [rels.Relationships.Relationship]
        : [];
      for (const rel of relList) {
        const type: string = rel?.$?.Type ?? '';
        if (!type.endsWith('/header')) continue;
        const target: string = rel?.$?.Target ?? '';
        const path = target.startsWith('word/') ? target : `word/${target}`;
        const xml = zip.readAsText(path);
        if (!xml) continue;
        try {
          const parsed = await parseStringPromise(xml);
          const rootKey = Object.keys(parsed || {}).find(
            (k) => k === 'w:hdr' || k.endsWith(':hdr') || k === 'hdr',
          );
          const hdrRaw = rootKey ? parsed[rootKey] : undefined;
          const hdr = Array.isArray(hdrRaw) ? hdrRaw[0] : hdrRaw;
          if (hdr && typeof hdr === 'object') {
            allCellTexts.push(...collectCellTextsFromBody(hdr, 5));
          }
        } catch { /* skip malformed header */ }
      }
    }

    // 2. Also scan the document body (some SOPs embed the header table in the body)
    const docXml = zip.readAsText('word/document.xml');
    if (docXml) {
      try {
        const parsed = await parseStringPromise(docXml);
        const docKey = Object.keys(parsed || {}).find(
          (k) => k === 'w:document' || k.endsWith(':document') || k === 'document',
        );
        const docObj = docKey
          ? Array.isArray(parsed[docKey]) ? parsed[docKey][0] : parsed[docKey]
          : parsed;
        const bodyKey = Object.keys(docObj || {}).find(
          (k) => k === 'w:body' || k.endsWith(':body') || k === 'body',
        );
        const bodyRaw = bodyKey ? docObj[bodyKey] : undefined;
        const body = Array.isArray(bodyRaw) ? bodyRaw[0] : bodyRaw;
        if (body && typeof body === 'object') {
          allCellTexts.push(...collectCellTextsFromBody(body, 3));
        }
      } catch { /* skip */ }
    }

    if (allCellTexts.length === 0) return EMPTY_HEADER_DATA;

    const result: SOPHeaderTableData = { ...EMPTY_HEADER_DATA };

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

      // ── EXPIRY DATE ──────────────────────────────────────────────────────────
      // Match "EXPIRY DATE", "DATE OF EXPIRY", "VALID TILL/UPTO/UNTIL", "EXP. DATE"
      if (
        !result.expiryDate &&
        (
          /(?:^|\b)(?:expir(?:y|ation)|exp\.?|valid\s*(?:till|upto|up\s*to|until)|date\s*of\s*expir(?:y|ation))\s*(?:date|dt)?\.?/i.test(norm)
        )
      ) {
        const inlineExp = norm.match(
          /(?:expir(?:y|ation)|exp\.?|valid\s*(?:till|upto|up\s*to|until)|date\s*of\s*expir(?:y|ation))\s*(?:date|dt)?\.?\s*[:\s]+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/i,
        );
        if (inlineExp) {
          result.expiryDate = inlineExp[1];
        } else {
          const li = lines.findIndex((l) =>
            /(?:expir(?:y|ation)|exp\.?|valid\s*(?:till|upto|up\s*to|until)|date\s*of\s*expir(?:y|ation))\s*(?:date|dt)?/i.test(l),
          );
          if (li >= 0) {
            const sameLine = lines[li].match(
              /(?:expir(?:y|ation)|exp\.?|valid\s*(?:till|upto|up\s*to|until)|date\s*of\s*expir(?:y|ation))\s*(?:date|dt)?\.?\s*[:\s]+([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/i,
            );
            if (sameLine) {
              result.expiryDate = sameLine[1];
            } else if (li + 1 < lines.length) {
              const dm = lines[li + 1].match(DATE_RE);
              if (dm) result.expiryDate = dm[1];
            }
          }
          if (!result.expiryDate) {
            const nm = next.match(/^([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/);
            if (nm) result.expiryDate = nm[1];
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
