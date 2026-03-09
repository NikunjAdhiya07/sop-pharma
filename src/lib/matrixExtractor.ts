import { GoogleGenerativeAI } from '@google/generative-ai';
import mammoth from 'mammoth';
import TrainingMatrix from '@/models/TrainingMatrix';
import SOP from '@/models/SOP';
import connectDB from '@/lib/mongodb';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const model = genAI.getGenerativeModel({ 
  model: 'gemini-2.0-flash',
  generationConfig: { 
    responseMimeType: "application/json",
    temperature: 0.1,
    maxOutputTokens: 8192,
  }
});

export interface ExtractedMatrixRecord {
  employeeName: string;
  employeeCode?: string;
  department: string;
  sopIdentifier: string;
  sopName?: string;
  trainingDate: string;
  scheduledWeek?: string;
  trainerName?: string;
  status: string;
}

const DEPT_MAP: Record<string, string> = {
  'QA': 'Quality Assurance',
  'QUALITY ASSURANCE': 'Quality Assurance',
  'QC': 'Quality Control',
  'QUALITY CONTROL': 'Quality Control',
  'ENGINEERING': 'Engineering',
  'ENGINEERING AND MAINTENANCE': 'Engineering',
  'PRODUCTION': 'Production',
  'STORE': 'Store',
  'WAREHOUSE': 'Store',
  'PERSONNEL': 'Personnel',
  'MICROBIOLOGY': 'Microbiology'
};

const DESIGNATIONS = ['OFFICER', 'EXECUTIVE', 'ASSISTANT', 'MANAGER', 'SUPERVISOR', 'OPERATOR', 'TECHNICIAN', 'TRAINEE', 'HELPER', 'WORKER'];

/** Robust date parser */
function parseTrainingDate(raw: string | null | undefined): Date {
  if (!raw) return new Date(new Date().getFullYear(), 0, 1);
  const s = raw.trim();
  if (!s || ['null','n/a','unknown',''].includes(s.toLowerCase())) {
    return new Date(new Date().getFullYear(), 0, 1);
  }
  const isoMatch = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
    if (!isNaN(d.getTime())) return d;
  }
  const dmyMatch = s.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const d = new Date(parseInt(dmyMatch[3]), parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]));
    if (!isNaN(d.getTime())) return d;
  }
  const months: Record<string, number> = {
    jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11,
    january:0,february:1,march:2,april:3,june:5,july:6,august:7,september:8,october:9,november:10,december:11
  };
  const monthYearMatch = s.match(/([a-zA-Z]+)[\s\-/,]+(\d{2,4})/);
  if (monthYearMatch) {
    const mon = months[monthYearMatch[1].toLowerCase()];
    let yr = parseInt(monthYearMatch[2]);
    if (yr < 100) yr += 2000;
    if (mon !== undefined && !isNaN(yr)) return new Date(yr, mon, 1);
  }
  const yearMatch = s.match(/^(20\d{2})$/);
  if (yearMatch) return new Date(parseInt(yearMatch[1]), 0, 1);
  const weekMatch = s.match(/week\s*(\d+)/i);
  if (weekMatch) {
    const week = parseInt(weekMatch[1]);
    const yr = new Date().getFullYear();
    const d = new Date(yr, 0, 1 + (week - 1) * 7);
    if (!isNaN(d.getTime())) return d;
  }
  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) return fallback;
  console.warn(`⚠️ Could not parse date: "${s}" — using default`);
  return new Date(new Date().getFullYear(), 0, 1);
}

