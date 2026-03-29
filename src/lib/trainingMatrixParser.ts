import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

export type CellStatus = 'completed' | 'not_required' | 'na' | 'pending';

export interface ParsedEmployee {
  name: string;
  designation: string;
  trainings: Record<string, { status: CellStatus; raw: string; display: string }>;
}

export interface ParsedMatrix {
  department: string;
  month: number;
  year: number;
  monthName: string;
  sopCodes: string[];
  employees: ParsedEmployee[];
  /** debug info so UI can explain what was found */
  _debug?: {
    headerRowIdx: number;
    employeeColIdx: number;
    designationColIdx: number;
    totalRows: number;
    sheetName: string;
  };
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_MAP: Record<string, number> = {
  jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
  january:1, february:2, march:3, april:4, may2:5, june:6, july:7, august:8,
  september:9, october:10, november:11, december:12,
};

const DEPT_KEYWORDS: Record<string, string> = {
  qa: 'QA', qc: 'QC', production: 'Production', prod: 'Production',
  engineering: 'Engineering', eng: 'Engineering', store: 'Store',
  personnel: 'Personnel', hr: 'Personnel', micro: 'Microbiology',
  microbiology: 'Microbiology', rd: 'R&D', admin: 'Admin',
};

export function detectDepartmentFromFilename(filename: string): string {
  const lower = filename.toLowerCase().replace(/[^a-z]/g, ' ');
  for (const [key, value] of Object.entries(DEPT_KEYWORDS)) {
    const re = new RegExp(`\\b${key}\\b`);
    if (re.test(lower)) return value;
  }
  const stem = filename
    .replace(/\.(xlsx|xls|xlsm|docx|doc)$/i, '')
    .replace(/[_\-]/g, ' ')
    .trim();
  return stem || 'Unknown';
}

export function detectMonthYearFromText(text: string): { month: number; year: number } | null {
  const patterns = [
    /(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*)[.\s,\-\/]*?(20\d{2}|\d{2})\b/i,
    /(20\d{2})\s*[,\-\/]\s*(0?[1-9]|1[0-2])\b/,
    /(0?[1-9]|1[0-2])\s*[,\-\/]\s*(20\d{2})\b/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    if (/[a-z]/i.test(m[1])) {
      const mNum = MONTH_MAP[m[1].toLowerCase().slice(0, 3)];
      const yr = m[2].length === 2 ? 2000 + parseInt(m[2]) : parseInt(m[2]);
      if (mNum) return { month: mNum, year: yr };
    }
    if (parseInt(m[1]) > 1000) return { month: parseInt(m[2]), year: parseInt(m[1]) };
    return { month: parseInt(m[1]), year: parseInt(m[2]) };
  }
  return null;
}

/** Normalise any cell value to a CellStatus */
export function parseCellStatus(raw: string | number | boolean | null | undefined): { status: CellStatus; raw: string; display: string } {
  if (raw === null || raw === undefined || raw === '') return { status: 'pending', raw: '', display: '' };
  const s = String(raw).trim();
  if (!s) return { status: 'pending', raw: '', display: '' };
  const lo = s.toLowerCase();

  // Completed
  if (
    s === '√' || s === '✓' || s === '✔' ||
    lo === 'v' || lo === 'y' || lo === 'yes' || lo === 'done' ||
    lo === 'trained' || lo === 'completed' || lo === 'ok' ||
    s.includes('√') || s.includes('✓') || s.includes('✔')
  ) return { status: 'completed', raw: s, display: '√' };

  // Not required
  if (
    s.toUpperCase() === 'X' || s === '×' || s === '✗' || s === '✘' ||
    lo === 'no' || lo === 'not required' || lo === 'nr'
  ) return { status: 'not_required', raw: s, display: 'X' };

  // Not applicable
  if (
    s === '--' || s === '-' || s === '—' ||
    lo === 'na' || lo === 'n/a' || lo === 'not applicable' ||
    lo === 'nil' || lo === 'n.a.' || lo === 'n.a'
  ) return { status: 'na', raw: s, display: '--' };

  // Number: >0 → completed, 0 → not_required
  const n = parseFloat(s);
  if (!isNaN(n)) return n > 0
    ? { status: 'completed', raw: s, display: '√' }
    : { status: 'not_required', raw: s, display: 'X' };

  return { status: 'pending', raw: s, display: s };
}

/** SOP code patterns used across pharma companies */
function looksLikeSopCode(s: string): boolean {
  if (!s || s.length < 3) return false;
  const t = s.trim();
  // PRCL13-06, BSGE01-05, MAGE01-07, QCMI01-00, MAGE01, PREG01
  if (/^[A-Z]{2,8}-?\d{1,4}(-\d{1,4})?$/i.test(t)) return true;
  // SOP/001, QA/001
  if (/^[A-Z]{1,6}\/\d{2,5}$/i.test(t)) return true;
  // SOP-001
  if (/^(sop|stp|sos|std)\s*[\-\/]?\s*\d+/i.test(t)) return true;
  return false;
}

/** Permissive name check — Latin, Gujarati, Devanagari, Bengali scripts; skips headers / SOP-like cells */
function looksLikeEmployeeName(s: string): boolean {
  if (!s || s.length < 2 || s.length > 80) return false;
  const t = s.trim();
  if (/^\d+\.?\s/.test(t)) return false;
  if (/^\d+$/.test(t)) return false;
  if (looksLikeSopCode(t)) return false;
  if (
    /^(sr\.?\s*no|s\.?\s*no|sno\.?|no\.?|employee\s*name|emp\.?\s*name|name|designation|desig|department|dept|month|year|total|sop\s*no|training|category|status|remark)/i.test(
      t,
    )
  )
    return false;
  // Indic scripts common in Indian org charts
  if (/[\u0A80-\u0AFF\u0900-\u097F\u0980-\u09FF]/.test(t)) return true;
  return /^[A-Za-z][A-Za-z0-9\s.\-'",()]+$/.test(t);
}

/** Skip header/footer-like rows */
function isHeaderOrFooterRow(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase();
  return /total|grand\s*total|sub\s*total|signature|approved\s*by|checked\s*by|prepared\s*by|page\s*\d/.test(joined);
}

/**
 * Parse one sheet’s grid. Prefer the sheet with the most employees × SOPs (cover sheets often come first).
 */
function parseTrainingMatrixFromRows(
  rows: (string | number | null)[][],
  filename: string,
  sheetName: string,
): ParsedMatrix {
  const department = detectDepartmentFromFilename(filename);

  // Detect month/year from first 15 rows
  let detectedDate = { month: new Date().getMonth() + 1, year: new Date().getFullYear() };
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const rowText = rows[i].map(c => String(c ?? '')).join(' ');
    const d = detectMonthYearFromText(rowText);
    if (d) { detectedDate = d; break; }
  }

  // ── Find the header row ────────────────────────────────────────────────────
  // A header row has the most SOP codes. Scan first 30 rows.
  let headerRowIdx = -1;
  let maxSopCount = 0;

  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const row = rows[i].map(c => String(c ?? '').trim());
    const sopCount = row.filter(c => looksLikeSopCode(c)).length;
    if (sopCount > maxSopCount) {
      maxSopCount = sopCount;
      headerRowIdx = i;
    }
  }

