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
      Extract training matrix records from the HTML provided.
      The output MUST be a JSON object with a "records" array.
      
      ### CONTEXT:
      - Source Filename: ${fileName} (Use this to infer the Department if the document is vague)
      - Key SOPs in System: [${sopContext}]

      ### EXTRACTION STRATEGY:
      1. 🕵️ **DETECT LAYOUT**: Grid Matrix (Employee rows, SOP columns) or List.
      2. 🏛️ **DEPARTMENT**: Look for "Department", "Section", or "Unit". If you find designations like "EXECUTIVE" or "OFFICER", ignore them and look for the functional area like "Microbiology" or "QA".
      3. 📊 **SOP NAMES**: Extract SOP identifiers (e.g. QAGE75) from headers. Read the surrounding text to find titles like "SOP for Calibration".
      4. 📅 **DATES**: Use the date inside the table (YYYY-MM-DD). If it's partial like "Jan 24", use 2024-01-01.
      5. 👨‍🏫 **TRAINER**: Look for "Trainer", "Trained By", "Training Given By", "Instructor", or similar fields. This may appear as a column, header, or row label. Extract the person's full name.

      ### DATA SCHEMA:
      {
        "records": [
          {
            "employeeName": "string",
            "department": "string",
            "sopIdentifier": "string",
            "sopName": "string",
            "trainingDate": "YYYY-MM-DD",
            "trainerName": "string or null"
          }
        ]
      }

      ### HTML CONTENT:
      ${fullHtmlSnippet}
      
      Return ONLY valid JSON.
    `;

    console.log(`📡 AI Processing ${fileName}...`);
    const result = await model.generateContent(prompt);
    const jsonText = result.response.text().replace(/```json|```/g, '').trim();
    
    let parsed: { records: ExtractedMatrixRecord[] };
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.log('JSON Parse failed. Trying to repair...');
      const firstBrace = jsonText.indexOf('{');
      const lastBrace = jsonText.lastIndexOf('}');
      parsed = JSON.parse(jsonText.substring(firstBrace, lastBrace + 1));
    }

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

        console.log(`💾 Saving Record: ${record.employeeName} | ${record.sopIdentifier} | ${record.sopName} | Trainer: ${record.trainerName || 'N/A'}`);

        const tDate = new Date(record.trainingDate);
        if (isNaN(tDate.getTime())) {
          failed++; continue;
        }

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