// ─── HTML Table Parser ────────────────────────────────────────────────────────
function parseHtmlTables(html: string): string[][][] {
  const tables: string[][][] = [];
  // Use a simpler approach: split on table tags
  const tableChunks = html.split(/<table/i).slice(1);
  
  for (const chunk of tableChunks) {
    const tableBody = chunk.split(/<\/table>/i)[0];
    const rowChunks = tableBody.split(/<tr/i).slice(1);
    const rows: string[][] = [];
    
    for (const rowChunk of rowChunks) {
      const rowBody = rowChunk.split(/<\/tr>/i)[0];
      // Match both td and th
      const cellMatches = rowBody.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) || [];
      const cells: string[] = cellMatches.map(cellHtml => {
        return cellHtml
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&nbsp;/g, ' ')
          .replace(/&#\d+;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      });
      if (cells.length > 0 && cells.some(c => c.length > 0)) {
        rows.push(cells);
      }
    }
    if (rows.length > 0) tables.push(rows);
  }
  return tables;
}

// Checks if a string looks like an SOP identifier
function looksLikeSopCode(cell: string): boolean {
  return /^[A-Z]{2,6}\d{2,}/.test(cell.trim());
}

// Checks if a cell value looks like a training date/checkmark
function looksLikeDate(cell: string): string | null {
  if (!cell || cell.trim() === '') return null;
  const c = cell.trim();
  if (/^[✓✔☑✅√\u2713\u2714\u2611]$/.test(c)) return `${new Date().getFullYear()}-01-01`;
  // Full ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(c)) return c;
  // DD/MM/YYYY
  const dmy = c.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
  // MM/YYYY or MM-YYYY
  const my = c.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (my) return `${my[2]}-${my[1].padStart(2,'0')}-01`;
  // Month abbreviation + Year
  const monthsMap: Record<string, string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'
  };
  const monthMatch = c.match(/^([a-zA-Z]{3})[\s\-\/](\d{2,4})$/i);
  if (monthMatch) {
    const mon = monthsMap[monthMatch[1].toLowerCase()];
    let yr = parseInt(monthMatch[2]);
    if (yr < 100) yr += 2000;
    if (mon) return `${yr}-${mon}-01`;
  }
  // Year only
  if (/^20\d{2}$/.test(c)) return `${c}-01-01`;
  // 1/1/2024 style
  const dmy2 = c.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy2) return `${dmy2[3]}-${dmy2[2].padStart(2,'0')}-${dmy2[1].padStart(2,'0')}`;
  // "Feb-26" without day
  const shortMY = c.match(/^([a-zA-Z]{3})[-](\d{2})$/i);
  if (shortMY) {
    const mon = monthsMap[shortMY[1].toLowerCase()];
    const yr = 2000 + parseInt(shortMY[2]);
    if (mon) return `${yr}-${mon}-01`;
  }
  return null;
}

// Common header/label phrases that should NOT be treated as employee names
const HEADER_PHRASES = new Set([
  'employee name', 'employee', 'name', 'trainee', 'trainee name',
  'name of employee', 'name of trainee', 'sr no', 'sr. no', 'sr.no.',
  'sop', 'doc no', 'department', 'dept', 'date', 'training date',
  'month', 'trainer', 'trained by', 'status', 'remarks', 'code',
  'title', 'sop name', 'sop title', 'subject', 'designation',
  'signature', 'sign', 'hod', 'incharge', 'no.', 'no', 'sl no',
  'serial no', 'serial number', 'document no', 'document number',
]);

// Determines if a cell value looks like an employee name
function looksLikeName(cell: string): boolean {
  if (!cell || cell.length < 3 || cell.length > 60) return false;
  const c = cell.trim();
  const lower = c.toLowerCase();
  // Reject exact header phrase matches
  if (HEADER_PHRASES.has(lower)) return false;
  // Reject phrases that CONTAIN header keywords
  if (['employee name','name of','trainee name','sr. no','serial no','doc no','sop no'].some(h => lower.includes(h))) return false;
  // Must not be a SOP code
  if (looksLikeSopCode(c)) return false;
  // Must not be a designation keyword alone
  if (DESIGNATIONS.some(d => lower === d.toLowerCase())) return false;
  // Must not be a date
  if (looksLikeDate(c)) return false;
  // Must not be purely numeric or alphanumeric code
  if (/^\d+$/.test(c)) return false;
  if (/^[A-Z]{1,4}[\s\-]?\d+$/.test(c)) return false; // e.g. "QC 01"
  // Must contain at least one letter
  if (!/[A-Za-z]/.test(c)) return false;
  // Must have a space (first + last name) OR be a plausible single capitalized name
  return c.includes(' ') || (c.length >= 4 && /^[A-Z][a-z]+$/.test(c));
}

