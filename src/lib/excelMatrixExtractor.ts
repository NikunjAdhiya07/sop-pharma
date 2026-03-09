/**
 * excelMatrixExtractor.ts
 * Extracts training matrix records directly from Excel files using XLSX.
 * No AI needed — reads column-by-column based on user-mapped headers.
 */

import * as XLSX from 'xlsx';
import TrainingMatrix from '@/models/TrainingMatrix';
import SOP from '@/models/SOP';
import connectDB from '@/lib/mongodb';

interface ExcelColumnMap {
  empCol: string;
  sopCol: string;
  dateCol?: string;
  deptCol?: string;
  trainerCol?: string;
}

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

/** Guess department from Excel sheet tab name e.g. "QA (QAGE)" → "Quality Assurance" */
function deptFromSheetName(sheetName: string): string {
  const upper = sheetName.toUpperCase();
  // Check DEPT_MAP keys in length-descending order so longer matches win
  const sortedKeys = Object.keys(DEPT_MAP).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (upper.includes(key)) return DEPT_MAP[key];
  }
  // Strip parenthetical code e.g. "QA (QAGE)" → "QA"
  const cleaned = sheetName.replace(/\s*\(.*?\)\s*/g, '').trim();
  return cleaned || sheetName;
}

/** Auto-detect column with exact-first then partial fallback */
function autoDetect(keys: string[], candidates: string[]): string {
  for (const cand of candidates) {
    const exact = keys.find(k => k.toLowerCase().trim() === cand.toLowerCase());
    if (exact) return exact;
  }
  for (const cand of candidates) {
    const partial = keys.find(k => k.toLowerCase().includes(cand.toLowerCase()));
    if (partial) return partial;
  }
  return '';
}

/** Parse a cell value as a JS Date — handles Excel serial numbers, strings, etc. */
function parseDate(raw: any): Date {
  if (!raw) return new Date(new Date().getFullYear(), 0, 1);

  // Excel date serial number
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw);
    if (d) return new Date(d.y, d.m - 1, d.d);
  }

  const s = raw.toString().trim();
  if (!s || s.toLowerCase() === 'n/a' || s.toLowerCase() === 'null') {
    return new Date(new Date().getFullYear(), 0, 1);
  }

  // ISO YYYY-MM-DD
  const isoMatch = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    if (!isNaN(d.getTime())) return d;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const d = new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]));
    if (!isNaN(d.getTime())) return d;
  }

  // Month Year: "Jan 2024", "Jan-24"
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    january: 0, february: 1, march: 2, april: 3, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
  };
  const monthYearMatch = s.match(/([a-zA-Z]+)[\s\-/,]+(\d{2,4})/);
  if (monthYearMatch) {
    const mon = months[monthYearMatch[1].toLowerCase()];
    let yr = parseInt(monthYearMatch[2]);
    if (yr < 100) yr += 2000;
    if (mon !== undefined && !isNaN(yr)) return new Date(yr, mon, 1);
  }

  // Year only
  const yearMatch = s.match(/^(20\d{2})$/);
  if (yearMatch) return new Date(parseInt(yearMatch[1]), 0, 1);

  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) return fallback;

  console.warn(`⚠️ Could not parse date: "${s}" — using Jan 1 of current year`);
  return new Date(new Date().getFullYear(), 0, 1);
}