  // Fallback: if no SOP codes found, use the row that has the most non-empty cells in cols 2+
  if (maxSopCount === 0) {
    let maxCols = 0;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i].map(c => String(c ?? '').trim());
      const nonEmpty = row.slice(2).filter(c => c.length > 0).length;
      if (nonEmpty > maxCols) { maxCols = nonEmpty; headerRowIdx = i; }
    }
  }

  if (headerRowIdx === -1) headerRowIdx = 0;

  const headerRow = rows[headerRowIdx].map(c => String(c ?? '').trim());

  // ── Identify columns ───────────────────────────────────────────────────────
  let employeeColIdx = -1;
  let designationColIdx = -1;
  const sopColMap: Record<string, number> = {};

  for (let j = 0; j < headerRow.length; j++) {
    const v = headerRow[j].toLowerCase();
    if (employeeColIdx === -1 && (v.includes('name') || v.includes('employee') || v === 'emp')) {
      employeeColIdx = j;
    } else if (designationColIdx === -1 && (v.includes('desig') || v.includes('post') || v.includes('position'))) {
      designationColIdx = j;
    }
    if (looksLikeSopCode(headerRow[j])) {
      sopColMap[headerRow[j]] = j;
    }
  }

  // If no "name" header found, pick the first text column (usually col 0 or 1)
  if (employeeColIdx === -1) {
    // Scan the rows below the header, pick the column where most cells look like names
    const testRows = rows.slice(headerRowIdx + 1, headerRowIdx + 10);
    let bestCol = 0;
    let bestScore = 0;
    for (let j = 0; j < Math.min(5, headerRow.length); j++) {
      const score = testRows.filter(r => looksLikeEmployeeName(String(r[j] ?? '').trim())).length;
      if (score > bestScore) { bestScore = score; bestCol = j; }
    }
    employeeColIdx = bestCol;
  }

  // If no designation col, use next column after employee col
  if (designationColIdx === -1 && employeeColIdx >= 0) {
    designationColIdx = employeeColIdx + 1;
  }

  // If no SOP codes in header, use all non-name columns as SOP codes (positional)
  const sopCodes = Object.keys(sopColMap);
  let firstSopColIdx = sopCodes.length > 0
    ? Math.min(...Object.values(sopColMap))
    : Math.max(employeeColIdx + 2, designationColIdx + 1);

  if (sopCodes.length === 0) {
    // Use column headers starting from firstSopColIdx as SOP code labels
    for (let j = firstSopColIdx; j < headerRow.length; j++) {
      const v = headerRow[j];
      if (v && v.length > 0) {
        sopCodes.push(v);
        sopColMap[v] = j;
      }
    }
  }

  // ── Extract employee rows ──────────────────────────────────────────────────
  const employees: ParsedEmployee[] = [];
  const startRow = headerRowIdx + 1;

  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i].map(c => String(c ?? '').trim());

    // Skip completely empty rows
    if (row.every(c => !c)) continue;
    // Skip header/footer rows
    if (isHeaderOrFooterRow(row)) continue;

    const nameRaw = (row[employeeColIdx] ?? '').trim();
    if (!looksLikeEmployeeName(nameRaw)) continue;

    const emp: ParsedEmployee = {
      name: nameRaw,
      designation: designationColIdx >= 0 ? (row[designationColIdx] ?? '') : '',
      trainings: {},
    };

    if (Object.keys(sopColMap).length > 0) {
      for (const [sop, colIdx] of Object.entries(sopColMap)) {
        emp.trainings[sop] = parseCellStatus(row[colIdx] ?? '');
      }
    } else {
      sopCodes.forEach((sop, j) => {
        emp.trainings[sop] = parseCellStatus(row[firstSopColIdx + j] ?? '');
      });
    }

    employees.push(emp);
  }

  return {
    department,
    month: detectedDate.month,
    year: detectedDate.year,
    monthName: MONTH_NAMES[detectedDate.month - 1],
    sopCodes: [...new Set(sopCodes)],
    employees,
    _debug: {
      headerRowIdx,
      employeeColIdx,
      designationColIdx,
      totalRows: rows.length,
      sheetName,
    },
  };
}