// ─── Extract names from raw text ─────────────────────────────────────────────
// Specifically for addendum-style files that mention employee once at the top
function extractEmployeeFromText(text: string): string | null {
  // Patterns like "Name: Hardik Kanzariya" or "Trainee: ..." or "Employee Name: ..."
  const patterns = [
    /(?:trainee|employee|name|trained)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
    /([A-Z][a-z]+\s+[A-Z][a-z]+)\s+(?:has|is|was|completed|trained)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1] && looksLikeName(m[1])) return m[1].trim();
  }
  // Scan first 2000 chars for a prominent name pattern (2+ capitalized words)
  const lines = text.substring(0, 2000).split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    const nameMatch = trimmed.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)$/);
    if (nameMatch && looksLikeName(nameMatch[1])) return nameMatch[1];
  }
  return null;
}

interface LocalRecord {
  employeeName: string;
  sopIdentifier: string;
  sopName?: string;
  trainingDate: string;
  trainerName?: string;
  department?: string;
}

// ─── Strategy 1: GRID table (rows=employees, cols=SOP codes) ─────────────────
function extractGrid(table: string[][], fallbackDept: string, tableTrainer?: string): LocalRecord[] {
  const records: LocalRecord[] = [];
  if (table.length < 2) return records;

  // Find the HEADER ROW — the first row that contains SOP codes in columns
  let headerRowIdx = -1;
  const sopCols: { colIdx: number; sopId: string; sopName?: string }[] = [];

  for (let rowIdx = 0; rowIdx < Math.min(4, table.length); rowIdx++) {
    const row = table[rowIdx];
    const foundSops: { colIdx: number; sopId: string }[] = [];
    for (let c = 1; c < row.length; c++) {
      const cell = row[c].trim();
      if (looksLikeSopCode(cell)) {
        foundSops.push({ colIdx: c, sopId: cell });
      } else {
        // Embedded SOP code (e.g. "QAGE01 - Some name")
        const sopInCell = cell.match(/([A-Z]{2,6}\d{2,})/)?.[1];
        if (sopInCell) foundSops.push({ colIdx: c, sopId: sopInCell });
      }
    }
    if (foundSops.length >= 2) { // Require at least 2 SOP columns to confirm grid
      headerRowIdx = rowIdx;
      sopCols.push(...foundSops);
      break;
    }
  }

  if (headerRowIdx === -1 || sopCols.length === 0) return records;

  // Check if next row is a SOP name row (not employee names)
  let dataStartRow = headerRowIdx + 1;
  if (dataStartRow < table.length) {
    const nextRow = table[dataStartRow];
    const hasSopNames = sopCols.some(s => {
      const cell = nextRow[s.colIdx]?.trim() || '';
      return cell.length > 5 && !looksLikeDate(cell) && !looksLikeSopCode(cell) && !looksLikeName(cell);
    });
    if (hasSopNames) {
      sopCols.forEach(s => {
        const nameCell = nextRow[s.colIdx]?.trim();
        if (nameCell && nameCell.length > 3 && !looksLikeDate(nameCell)) s.sopName = nameCell;
      });
      dataStartRow++;
    }
  }

  for (let r = dataStartRow; r < table.length; r++) {
    const row = table[r];
    const empName = row[0]?.trim();
    if (!empName || !looksLikeName(empName)) continue;

    for (const { colIdx, sopId, sopName } of sopCols) {
      const cellVal = row[colIdx]?.trim() || '';
      const dateStr = looksLikeDate(cellVal);
      if (dateStr) {
        records.push({
          employeeName: empName,
          sopIdentifier: sopId,
          sopName,
          trainingDate: dateStr,
          trainerName: tableTrainer,
          department: fallbackDept,
        });
      }
    }
  }
  return records;
}

