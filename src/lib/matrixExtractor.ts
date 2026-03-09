import { GoogleGenerativeAI } from '@google/generative-ai';
import mammoth from 'mammoth';
import TrainingMatrix from '@/models/TrainingMatrix';
import SOP from '@/models/SOP';
import connectDB from '@/lib/mongodb';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// gemini-2.0-flash is extremely robust for table extraction
const model = genAI.getGenerativeModel({ 
  model: 'gemini-2.0-flash',
  generationConfig: { 
    responseMimeType: "application/json",
    temperature: 0.1
  }
});

export interface ExtractedMatrixRecord {
  employeeName: string;
  employeeCode?: string;
  department: string;
  sopIdentifier: string;
  sopName?: string;
  trainingDate: string; // ISO format or similar
  scheduledWeek?: string; // Week 42, etc
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


/** Robust date parser: handles ISO, "Jan 2024", "01/2024", "Week 42", partial dates, etc. */
function parseTrainingDate(raw: string | null | undefined): Date {
  if (!raw) return new Date(new Date().getFullYear(), 0, 1);
  const s = raw.trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'n/a' || s.toLowerCase() === 'unknown') {
    return new Date(new Date().getFullYear(), 0, 1);
  }

  // Full ISO date YYYY-MM-DD or YYYY/MM/DD
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

  // Month Year: "Jan 2024", "January-24", "Jan-2024"
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

  // Year only: "2024"
  const yearMatch = s.match(/^(20\d{2})$/);
  if (yearMatch) return new Date(parseInt(yearMatch[1]), 0, 1);

  // "Week 42" style: derive from current year
  const weekMatch = s.match(/week\s*(\d+)/i);
  if (weekMatch) {
    const week = parseInt(weekMatch[1]);
    const yr = new Date().getFullYear();
    const jan1 = new Date(yr, 0, 1);
    const d = new Date(jan1.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000);
    if (!isNaN(d.getTime())) return d;
  }

  // Last try: JS native parse
  const fallback = new Date(s);
  if (!isNaN(fallback.getTime())) return fallback;

  // Default: Jan 1st of current year
  console.warn(`⚠️ Could not parse date: "${s}" — using default`);
  return new Date(new Date().getFullYear(), 0, 1);
}