function stripHtmlCell(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tables as extracted from mammoth HTML (one grid per Word table). */
function extractTablesFromMammothHtml(html: string): string[][][] {
  const tables: string[][][] = [];
  const tableRe = /<table\b[^>]*>([\s\S]*?)<\/table>/gi;
  let tm: RegExpExecArray | null;
  while ((tm = tableRe.exec(html)) !== null) {
    const inner = tm[1];
    const rows: string[][] = [];
    const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let trm: RegExpExecArray | null;
    while ((trm = trRe.exec(inner)) !== null) {
      const trInner = trm[1];
      const cells: string[] = [];
      const tdRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let tdm: RegExpExecArray | null;
      while ((tdm = tdRe.exec(trInner)) !== null) {
        cells.push(stripHtmlCell(tdm[1]));
      }
      if (cells.length) rows.push(cells);
    }
    if (rows.length >= 2) tables.push(rows);
  }
  return tables;
}

/**
 * Training matrix saved as Word: must use a real table (Insert → Table) with the same layout as Excel
 * (employee / designation columns + SOP code headers + training marks).
 */
export async function parseTrainingMatrixDocx(
  buffer: Buffer,
  filename: string,
): Promise<ParsedMatrix> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const tables = extractTablesFromMammothHtml(html);
  let best: ParsedMatrix | null = null;
  let bestScore = -1;
  for (let i = 0; i < tables.length; i++) {
    const grid = tables[i].map((row) =>
      row.map((c) => c) as (string | number | null)[],
    ) as (string | number | null)[][];
    const parsed = parseTrainingMatrixFromRows(grid, filename, `Word table ${i + 1}`);
    const score = parsed.employees.length * 10_000 + parsed.sopCodes.length;
    if (score > bestScore) {
      bestScore = score;
      best = parsed;
    }
  }
  if (best && (best.employees.length > 0 || best.sopCodes.length > 0)) {
    return best;
  }
  if (tables.length === 0) {
    throw new Error(
      'No tables found in this Word file. Use Insert → Table for the matrix, or upload an Excel .xlsx file.',
    );
  }
  throw new Error(
    'Could not read employee rows and SOP columns from the Word table. Match your Excel layout (names + SOP headers + marks), or save as .xlsx.',
  );
}