// ─── Strategy 2: LIST table (cols=[SOP, Name, Date] or similar) ──────────────
function extractList(table: string[][], fallbackDept: string, tableTrainer?: string, globalEmployee?: string): LocalRecord[] {
  const records: LocalRecord[] = [];
  if (table.length < 2) return records;
  
  const headerRow = table[0];
  // Map header keywords to column indices
  let empCol = -1, sopCol = -1, dateCol = -1, trainerCol = -1, sopNameCol = -1;
  
  for (let c = 0; c < headerRow.length; c++) {
    const h = headerRow[c].toLowerCase().replace(/[^a-z\s]/g, '').trim();
    if (h.includes('employee') || h.includes('trainee') || h === 'name' || h === 'trainee name') empCol = c;
    else if (h.includes('sop') && h.includes('no') || h === 'sop no' || h === 'doc no' || h === 'sop code') sopCol = c;
    else if ((h.includes('sop') && h.includes('name')) || h === 'title' || h === 'sop title' || h === 'subject') sopNameCol = c;
    else if (h.includes('date') || h === 'training date' || h.includes('month') || h.includes('schedule')) dateCol = c;
    else if (h.includes('trainer') || h.includes('trained by') || h === 'hod') trainerCol = c;
  }
  
  // Try to detect columns by content if headers missing
  if (sopCol === -1 || dateCol === -1) {
    // Scan data rows to detect pattern
    for (let r = 1; r < Math.min(5, table.length); r++) {
      const row = table[r];
      for (let c = 0; c < row.length; c++) {
        const cell = row[c].trim();
        if (looksLikeSopCode(cell) && sopCol === -1) sopCol = c;
        if (looksLikeDate(cell) && dateCol === -1) dateCol = c;
        if (looksLikeName(cell) && empCol === -1) empCol = c;
      }
    }
  }
  
  if (sopCol === -1 && dateCol === -1) return records; // Can't detect list format
  
  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    
    // Get SOP identifier
    const rawSop = sopCol >= 0 ? row[sopCol]?.trim() : '';
    if (!rawSop || !looksLikeSopCode(rawSop)) continue;
    
    // Get date
    let rawDate = dateCol >= 0 ? row[dateCol]?.trim() : '';
    const dateStr = looksLikeDate(rawDate || '') || `${new Date().getFullYear()}-01-01`;
    
    // Get employee name
    let empName = empCol >= 0 ? row[empCol]?.trim() : '';
    if (!empName && globalEmployee) empName = globalEmployee;
    if (!empName || !looksLikeName(empName)) {
      if (globalEmployee) empName = globalEmployee;
      else continue;
    }
    
    // Get optional fields
    const sopName = sopNameCol >= 0 ? row[sopNameCol]?.trim() : undefined;
    const trainer = trainerCol >= 0 ? row[trainerCol]?.trim() : tableTrainer;
    
    records.push({
      employeeName: empName,
      sopIdentifier: rawSop,
      sopName: sopName || undefined,
      trainingDate: dateStr,
      trainerName: trainer || undefined,
      department: fallbackDept,
    });
  }
  
  return records;
}

// ─── Strategy 3: TRANSPOSED grid (cols=employees, rows=SOPs) ─────────────────
function extractTransposed(table: string[][], fallbackDept: string, tableTrainer?: string): LocalRecord[] {
  const records: LocalRecord[] = [];
  if (table.length < 2 || table[0].length < 2) return records;
  
  const headerRow = table[0];
  // Check if first row has employee names (not SOP codes)
  const empCols: { colIdx: number; empName: string }[] = [];
  for (let c = 1; c < headerRow.length; c++) {
    const cell = headerRow[c].trim();
    if (looksLikeName(cell)) {
      empCols.push({ colIdx: c, empName: cell });
    }
  }
  
  if (empCols.length === 0) return records;
  
  // Check if first column has SOP codes
  for (let r = 1; r < table.length; r++) {
    const row = table[r];
    const sopId = row[0]?.trim();
    if (!sopId || !looksLikeSopCode(sopId)) continue;
    
    for (const { colIdx, empName } of empCols) {
      const cellVal = row[colIdx]?.trim() || '';
      const dateStr = looksLikeDate(cellVal);
      if (dateStr) {
        records.push({
          employeeName: empName,
          sopIdentifier: sopId,
          trainingDate: dateStr,
          trainerName: tableTrainer,
          department: fallbackDept,
        });
      }
    }
  }
  
  return records;
}

