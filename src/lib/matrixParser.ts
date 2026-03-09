/**
 * matrixParser.ts
 *
 * Parses pharmaceutical training matrices in the format:
 *   Rows    = Employee Name / Designation
 *   Columns = SOP codes grouped under month headers
 *   Symbol  √ or ✓ → Training Required  (count it)
 *            X / NA / --- → Ignore
 *
 * Supports both DOCX (mammoth → HTML table) and Excel (xlsx).
 *
 * Output: Array of ParsedEntry — only √ marks.
 */

import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import MatrixEntry from '@/models/MatrixEntry';
import connectDB from '@/lib/mongodb';

export interface ParsedEntry {
  employeeName: string;
  designation?: string;
  department: string;
  year: number;
  month: number;       // 1-12
  monthName: string;
  sopCode: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

const TRAINING_REQUIRED_SYMBOLS = new Set([
  '√', '✓', '✔', '☑', '✅', 'v', 'y', 'yes', '1', 'required',
  '\u221a', '\u2713', '\u2714', '\u2611',
]);

const DEPT_MAP: Record<string, string> = {
  'QA': 'Quality Assurance',
  'QUALITY ASSURANCE': 'Quality Assurance',
  'QC': 'Quality Control',
  'QUALITY CONTROL': 'Quality Control',
  'ENGINEERING': 'Engineering',
  'ENGINEERING AND MAINTENANCE': 'Engineering',
  'ENG': 'Engineering',
  'PRODUCTION': 'Production',
  'PROD': 'Production',
  'STORE': 'Store',
  'WAREHOUSE': 'Store',
  'PERSONNEL': 'Personnel',
  'HR': 'Personnel',
  'MICROBIOLOGY': 'Microbiology',
  'MICRO': 'Microbiology',
};

const SKIP_CELLS = new Set([
  'x', 'na', 'n/a', 'n.a', 'n.a.', '---', '--', '-', '', 'no',
  'not applicable', 'not required', 'nr',
]);

const HEADER_SKIP = new Set([
  'sr no', 'sr.no', 'sr.no.', 'sr', 'no', 'no.', 's.no', 's.no.',
  'employee name', 'employee', 'name', 'trainee', 'trainee name',
  'designation', 'post', 'department', 'dept',
  'sop no', 'sop code', 'remarks', 'status', 'signature', 'sign',
]);

const DESIGNATION_WORDS = [
  'officer', 'executive', 'assistant', 'manager', 'supervisor',
  'operator', 'technician', 'trainee', 'helper', 'worker', 'analyst',
  'scientist', 'associate', 'director', 'head', 'lead', 'incharge',
  'in-charge', 'coordinator', 'specialist',
];

// ─── Utility helpers ──────────────────────────────────────────────────────────

function normMonth(s: string): number {
  const lower = s.toLowerCase().trim();
  const idx = MONTH_NAMES.findIndex(m => lower.startsWith(m.substring(0, 3)) || lower.includes(m));
  return idx >= 0 ? idx + 1 : 0;
}

function parseYear(text: string): number {
  const match = text.match(/20\d{2}/);
  return match ? parseInt(match[0]) : new Date().getFullYear();
}

function isTrainingRequired(cell: string): boolean {
  const s = cell.trim().toLowerCase();
  return TRAINING_REQUIRED_SYMBOLS.has(s);
}

function looksLikeSopCode(s: string): boolean {
  // e.g. QAGE01, PRAA01, MBBE05, ENGG12
  return /^[A-Z]{2,6}\d{2,}/i.test(s.trim());
}

function isDesignation(s: string): boolean {
  const lower = s.toLowerCase();
  return DESIGNATION_WORDS.some(d => lower.includes(d));
}

function looksLikeEmployeeName(s: string): boolean {
  if (!s || s.length < 3 || s.length > 80) return false;
  const lower = s.toLowerCase().trim();
  if (HEADER_SKIP.has(lower)) return false;
  if (/^\d+$/.test(s.trim())) return false;
  if (looksLikeSopCode(s)) return false;
  if (isDesignation(s) && !s.includes(' ')) return false;
  // Must have at least one alpha
  if (!/[a-zA-Z]/.test(s)) return false;
  return true;
}

function normalizeDept(raw: string): string {
  if (!raw) return 'General';
  const upper = raw.toUpperCase().trim();
  const key = Object.keys(DEPT_MAP).find(k => upper === k || upper.includes(k));
  return key ? DEPT_MAP[key] : raw.trim();
}

function deptFromFileName(name: string): string {
  const upper = name.toUpperCase();
  const pairs: Array<[string, string]> = [
    ['MICROBIOLOGY', 'Microbiology'],
    ['PERSONNEL',    'Personnel'],
    ['QUALITY ASSURANCE', 'Quality Assurance'],
    ['QA',  'Quality Assurance'],
    ['QUALITY CONTROL', 'Quality Control'],
    ['QC',  'Quality Control'],
    ['PRODUCTION',   'Production'],
    ['ENGINEERING',  'Engineering'],
    ['MAINTENANCE',  'Engineering'],
    ['WAREHOUSE',   'Store'],
    ['STORE',       'Store'],
  ];
  for (const [kw, dept] of pairs) {
    if (upper.includes(kw)) return dept;
  }
  return 'General';
}

// ─── HTML table helpers ───────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseHtmlTables(html: string): string[][][] {
  const tables: string[][][] = [];
  const tableChunks = html.split(/<table/i).slice(1);
  for (const chunk of tableChunks) {
    const tableBody = chunk.split(/<\/table>/i)[0];
    const rowChunks = tableBody.split(/<tr/i).slice(1);
    const rows: string[][] = [];
    for (const rowChunk of rowChunks) {
      const rowBody = rowChunk.split(/<\/tr>/i)[0];
      const cellMatches = rowBody.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
      const cells = cellMatches.map(c => stripHtml(c));
      if (cells.length > 0 && cells.some(c => c.length > 0)) rows.push(cells);
    }
    if (rows.length > 0) tables.push(rows);
  }
  return tables;
}