/** Excel or Word (.docx) training matrix — use this from the upload API. */
export async function parseTrainingMatrixFile(
  buffer: Buffer,
  filename: string,
): Promise<ParsedMatrix> {
  const fn = (filename || '').trim();
  if (/\.docx$/i.test(fn)) {
    return parseTrainingMatrixDocx(buffer, filename);
  }
  if (/\.doc$/i.test(fn) && !/\.docx$/i.test(fn)) {
    throw new Error(
      'Legacy Word .doc is not supported. Open the file in Word and save as .docx, then upload again.',
    );
  }
  return parseTrainingMatrixExcel(buffer, filename);
}

export function parseTrainingMatrixExcel(buffer: Buffer, filename: string): ParsedMatrix {
  const fn = (filename || '').trim();
  if (fn && !/\.(xlsx|xls|xlsm)$/i.test(fn)) {
    throw new Error('Expected an Excel file (.xlsx, .xls, .xlsm).');
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellText: true, cellNF: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/workbook|zip|unsupported|invalid|corrupt/i.test(msg)) {
      throw new Error(
        'Could not read this file as Excel. If it is a Word document (.docx), use Save As → Excel (.xlsx) and upload the .xlsx file.',
      );
    }
    throw e instanceof Error ? e : new Error(String(e));
  }

  let best: ParsedMatrix | null = null;
  let bestScore = -1;

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet?.['!ref']) continue;
    const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: '',
    }) as unknown as (string | number | null)[][];
    if (!rows.length) continue;

    const parsed = parseTrainingMatrixFromRows(rows, filename, name);
    const score = parsed.employees.length * 10_000 + parsed.sopCodes.length;
    if (score > bestScore) {
      bestScore = score;
      best = parsed;
    }
  }

  if (best) return best;

  const now = new Date();
  return {
    department: detectDepartmentFromFilename(filename),
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    monthName: MONTH_NAMES[now.getMonth()],
    sopCodes: [],
    employees: [],
    _debug: {
      headerRowIdx: -1,
      employeeColIdx: -1,
      designationColIdx: -1,
      totalRows: 0,
      sheetName: workbook.SheetNames[0] ?? '',
    },
  };
}