// ─── Main Table Extraction Orchestrator ──────────────────────────────────────
function extractFromTables(tables: string[][][], fallbackDept: string, rawText: string): LocalRecord[] {
  const allRecords: LocalRecord[] = [];
  
  // Try to detect a global employee name from raw text (for addendum-style docs)
  const globalEmployee = extractEmployeeFromText(rawText);
  if (globalEmployee) {
    console.log(`👤 Detected global employee from text: "${globalEmployee}"`);
  }
  
  for (const table of tables) {
    if (table.length < 2) continue;
    
    let tableTrainer: string | undefined;
    
    // Scan all cells for trainer heuristic
    for (const row of table) {
      for (let ci = 0; ci < row.length - 1; ci++) {
        const lower = row[ci].toLowerCase();
        if (lower.includes('trained by') || lower.includes('trainer') || lower.includes('training officer')) {
          const candidate = row[ci + 1]?.trim();
          if (candidate && looksLikeName(candidate)) tableTrainer = candidate;
        }
      }
    }
    
    // Try Grid strategy first (most common pharma format)
    const gridRecords = extractGrid(table, fallbackDept, tableTrainer);
    if (gridRecords.length > 0) {
      allRecords.push(...gridRecords);
      continue;
    }
    
    // Try Transposed grid (employees as column headers)
    const transposedRecords = extractTransposed(table, fallbackDept, tableTrainer);
    if (transposedRecords.length > 0) {
      allRecords.push(...transposedRecords);
      continue;
    }
    
    // Try List strategy (with global employee fallback)
    const listRecords = extractList(table, fallbackDept, tableTrainer, globalEmployee || undefined);
    if (listRecords.length > 0) {
      allRecords.push(...listRecords);
      continue;
    }
    
    // Last resort: scan all rows for any (SOP, date) pairs with employee context
    if (globalEmployee) {
      for (const row of table) {
        // Find SOP codes and dates in the same row
        const sops = row.filter(c => looksLikeSopCode(c.trim()));
        const dates = row.filter(c => looksLikeDate(c.trim()));
        if (sops.length > 0 && dates.length > 0) {
          allRecords.push({
            employeeName: globalEmployee,
            sopIdentifier: sops[0].trim(),
            trainingDate: looksLikeDate(dates[0].trim()) || `${new Date().getFullYear()}-01-01`,
            department: fallbackDept,
          });
        } else if (sops.length > 0) {
          // SOP row but no date — use default
          allRecords.push({
            employeeName: globalEmployee,
            sopIdentifier: sops[0].trim(),
            trainingDate: `${new Date().getFullYear()}-01-01`,
            department: fallbackDept,
          });
        }
      }
    }
  }
  
  return allRecords;
}

// ─── AI Extraction with Timeout ───────────────────────────────────────────────
async function extractWithAITimedOut(
  htmlChunk: string,
  textChunk: string,
  fileName: string,
  sopContext: string,
  timeoutMs = 30000
): Promise<ExtractedMatrixRecord[]> {
  const aiPromise = extractWithAI(htmlChunk, textChunk, fileName, sopContext);
  const timeoutPromise = new Promise<ExtractedMatrixRecord[]>((_, reject) => 
    setTimeout(() => reject(new Error('AI call timed out after 30s')), timeoutMs)
  );
  return Promise.race([aiPromise, timeoutPromise]);
}

async function extractWithAI(
  htmlChunk: string,
  textChunk: string,
  fileName: string,
  sopContext: string
): Promise<ExtractedMatrixRecord[]> {
  const prompt = `
You are parsing a pharmaceutical training matrix document. Extract ALL training records.

File: ${fileName}
Context SOPs: [${sopContext}]

The document may be a GRID (employees=rows, SOPs=columns) or LIST (one row per SOP per employee).
For each (Employee, SOP) with a training date or checkmark, create one record.

Return ONLY this JSON (no markdown):
{"records":[{"employeeName":"string","department":"string","sopIdentifier":"string","sopName":"string or null","trainingDate":"YYYY-MM-DD","trainerName":"string or null"}]}

DOCUMENT:
${htmlChunk.substring(0, 12000)}

TEXT:
${textChunk.substring(0, 3000)}`.trim();

  const result = await model.generateContent(prompt);
  const rawResponse = result.response.text();
  const jsonText = rawResponse.replace(/```json|```/g, '').trim();

  let parsed: { records: ExtractedMatrixRecord[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    console.log('⚠️ AI JSON truncated, attempting repair...');
    const firstBrace = jsonText.indexOf('{');
    const lastCompleteEnd = findLastCompleteArrayEnd(jsonText);
    if (firstBrace === -1 || lastCompleteEnd === -1) {
      throw new Error(`AI returned non-parseable JSON`);
    }
    const truncated = jsonText.substring(firstBrace, lastCompleteEnd + 1);
    parsed = JSON.parse(truncated + ']}');
    console.log(`♻️ Repaired: recovered ${parsed.records?.length || 0} records`);
  }

  return parsed?.records || [];
}

function findLastCompleteArrayEnd(jsonText: string): number {
  let depth = 0;
  let lastCompleteEnd = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < jsonText.length; i++) {
    const ch = jsonText[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 1) lastCompleteEnd = i;
    }
  }
  return lastCompleteEnd;
}