export async function extractMatrixFromExcelBuffer(
  buffer: Buffer,
  fileName: string,
  colMap: ExcelColumnMap
): Promise<{ success: number; failed: number; errors: string[] }> {
  try {
    await connectDB();
    console.log(`📊 Excel extraction started for: ${fileName}`);

    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    console.log(`📑 Sheets found: ${wb.SheetNames.join(', ')}`);

    // Pre-load SOP map for fuzzy healing (once, shared across all sheets)
    const allSops = await SOP.find({}, 'identifier name department').lean();
    const alphaNumericMap = new Map<string, { id: string; name: string; dept: string }>();
    allSops.forEach(s => {
      const clean = s.identifier.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      alphaNumericMap.set(clean, { id: s.identifier, name: s.name, dept: s.department });
    });

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    // Process EVERY sheet
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, any>[];

      if (rows.length === 0) {
        console.log(`⚠️ Sheet "${sheetName}" is empty — skipping`);
        continue;
      }

      const keys = Object.keys(rows[0]);
      console.log(`\n📋 Sheet "${sheetName}" — Columns: ${keys.join(', ')}`);

      // Infer department from the SHEET NAME (e.g. "QA (QAGE)" → "Quality Assurance")
      const sheetDept = deptFromSheetName(sheetName);
      console.log(`🏢 Sheet department inferred: "${sheetDept}"`);

      // Resolve column keys (user mapping applied to every sheet)
      const empKey = (colMap.empCol && keys.includes(colMap.empCol))
        ? colMap.empCol
        : autoDetect(keys, ['employee name', 'employee', 'trainee name', 'trainee', 'name', 'staff name']);

      const sopKey = (colMap.sopCol && keys.includes(colMap.sopCol))
        ? colMap.sopCol
        : autoDetect(keys, ['sop no.', 'sop no', 'sop code', 'sop identifier', 'sop', 'protocol id']);

      const dateKey = (colMap.dateCol && keys.includes(colMap.dateCol))
        ? colMap.dateCol
        : autoDetect(keys, ['training date', 'date of training', 'date', 'trained on']);

      const deptKey = (colMap.deptCol && keys.includes(colMap.deptCol))
        ? colMap.deptCol
        : autoDetect(keys, ['department name', 'department', 'dept']);

      const trainerKey = (colMap.trainerCol && keys.includes(colMap.trainerCol))
        ? colMap.trainerCol
        : autoDetect(keys, ['trainer name', 'trainer', 'training officer', 'trained by', 'incharge']);

      if (!empKey) {
        console.warn(`⚠️ Sheet "${sheetName}": no employee column found — skipping`);
        continue;
      }
      if (!sopKey) {
        console.warn(`⚠️ Sheet "${sheetName}": no SOP column found — skipping`);
        continue;
      }

      console.log(`✅ Sheet "${sheetName}" mapped: emp="${empKey}", sop="${sopKey}", date="${dateKey}", dept="${deptKey}", trainer="${trainerKey}"`);

      for (const row of rows) {
        try {
          const employeeName = row[empKey]?.toString().trim();
          const sopRaw = row[sopKey]?.toString().trim().toUpperCase();

          // Skip header-like rows or empty rows
          if (!employeeName || !sopRaw || employeeName.toLowerCase() === empKey.toLowerCase()) {
            continue;
          }

          // Fuzzy match the SOP code
          const cleanSop = sopRaw.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
          let matched = alphaNumericMap.get(cleanSop);

          if (!matched) {
            for (const [key, value] of alphaNumericMap.entries()) {
              if (key.startsWith(cleanSop) || cleanSop.startsWith(key)) {
                matched = value;
                break;
              }
            }
          }

          const sopIdentifier = matched ? matched.id : sopRaw;
          let sopName = matched ? matched.name : `SOP ${sopRaw}`;
          if (sopName.includes('_')) sopName = sopName.split('_').slice(1).join(' ').trim();

          // Resolve department:
          // Priority: row cell > matched SOP dept > sheet name inferred dept
          let department = deptKey ? row[deptKey]?.toString().trim() : '';
          if (!department && matched?.dept) department = matched.dept;
          if (!department) department = sheetDept; // ← uses sheet tab name
          const normDept = DEPT_MAP[department.toUpperCase().trim()];
          if (normDept) department = normDept;

          // Trainer name
          const trainerName = trainerKey ? row[trainerKey]?.toString().trim() || null : null;

          // Training date
          const trainingDate = parseDate(dateKey ? row[dateKey] : null);

          await TrainingMatrix.findOneAndUpdate(
            { employeeName, sopIdentifier, trainingDate },
            {
              $set: {
                department,
                sopName,
                sourceFile: `${fileName} — ${sheetName}`,
                extractedAt: new Date(),
                ...(trainerName ? { trainerName } : {}),
              },
              $setOnInsert: {
                employeeName,
                sopIdentifier,
                trainingDate,
                status: 'Pending',
              },
            },
            { upsert: true, new: true }
          );
          success++;
        } catch (e: any) {
          failed++;
          errors.push(`[${sheetName}] Row error: ${e.message}`);
        }
      }

      console.log(`✅ Sheet "${sheetName}" done`);
    } // end sheet loop

    console.log(`\n🏁 All sheets processed: ${success} saved, ${failed} failed`);
    return { success, failed, errors };

  } catch (error: any) {
    console.error(`💀 Fatal error processing Excel ${fileName}:`, error.message);
    return { success: 0, failed: 0, errors: [error.message] };
  }
}