export async function extractMatrixFromDocBuffer(buffer: Buffer, fileName: string): Promise<{ success: number; failed: number; errors: string[] }> {
  try {
    console.log(`📑 Starting AI Extraction for: ${fileName}`);
    await connectDB();
    
    // 1. Extract HTML and Plain Text for dual-mode context
    const { value: html } = await mammoth.convertToHtml({ buffer });
    const { value: text } = await mammoth.extractRawText({ buffer });
    if (!html || !text) throw new Error('No content found in DOC file');

    const fullHtmlSnippet = html.substring(0, 80000);
    const fullTextSnippet = text.substring(0, 30000);

    // 2. Pre-fetch ALL SOPs for fuzzy healing
    const allSops = await SOP.find({}, 'identifier name department').lean();
    const globalSopMap = new Map();
    const alphaNumericMap = new Map(); // For fuzzy matching: QAGE75 -> QAGE-75
    
    allSops.forEach(s => {
      globalSopMap.set(s.identifier.toLowerCase(), s.name);
      globalSopMap.set(s.identifier.toUpperCase(), s.name);
      const clean = s.identifier.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      alphaNumericMap.set(clean, { id: s.identifier, name: s.name, dept: s.department });
    });

    const sopContext = allSops.slice(0, 70).map(s => `${s.identifier}: ${s.name}`).join(', ');

    // 3. Extraction Prompt with Filename Context
    const prompt = `
You are an expert document parser for pharmaceutical training records.
Extract ALL training matrix records from the document HTML below and return ONLY a JSON object.

### CONTEXT:
- Source Filename: ${fileName} (Use this to infer Department if not explicitly stated)
- Known SOPs in System: [${sopContext}]

### HOW TO READ TRAINING MATRICES:
Pharmaceutical training matrices often appear as GRID TABLES where:
- **Rows** = Employee names (listed down the left column)
- **Columns** = SOP codes or SOP names (listed across the top header row)
- **Cells** = Training date (e.g. "15/01/2024", "Jan-24", "01-2024") or a checkmark/tick
- **Trainer** may appear in a dedicated row/column labeled "Trained By", "Trainer", "HOD", "Training Officer", "Training Incharge", etc.
- If trainer appears in a header cell above the employee column, apply it to ALL records from that table.

For GRID format: Create ONE record per (Employee × SOP) cell that has a date or tick mark in it.
For LIST format (Employee, SOP, Date as separate rows): Extract each row directly.

### IMPORTANT RULES:
1. **employeeName**: Full name of the trainee (e.g. "Rahul Sharma"). NEVER use a job title or designation.
2. **sopIdentifier**: The SOP code (e.g. "QAGE01", "PROD-42"). Extract from column headers.
3. **sopName**: The SOP title if visible. Otherwise leave blank.
4. **department**: The department name (e.g. "QA", "Microbiology"). Infer from filename if needed.
5. **trainingDate**: The date in the cell. Use "YYYY-MM-DD" format. If only month/year is given (e.g. "Jan 24"), use "2024-01-01". If blank, use "2024-01-01".
6. **trainerName**: The trainer's full name, if given anywhere in the table or document. Can be null.
7. DO NOT skip any row/column combination that has a date or checkmark — include ALL of them.
8. If the trainer name appears once at the top/side of the table, repeat it for all records from that table.

### OUTPUT SCHEMA (return ONLY this JSON, no markdown):
{
  "records": [
    {
      "employeeName": "string",
      "department": "string",
      "sopIdentifier": "string",
      "sopName": "string or null",
      "trainingDate": "YYYY-MM-DD or partial date string",
      "trainerName": "string or null"
    }
  ]
}

### DOCUMENT HTML:
${fullHtmlSnippet}

### PLAIN TEXT (for context):
${fullTextSnippet.substring(0, 5000)}

Return ONLY the JSON object. No explanation, no markdown fences.
    `;

    console.log(`📡 AI Processing ${fileName}...`);
    const result = await model.generateContent(prompt);
    const rawResponse = result.response.text();
    console.log(`📄 AI Raw Response (first 500 chars): ${rawResponse.substring(0, 500)}`);
    const jsonText = rawResponse.replace(/```json|```/g, '').trim();
    
    let parsed: { records: ExtractedMatrixRecord[] };
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.log('JSON Parse failed. Trying to repair...');
      const firstBrace = jsonText.indexOf('{');
      const lastBrace = jsonText.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1) {
        throw new Error(`AI returned non-JSON response: ${jsonText.substring(0, 200)}`);
      }
      parsed = JSON.parse(jsonText.substring(firstBrace, lastBrace + 1));
    }

    if (!parsed?.records || !Array.isArray(parsed.records)) {
      console.error('❌ AI parsed but no records array found:', JSON.stringify(parsed).substring(0, 200));
      throw new Error('AI returned invalid structure — no records array');
    }
    console.log(`✅ AI extracted ${parsed.records.length} raw records from ${fileName}`);

    // 4. Advanced Post-Extraction Healing
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    // Log trainer extraction results
    const trainersFound = parsed.records.filter(r => r.trainerName && r.trainerName.trim());
    console.log(`👨‍🏫 Trainer names found by AI: ${trainersFound.length}/${parsed.records.length}`);
    if (trainersFound.length > 0) {
      console.log(`   Sample trainer: ${trainersFound[0].trainerName}`);
    }

    // HEALING: Try to extract trainer name from document text if AI didn't find it
    let documentTrainerName: string | null = null;
    const trainerPatterns = [
      /trained\s*by[:\s-]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
      /trainer[:\s-]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
      /training\s*given\s*by[:\s-]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
      /instructor[:\s-]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i,
    ];
    for (const pattern of trainerPatterns) {
      const match = fullTextSnippet.match(pattern);
      if (match && match[1]) {
        documentTrainerName = match[1].trim();
        console.log(`🔍 Found trainer in document text: "${documentTrainerName}"`);
        break;
      }
    }

    // Try to find a global department from the filename
    let fallbackDept = 'General';
    const deptKeywords = ['Microbiology', 'Personnel', 'QA', 'QC', 'Production', 'Engineering', 'Warehouse', 'Store'];
    for(const kw of deptKeywords) {
      if (fileName.toLowerCase().includes(kw.toLowerCase())) {
        fallbackDept = kw;
        break;
      }
    }

    for (const record of parsed.records) {
      try {
        if (!record.employeeName || !record.sopIdentifier) {
           failed++; continue;
        }

        // HEALING LAYER 1: Fix Department (No Designations allowed)
        const isDesignation = DESIGNATIONS.some(d => record.department?.toUpperCase().includes(d));
        if (!record.department || isDesignation || record.department === 'Unknown' || record.department === 'General') {
           record.department = fallbackDept;
        }

        // HEALING LAYER 2: Alphanumeric SOP Matching (Exact/Fuzzy)
        const cleanIdInput = record.sopIdentifier.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        let matched = alphaNumericMap.get(cleanIdInput);
        
        // HEALING LAYER 3: Partial Match Fallback (e.g. Matrix says QAGE75, DB has QAGE75-12)
        if (!matched) {
          for (const [key, value] of alphaNumericMap.entries()) {
            if (key.startsWith(cleanIdInput) || cleanIdInput.startsWith(key)) {
              matched = value;
              console.log(`🎯 Contextual Match: ${record.sopIdentifier} -> ${value.id} (${value.name})`);
              break;
            }
          }
        }

        if (matched && matched.name) {
          record.sopIdentifier = matched.id;
          let safeName = matched.name;
          
          if (safeName.includes('_')) {
             safeName = safeName.split('_').slice(1).join(' ').trim();
          } else if (safeName.startsWith(matched.id)) {
             safeName = safeName.replace(matched.id, '').replace(/^[-_\s]+/, '').trim();
          }
          
          record.sopName = safeName || `SOP ${matched.id}`;
          
          // CRITICAL: Overwrite department with matched SOP's department if current is suspect
          const currentUpper = record.department?.toUpperCase() || '';
          const currentIsDesignation = DESIGNATIONS.some(d => currentUpper.includes(d));
          if (!record.department || currentIsDesignation || record.department === fallbackDept || record.department === 'General') {
             record.department = matched.dept || fallbackDept;
          }
        } 

        // Apply Normalization
        const normDept = DEPT_MAP[record.department?.toUpperCase().trim()];
        if (normDept) {
          record.department = normDept;
        }
        
        // Final fallback for missing or "Unknown" names
        const currentName = record.sopName || '';
        if (!currentName || currentName.toLowerCase().includes('unknown')) {
           record.sopName = `SOP ${record.sopIdentifier}`;
        }

        // HEALING: Use document-level trainer if record doesn't have one
        if (!record.trainerName && documentTrainerName) {
          record.trainerName = documentTrainerName;
        }

        const tDate = parseTrainingDate(record.trainingDate);
        console.log(`💾 Saving: ${record.employeeName} | ${record.sopIdentifier} | ${record.sopName} | ${tDate.toISOString().split('T')[0]} | Trainer: ${record.trainerName || 'N/A'}`);

        await TrainingMatrix.findOneAndUpdate(
          { 
            employeeName: record.employeeName, 
            sopIdentifier: record.sopIdentifier,
            trainingDate: tDate
          },
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