// ─── Main Export ─────────────────────────────────────────────────────────────
export async function extractMatrixFromDocBuffer(buffer: Buffer, fileName: string): Promise<{ success: number; failed: number; errors: string[] }> {
  try {
    console.log(`📑 Starting Extraction for: ${fileName}`);
    await connectDB();
    
    // 1. Convert DOCX to HTML and text
    const { value: html } = await mammoth.convertToHtml({ buffer });
    const { value: text } = await mammoth.extractRawText({ buffer });
    if (!html || !text) throw new Error('No content found in DOC file');

    // 2. Pre-fetch all SOPs for healing
    const allSops = await SOP.find({}, 'identifier name department').lean();
    const alphaNumericMap = new Map<string, { id: string; name: string; dept: string }>();
    allSops.forEach(s => {
      const clean = s.identifier.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      alphaNumericMap.set(clean, { id: s.identifier, name: s.name, dept: s.department });
    });

    // 3. Get fallback dept from filename
    let fallbackDept = 'General';
    const deptKeywords = [
      ['Microbiology', 'Microbiology'],
      ['Personnel', 'Personnel'],
      ['QA', 'Quality Assurance'],
      ['QC', 'Quality Control'],
      ['Production', 'Production'],
      ['Engineering', 'Engineering'],
      ['Maintenance', 'Engineering'],
      ['Warehouse', 'Store'],
      ['Store', 'Store'],
    ] as const;
    for (const [kw, mapped] of deptKeywords) {
      if (fileName.toLowerCase().includes(kw.toLowerCase())) {
        fallbackDept = mapped;
        break;
      }
    }

    // 4. PHASE 1: Direct HTML table extraction (fast, no API call)
    console.log(`🔍 Phase 1: Direct table parsing...`);
    const tables = parseHtmlTables(html);
    console.log(`📊 Found ${tables.length} tables in document`);
    
    let extractedRecords: LocalRecord[] = extractFromTables(tables, fallbackDept, text);
    
    if (extractedRecords.length > 0) {
      console.log(`✅ Phase 1 success: ${extractedRecords.length} records extracted`);
    } else {
      // 5. PHASE 2: Chunked AI extraction with timeout
      console.log(`🤖 Phase 2: AI extraction (direct parse found 0 records)...`);
      const sopContext = allSops.slice(0, 50).map(s => `${s.identifier}: ${s.name}`).join(', ');
      
      // Split HTML by table tags to create manageable chunks
      const tableMatches = [...html.matchAll(/<table[\s\S]*?<\/table>/gi)];
      const htmlChunks: string[] = [];
      
      if (tableMatches.length === 0) {
        htmlChunks.push(html.substring(0, 12000));
      } else {
        let currentChunk = '';
        for (const match of tableMatches) {
          if (currentChunk.length + match[0].length > 12000 && currentChunk.length > 0) {
            htmlChunks.push(currentChunk);
            currentChunk = match[0];
          } else {
            currentChunk += match[0];
          }
        }
        if (currentChunk) htmlChunks.push(currentChunk);
      }
      
      console.log(`📦 AI processing ${htmlChunks.length} chunk(s) (30s timeout each)...`);
      
      const aiRecords: ExtractedMatrixRecord[] = [];
      for (let i = 0; i < htmlChunks.length; i++) {
        try {
          console.log(`📡 AI chunk ${i + 1}/${htmlChunks.length}...`);
          const chunkText = text.substring(i * 3000, (i + 1) * 3000);
          const recs = await extractWithAITimedOut(htmlChunks[i], chunkText, fileName, sopContext, 30000);
          console.log(`  ↳ Got ${recs.length} records`);
          aiRecords.push(...recs);
          if (i < htmlChunks.length - 1) await new Promise(r => setTimeout(r, 500));
        } catch (e: any) {
          console.error(`❌ AI chunk ${i + 1} failed: ${e.message}`);
        }
      }
      
      extractedRecords = aiRecords.map(r => ({
        employeeName: r.employeeName,
        sopIdentifier: r.sopIdentifier,
        sopName: r.sopName,
        trainingDate: r.trainingDate,
        trainerName: r.trainerName || undefined,
        department: r.department,
      }));
      
      console.log(`✅ AI total: ${extractedRecords.length} records`);
    }

    // 6. Find trainer from document text
    let documentTrainerName: string | null = null;
    const trainerPatterns = [
      /trained\s*by[:\s-]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
      /trainer[:\s-]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
      /training\s*given\s*by[:\s-]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
    ];
    for (const pattern of trainerPatterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        documentTrainerName = match[1].trim();
        console.log(`🔍 Document trainer: "${documentTrainerName}"`);
        break;
      }
    }

    // 7. De-duplicate
    const seen = new Set<string>();
    const deduped = extractedRecords.filter(r => {
      const key = `${r.employeeName?.toLowerCase()}|${r.sopIdentifier?.toLowerCase()}|${r.trainingDate}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    console.log(`🔄 Deduped: ${deduped.length} unique records (from ${extractedRecords.length})`);

    // 8. Heal & save
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const record of deduped) {
      try {
        if (!record.employeeName?.trim() || !record.sopIdentifier?.trim()) {
          failed++;
          continue;
        }

        // Heal department
        const isDesignation = DESIGNATIONS.some(d => record.department?.toUpperCase().includes(d));
        if (!record.department || isDesignation || record.department === 'Unknown') {
          record.department = fallbackDept;
        }

        // Fuzzy SOP matching
        const cleanId = record.sopIdentifier.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        let matched = alphaNumericMap.get(cleanId);
        
        if (!matched) {
          for (const [key, value] of alphaNumericMap.entries()) {
            if (key.startsWith(cleanId) || cleanId.startsWith(key)) {
              matched = value;
              console.log(`🎯 Contextual Match: ${record.sopIdentifier} -> ${value.id} (${value.name})`);
              break;
            }
          }
        }

        if (matched?.name) {
          record.sopIdentifier = matched.id;
          let safeName = matched.name;
          if (safeName.includes('_')) {
            safeName = safeName.split('_').slice(1).join(' ').trim();
          } else if (safeName.startsWith(matched.id)) {
            safeName = safeName.replace(matched.id, '').replace(/^[-_\s]+/, '').trim();
          }
          record.sopName = safeName || `SOP ${matched.id}`;
          const deptIsWeak = !record.department || DESIGNATIONS.some(d => record.department?.toUpperCase().includes(d)) || record.department === fallbackDept || record.department === 'General';
          if (deptIsWeak) record.department = matched.dept || fallbackDept;
        }

        // Normalize dept
        const normDept = DEPT_MAP[record.department?.toUpperCase().trim()];
        if (normDept) record.department = normDept;
        
        if (!record.sopName || record.sopName.toLowerCase().includes('unknown')) {
          record.sopName = `SOP ${record.sopIdentifier}`;
        }
        
        if (!record.trainerName && documentTrainerName) {
          record.trainerName = documentTrainerName;
        }

        const tDate = parseTrainingDate(record.trainingDate);
        console.log(`💾 Saving: ${record.employeeName} | ${record.sopIdentifier} | ${record.sopName} | ${tDate.toISOString().split('T')[0]} | Trainer: ${record.trainerName || 'N/A'}`);

        await TrainingMatrix.findOneAndUpdate(
          { employeeName: record.employeeName, sopIdentifier: record.sopIdentifier, trainingDate: tDate },
          {
            $set: {
              department: record.department,
              sopName: record.sopName,
              sourceFile: fileName,
              extractedAt: new Date(),
              ...(record.trainerName ? { trainerName: record.trainerName } : {}),
            },
            $setOnInsert: {
              employeeName: record.employeeName,
              sopIdentifier: record.sopIdentifier,
              trainingDate: tDate,
              status: 'Pending',
            }
          },
          { upsert: true, new: true }
        );
        success++;
      } catch (e: any) {
        failed++;
        errors.push(`Row error in ${fileName}: ${e.message}`);
      }
    }

    console.log(`✅ Completed ${fileName}: ${success} success, ${failed} failed`);
    return { success, failed, errors };

  } catch (error: any) {
    console.error(`💀 Fatal error processing ${fileName}:`, error.message);
    return { success: 0, failed: 0, errors: [error.message] };
  }
}
