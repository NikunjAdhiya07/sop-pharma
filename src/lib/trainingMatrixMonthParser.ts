import * as XLSX from 'xlsx';

export interface ParsedMatrixEmployee {
  name: string;
  designation: string;
  training: Record<string, boolean>;
}

export interface ParsedMatrixSnapshot {
  sopCodes: string[];
  sopMonthMap: Record<string, string>;
  monthCounts: Record<string, number>;
  employees: ParsedMatrixEmployee[];
}

const MONTH_UPPER = [
  'JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
  'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER',
];
const MONTH_TITLE: Record<string, string> = {
  JANUARY: 'January', FEBRUARY: 'February', MARCH: 'March', APRIL: 'April',
  MAY: 'May', JUNE: 'June', JULY: 'July', AUGUST: 'August',
  SEPTEMBER: 'September', OCTOBER: 'October', NOVEMBER: 'November', DECEMBER: 'December',
};

const DEPT_FROM_FILENAME: Array<[RegExp, string]> = [
  [/\bqa\b|quality\s*assur/i, 'QA'],
  [/\bqc\b|quality\s*contr/i, 'QC'],
  [/micro/i, 'Microbiology'],
  [/production|prod\b/i, 'Production'],
  [/store/i, 'Store'],
  [/engineer|eng\b|maint/i, 'Engineering'],
  [/personnel|hr\b/i, 'Personnel'],
];

export function detectDepartmentFromName(filename: string): string {
  for (const [re, dept] of DEPT_FROM_FILENAME) {
    if (re.test(filename)) return dept;
  }
  // Map file-code prefixes like TM-QA -> QA
  const m = filename.match(/TM-([A-Z]{2})/i);
  if (m) {
    const code = m[1].toUpperCase();
    const lookup: Record<string, string> = {
      QA: 'QA', QC: 'QC', MI: 'Microbiology',
      PR: 'Production', ST: 'Store', EN: 'Engineering', PE: 'Personnel',
    };
    return lookup[code] || 'Unknown';
  }
  return 'Unknown';
}

/**
 * Apply horizontal merges to a row so cells spanned by a merge inherit the merge's top-left value.
 * Only fills on the row that contains the merge (row 0 in our matrices).
 */
function fillHorizontalMerges(row: string[], merges: XLSX.Range[], rowIdx: number): string[] {
  const out = [...row];
  for (const m of merges) {
    if (m.s.r !== rowIdx || m.e.r !== rowIdx) continue;
    const v = out[m.s.c];
    if (v === undefined || v === null || v === '') continue;
    for (let c = m.s.c + 1; c <= m.e.c; c++) out[c] = v;
  }
  return out;
}

function isTick(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  if (!s) return false;
  return s === '√' || s.includes('√') || s === '✓' || s === '✔' || s.toLowerCase() === 'trained' || s.toLowerCase() === 'done';
}

export function parseTrainingMatrixMonthAware(
  buffer: Buffer,
  filename: string,
): ParsedMatrixSnapshot & { department: string } {
  const wb = XLSX.read(buffer, { type: 'buffer', cellText: true, cellNF: false });

  // Prefer Sheet1; otherwise first non-empty sheet
  const sheetName = wb.SheetNames.includes('Sheet1') ? 'Sheet1' : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet || !sheet['!ref']) {
    throw new Error('Empty workbook');
  }

  const rawRows: (string | number | null)[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: '',
  }) as unknown as (string | number | null)[][];
  if (rawRows.length < 3) throw new Error('Not enough rows in sheet');

  const merges = (sheet['!merges'] as XLSX.Range[] | undefined) ?? [];

  const monthRow = fillHorizontalMerges(
    rawRows[0].map((c) => String(c ?? '').trim()),
    merges,
    0,
  );
  const sopRow = rawRows[1].map((c) => String(c ?? '').trim());

  // SOP code column → month
  const sopMonthMap: Record<string, string> = {};
  const sopCodes: string[] = [];
  const monthCounts: Record<string, number> = {};
  for (const mu of MONTH_UPPER) monthCounts[MONTH_TITLE[mu]] = 0;

  const sopCols: Array<{ code: string; col: number }> = [];
  for (let col = 2; col < sopRow.length; col++) {
    const code = sopRow[col];
    if (!code) continue;
    const monthUpper = (monthRow[col] || '').toUpperCase();
    if (!MONTH_UPPER.includes(monthUpper)) continue;
    const month = MONTH_TITLE[monthUpper];
    sopCodes.push(code);
    sopMonthMap[code] = month;
    monthCounts[month] = (monthCounts[month] || 0) + 1;
    sopCols.push({ code, col });
  }

  const employees: ParsedMatrixEmployee[] = [];
  for (let r = 2; r < rawRows.length; r++) {
    const row = rawRows[r];
    const name = String(row[0] ?? '').trim();
    if (!name) continue;
    // Skip obvious header/footer noise
    if (/^(total|sr\.?\s*no|employee\s*name|department|designation)$/i.test(name)) continue;
    const designation = String(row[1] ?? '').trim();
    const training: Record<string, boolean> = {};
    for (const { code, col } of sopCols) {
      training[code] = isTick(row[col]);
    }
    employees.push({ name, designation, training });
  }

  const department = detectDepartmentFromName(filename);

  return {
    department,
    sopCodes,
    sopMonthMap,
    monthCounts,
    employees,
  };
}