// ─── Core: Parse DOCX table in month→SOP grid format ─────────────────────────

/**
 * The matrix structure:
 *
 * Row 0:  [empty] [empty] | January              || February
 * Row 1:  [empty] [empty] | SOP1 | SOP2 | SOP3  || SOP1 | SOP2
 * Row 2:  EmpName | Desig | √    |  X   |  √    ||  √   |  ---
 *
 * So we need to:
 * 1. Find "month header" row  (cells containing month names)
 * 2. Find "SOP code" row      (cells containing SOP codes)
 * 3. All subsequent rows are employees
 */
function parseMonthSopGrid(
  table: string[][],
  department: string,
  year: number
): ParsedEntry[] {
  const entries: ParsedEntry[] = [];

  // Step 1: Find the month header row
  let monthRowIdx = -1;
  const monthCols: Array<{ colIdx: number; month: number; monthName: string }> = [];

  for (let r = 0; r < Math.min(8, table.length); r++) {
    const row = table[r];
    const found: typeof monthCols = [];
    for (let c = 0; c < row.length; c++) {
      const mo = normMonth(row[c]);
      if (mo > 0) {
        found.push({ colIdx: c, month: mo, monthName: MONTH_NAMES[mo - 1].charAt(0).toUpperCase() + MONTH_NAMES[mo - 1].slice(1) });
      }
    }
    if (found.length >= 2) { // Need at least 2 months to be confident
      monthRowIdx = r;
      monthCols.push(...found);
      break;
    }
  }

  if (monthRowIdx === -1 || monthCols.length === 0) return entries;

  // Step 2: Find the SOP code row (must be right after month row, or up to 3 rows after)
  // SOP codes appear UNDER each month column (may span multiple cols via merged cells)
  // We need to map each SOP column index → (month, sopCode)
  type SopCol = { colIdx: number; month: number; monthName: string; sopCode: string };
  const sopCols: SopCol[] = [];

  for (let r = monthRowIdx + 1; r < Math.min(monthRowIdx + 5, table.length); r++) {
    const row = table[r];
    const foundSops: SopCol[] = [];

    for (let c = 0; c < row.length; c++) {
      const cell = row[c].trim();
      if (!looksLikeSopCode(cell)) continue;

      // Find which month this column belongs to by walking back through month columns
      // The nearest month col to the left (or equal) owns this SOP col
      let assignedMonth = monthCols[0]; // default
      for (const mc of monthCols) {
        if (mc.colIdx <= c) assignedMonth = mc;
        else break;
      }

      foundSops.push({
        colIdx: c,
        month: assignedMonth.month,
        monthName: assignedMonth.monthName,
        sopCode: cell.toUpperCase(),
      });
    }

    if (foundSops.length >= 2) {
      sopCols.push(...foundSops);
      // Employee rows start after this sop row
      const dataStart = r + 1;

      // Step 3: Parse employee rows
      for (let er = dataStart; er < table.length; er++) {
        const erow = table[er];
        // Column 0 (or 1) = employee name
        const empName = (erow[0] || erow[1] || '').trim();
        if (!empName || !looksLikeEmployeeName(empName)) continue;

        // Column 1 might be designation
        const designation = erow[1] ? erow[1].trim() : undefined;

        for (const sc of sopCols) {
          const cell = (erow[sc.colIdx] || '').trim();
          if (isTrainingRequired(cell)) {
            entries.push({
              employeeName: empName,
              designation: designation && isDesignation(designation) ? designation : undefined,
              department,
              year,
              month: sc.month,
              monthName: sc.monthName,
              sopCode: sc.sopCode,
            });
          }
        }
      }
      break; // Found SOP row, stop searching
    }
  }

  return entries;
}

// ─── DOCX Parser ─────────────────────────────────────────────────────────────

export async function parseDocxMatrix(
  buffer: Buffer,
  fileName: string
): Promise<ParsedEntry[]> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  const { value: text } = await mammoth.extractRawText({ buffer });
  if (!html) throw new Error('No content in DOCX file');

  const department = (() => {
    // Try to find dept from document text first line
    const firstLine = text.split('\n').find(l => l.trim().length > 2) || '';
    const fromText = normalizeDept(firstLine);
    if (fromText !== 'General') return fromText;
    return deptFromFileName(fileName);
  })();

  const year = parseYear(text) || new Date().getFullYear();
  const tables = parseHtmlTables(html);

  let allEntries: ParsedEntry[] = [];
  for (const table of tables) {
    const entries = parseMonthSopGrid(table, department, year);
    allEntries.push(...entries);
  }

  // Deduplicate
  const seen = new Set<string>();
  allEntries = allEntries.filter(e => {
    const key = `${e.employeeName}|${e.department}|${e.year}|${e.month}|${e.sopCode}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return allEntries;
}

// ─── Excel Parser ────────────────────────────────────────────────────────────

export async function parseExcelMatrix(
  buffer: Buffer,
  fileName: string
): Promise<ParsedEntry[]> {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  let allEntries: ParsedEntry[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws['!ref']) continue;

    // Read as raw 2D array (no header maps — we parse col headers ourselves)
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
      blankrows: true,
    }) as any[][];

    if (raw.length < 3) continue;

    // Department: try sheet name, then file name
    let department = normalizeDept(sheetName);
    if (department === sheetName) department = deptFromFileName(fileName);

    // Year: scan top rows
    let year = new Date().getFullYear();
    for (let r = 0; r < Math.min(5, raw.length); r++) {
      const rowStr = raw[r].join(' ');
      const y = parseYear(rowStr);
      if (y > 2000) { year = y; break; }
    }

    // Convert to string[][] and parse same way as docx
    const table: string[][] = raw.map(row =>
      row.map(cell => (cell === null || cell === undefined ? '' : String(cell).trim()))
    );

    const entries = parseMonthSopGrid(table, department, year);
    allEntries.push(...entries);
  }

  // Deduplicate
  const seen = new Set<string>();
  allEntries = allEntries.filter(e => {
    const key = `${e.employeeName}|${e.department}|${e.year}|${e.month}|${e.sopCode}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return allEntries;
}

// ─── Save to DB ───────────────────────────────────────────────────────────────

export async function saveMatrixEntries(
  entries: ParsedEntry[],
  sourceFile: string
): Promise<{ success: number; failed: number; errors: string[] }> {
  await connectDB();
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const e of entries) {
    try {
      // NOTE: $set and $setOnInsert MUST NOT share any field names —
      // MongoDB throws a path conflict error if they do.
      const setFields: Record<string, any> = {
        monthName:   e.monthName,
        sourceFile,
        extractedAt: new Date(),
      };
      // Only set designation if it has a value (undefined causes issues)
      if (e.designation) setFields.designation = e.designation;

      await MatrixEntry.findOneAndUpdate(
        {
          employeeName: e.employeeName,
          department:   e.department,
          year:         e.year,
          month:        e.month,
          sopCode:      e.sopCode,
        },
        {
          $set: setFields,
          $setOnInsert: {
            // monthName deliberately excluded — it is already in $set above
            employeeName: e.employeeName,
            department:   e.department,
            year:         e.year,
            month:        e.month,
            sopCode:      e.sopCode,
          },
        },
        { upsert: true, new: true }
      );
      success++;
    } catch (err: any) {
      failed++;
      errors.push(`${e.employeeName}/${e.sopCode}: ${err.message}`);
    }
  }

  return { success, failed, errors };
}
