import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';

if (!GEMINI_API_KEY) {
  console.error('❌ Gemini API Key is missing! Please set GEMINI_API_KEY or GOOGLE_AI_API_KEY in your environment.');
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// gemini-2.0-flash: currently available, fast and capable for MCQ generation
// NOTE: gemini-1.5-flash was deprecated (404). gemini-2.5-pro-preview not yet publicly available.
const DEFAULT_MODEL = 'gemini-2.0-flash';

export const geminiModel = genAI.getGenerativeModel({
  model: DEFAULT_MODEL,
  generationConfig: {
    maxOutputTokens: 32768,
    temperature: 0.1,
  }
});

// Global state to coordinate between multiple concurrent SOP processing tasks
let globalOverloadUntil = 0;
const GLOBAL_OVERLOAD_PAUSE = 60000; // Wait at least 60s on any 503/429 error


export interface MCQGenerationRequest {
  sopContent: string;
  sopName: string;
  sopIdentifier: string;
  existingQuestions?: string[];
  targetCount?: number;
  isBulk?: boolean;
  language?: 'English' | 'Gujarati';
  onBatchComplete?: (batchMcqs: GeneratedMCQ[]) => Promise<void>; // Callback for incremental saving
}

export interface GeneratedMCQ {
  aiIcon: string;
  question: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  difficultyStars: '⭐' | '⭐⭐' | '⭐⭐⭐';
  options: string[];
  correctAnswer: string;
  explanation: string;
  sopReference: string;
  optionVariants: Array<{
    text: string;
    isCorrect: boolean;
  }>;
}

export interface MCQGenerationResponse {
  mcqs: GeneratedMCQ[];
  difficultyDistribution: {
    easy: number;
    medium: number;
    hard: number;
  };
  totalQuestions?: number;
  aiModel?: string;
}

/**
 * Clean and extract JSON from AI response
 */
function cleanAndExtractJSON(text: string): string {
  let jsonText = text.trim();

  // Remove markdown code blocks (multiple formats)
  if (jsonText.includes('```json')) {
    const parts = jsonText.split('```json');
    if (parts.length > 1) {
      jsonText = parts[1].split('```')[0].trim();
    }
  } else if (jsonText.includes('```')) {
    const parts = jsonText.split('```');
    if (parts.length > 1) {
      jsonText = parts[1].split('```')[0].trim();
    }
  }

  // Find the first occurrence of { or [ (start of JSON)
  const firstBrace = jsonText.indexOf('{');
  const firstBracket = jsonText.indexOf('[');

  let jsonStart = -1;
  if (firstBrace !== -1 && firstBracket !== -1) {
    jsonStart = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    jsonStart = firstBrace;
  } else if (firstBracket !== -1) {
    jsonStart = firstBracket;
  }

  // If we found a JSON start, extract from there
  if (jsonStart > 0) {
    jsonText = jsonText.substring(jsonStart);
  }

  // Find the last occurrence of } or ] (end of JSON)
  const lastBrace = jsonText.lastIndexOf('}');
  const lastBracket = jsonText.lastIndexOf(']');

  let jsonEnd = -1;
  if (lastBrace !== -1 && lastBracket !== -1) {
    jsonEnd = Math.max(lastBrace, lastBracket);
  } else if (lastBrace !== -1) {
    jsonEnd = lastBrace;
  } else if (lastBracket !== -1) {
    jsonEnd = lastBracket;
  }

  // If we found a JSON end, extract up to there
  if (jsonEnd !== -1 && jsonEnd < jsonText.length - 1) {
    jsonText = jsonText.substring(0, jsonEnd + 1);
  }

  // Remove any remaining leading/trailing non-JSON characters
  jsonText = jsonText.trim();

  // Fix common JSON issues BEFORE normalization to preserve structure
  jsonText = jsonText
    .replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas

  // Check for truncation and try to fix BEFORE whitespace normalization
  const openBraces = (jsonText.match(/{/g) || []).length;
  const closeBraces = (jsonText.match(/}/g) || []).length;
  const openBrackets = (jsonText.match(/\[/g) || []).length;
  const closeBrackets = (jsonText.match(/\]/g) || []).length;

  // If there's an imbalance, we likely have truncated JSON
  if (openBraces > closeBraces || openBrackets > closeBrackets) {
    console.warn(`⚠️ Detected truncated JSON - attempting smart repair...`);
    console.warn(`   Open braces: ${openBraces}, Close braces: ${closeBraces}`);
    console.warn(`   Open brackets: ${openBrackets}, Close brackets: ${closeBrackets}`);

    // Try to find the last complete object in an array
    // Look for pattern: { "mcqs": [ ... incomplete object
    // Use a more flexible regex that handles various whitespace
    const mcqsArrayMatch = jsonText.match(/\{[\s\n\r]*"mcqs"[\s\n\r]*:[\s\n\r]*\[/);
    if (mcqsArrayMatch) {
      console.warn(`   Found mcqs array at position ${mcqsArrayMatch.index}`);

      // Find ALL complete MCQ objects
      const completeObjectPositions: number[] = [];
      let depth = 0;
      let inString = false;
      let escapeNext = false;

      // Start after the "mcqs": [ part
      const arrayStart = mcqsArrayMatch.index! + mcqsArrayMatch[0].length;

      for (let i = arrayStart; i < jsonText.length; i++) {
        const char = jsonText[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === '\\') {
          escapeNext = true;
          continue;
        }

        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }

        if (inString) continue;

        if (char === '{') {
          depth++;
        } else if (char === '}') {
          depth--;
          // If we're back to depth 0, we've completed an object
          if (depth === 0) {
            completeObjectPositions.push(i);
          }
        }
      }

      // Use the last complete object position
      if (completeObjectPositions.length > 0) {
        const lastCompleteObjectEnd = completeObjectPositions[completeObjectPositions.length - 1];
        jsonText = jsonText.substring(0, lastCompleteObjectEnd + 1);
        console.warn(`✂️ Found ${completeObjectPositions.length} complete objects, truncating to last one at position ${lastCompleteObjectEnd}`);

        // Now add the closing array and object brackets
        jsonText += ' ] }';

        // Final cleanup after repair
        jsonText = jsonText
          .replace(/\n/g, ' ')
          .replace(/\r/g, '')
          .replace(/\t/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        return jsonText;
      } else {
        console.warn(`⚠️ No complete objects found in mcqs array (depth tracking failed)`);
      }
    } else {
      console.warn(`⚠️ Could not find mcqs array pattern in JSON`);
      console.warn(`   First 100 chars:`, jsonText.substring(0, 100));
    }

    // Fallback: just add missing closing braces/brackets
    console.warn(`⚠️ Falling back to simple bracket addition`);
    if (openBraces > closeBraces) {
      console.warn(`   Adding ${openBraces - closeBraces} closing braces`);
      jsonText += '}'.repeat(openBraces - closeBraces);
    }
    if (openBrackets > closeBrackets) {
      console.warn(`   Adding ${openBrackets - closeBrackets} closing brackets`);
      jsonText += ']'.repeat(openBrackets - closeBrackets);
    }
  }

  // Final whitespace normalization
  jsonText = jsonText
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return jsonText;
}

/**
 * Highly stable internal batch generator with retry logic.
 * Uses small batches to ensure tokens are never exceeded.
 */
async function generateSingleBatch(
  request: MCQGenerationRequest,
  batchCount: number,
  batchIndex: number,
  totalBatches: number,
  retryCount: number = 0
): Promise<GeneratedMCQ[]> {
  const MAX_RETRIES = 5;

  // Coordinated check for global API lockout
  const now = Date.now();
  if (now < globalOverloadUntil) {
    const waitTime = globalOverloadUntil - now;
    console.warn(`⏳ Global Gemini lockout active. Waiting ${Math.round(waitTime / 1000)}s before starting batch ${batchIndex + 1}...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  // Only send recent questions to prevent prompt bloat
  const safeExistingQuestions = request.existingQuestions?.slice(-150) || [];

  const forbiddenSection = safeExistingQuestions.length > 0
    ? `
⚠️ **FORBIDDEN QUESTIONS (DO NOT REPEAT)**:
${safeExistingQuestions.map(q => `- ${q}`).join('\n')}
`
    : '';

  // Determine target language
  const targetLanguage = request.language || 'English';

  console.log(`📡 Calling Gemini API for batch ${batchIndex + 1} (Attempt ${retryCount + 1}/${MAX_RETRIES + 1})...`);
  const prompt = `
🔹 **ULTRA-STABLE MCQ GENERATOR [Batch ${batchIndex + 1}/${totalBatches}]**
Model: gemini-3-pro-preview

Objective: Generate EXACTLY ${batchCount} HIGH-QUALITY MCQs from the pharmaceutical SOP provided. Generate these MCQs in ${targetLanguage}.

📄 **SOP CONTEXT**
Name: ${request.sopName}
Identifier: ${request.sopIdentifier}
Content: ${request.sopContent}

${forbiddenSection}

🎯 **STRICT REQUIREMENTS:**
1. 🌐 **LANGUAGE**: ${targetLanguage === 'Gujarati' ? 'Generate ALL content (questions, options, explanations, and SOP references) in GUJARATI language using proper Unicode characters. The SOP content is in Gujarati, and your output MUST also be in Gujarati.' : 'Generate everything in English.'}
2. Generate exactly ${batchCount} questions.
3. Start every question with ⭐.
4. Every question MUST have exactly 4 options.
5. Explanations must be concise (max 2 sentences).
6. Output MUST be valid JSON matching the schema below.
7. ❌ **FORBIDDEN**: Do NOT create questions that ask about section references (e.g., "In section 4.4.2, what is stated?", "What does section X.Y say?"). Questions must focus on actual content, procedures, and concepts, NOT on section numbers or references.
8. 💎 **UNIQUENESS**: Each question MUST be distinct. Do NOT repeat the same concept with slight variations in this batch.
9. 🧩 **DEEP COVERAGE**: Cover DIFFERENT parts of the provided SOP. If you've already covered the basics, go into specific details, parameters, tolerances, and "if-then" scenarios mentioned in the text.
10. 🚀 **EXHAUSTIVE**: Be exhaustive. Find every possible unique piece of information to form a question.

📋 **SCHEMA:**
{
  "mcqs": [
    {
      "aiIcon": "🔬",
      "question": "⭐ [Question text]",
      "difficulty": "Medium",
      "difficultyStars": "⭐⭐",
      "options": ["A", "B", "C", "D"],
      "correctAnswer": "A",
      "explanation": "Reference point from SOP.",
      "sopReference": "Section X.Y",
      "optionVariants": [
        {"text": "A", "isCorrect": true},
        {"text": "B", "isCorrect": false},
        {"text": "C", "isCorrect": false},
        {"text": "D", "isCorrect": false}
      ]
    }
  ]
}

🚀 **GENERATE ${batchCount} MCQs NOW:**
Return ONLY the JSON. No additional text before or after.
`;

  try {
    let result;
    let apiCallRetries = 3;
    let apiCallDelay = 2000;

    while (apiCallRetries > 0) {
      try {
        console.log(`📡 Calling Gemini API for batch ${batchIndex + 1} (Attempt ${retryCount + 1}/${MAX_RETRIES + 1}, API Call Retry ${4 - apiCallRetries}/3)...`);
        result = await geminiModel.generateContent(prompt);
        break; // Success, exit retry loop
      } catch (apiError: any) {
        const errorMessage = apiError.message || '';
        const status = apiError.status || (apiError.response ? apiError.response.status : null);
        const isBusy = status === 503 || status === 429 || errorMessage.includes('503') || errorMessage.includes('429') || errorMessage.includes('overloaded') || errorMessage.includes('Service Unavailable') || errorMessage.includes('Too Many Requests');

        if (isBusy && apiCallRetries > 1) {
          console.warn(`⚠️ Gemini API busy or rate-limited for batch ${batchIndex + 1}. Retrying in ${Math.round(apiCallDelay / 1000)}s... (${apiCallRetries - 1} left)`);
          await new Promise(r => setTimeout(r, apiCallDelay));
          apiCallRetries--;
          apiCallDelay *= 2; // Exponential backoff
        } else {
          // If not a busy error, or no retries left, re-throw the original error
          console.error(`🚨 Gemini API Error in batch ${batchIndex + 1}:`, apiError);

          if (errorMessage.includes('fetch failed') || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNREFUSED')) {
            throw new Error(`Connection error: ${errorMessage}`);
          } else if (isBusy) {
            throw new Error(`Overloaded error: ${errorMessage}`);
          } else {
            throw new Error(`Gemini API error: ${errorMessage || 'Unknown API error'}`);
          }
        }
      }
    }

    if (!result) {
      throw new Error(`Gemini API call failed after multiple retries for batch ${batchIndex + 1}.`);
    }

    const response = await result.response;
    const rawText = response.text();

    if (!rawText || rawText.trim().length === 0) {
      throw new Error(`Connection error: AI returned empty response.`);
    }

    const jsonText = cleanAndExtractJSON(rawText);

    if (!jsonText || jsonText.trim().length === 0) {
      throw new Error(`Unable to extract JSON from AI response.`);
    }

    let parsed: { mcqs: GeneratedMCQ[] };
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      throw new Error(`AI returned malformed JSON in batch ${batchIndex + 1}`);
    }

    if (!parsed.mcqs || !Array.isArray(parsed.mcqs) || parsed.mcqs.length === 0) {
      throw new Error(`Batch ${batchIndex + 1} structure invalid or empty`);
    }

    return parsed.mcqs.map((mcq, idx) => {
      const options: string[] = mcq.options || [];
      const rawAnswer: string = (mcq.correctAnswer || '').trim();

      // --- Resolve the correct answer text from the options array ---
      // The AI sometimes returns a letter ("A", "B", "C", "D") while options hold full text,
      // or returns full text while options hold letters. Handle all cases.
      let resolvedCorrectAnswer = '';

      // Case 1: Exact match (letter vs letter, or full text vs full text)
      const exactMatch = options.find(opt => opt.trim().toLowerCase() === rawAnswer.toLowerCase());
      if (exactMatch) {
        resolvedCorrectAnswer = exactMatch;
      }
      // Case 2: correctAnswer is a single letter (A/B/C/D) → map to option by index
      else if (/^[A-Da-d]$/.test(rawAnswer)) {
        const letterIndex = rawAnswer.toUpperCase().charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
        if (options[letterIndex]) {
          resolvedCorrectAnswer = options[letterIndex];
        }
      }
      // Case 3: correctAnswer starts with "A. " / "B. " / "C. " / "D. " → strip the prefix letter and search
      else if (/^[A-Da-d]\.\s/.test(rawAnswer)) {
        const withoutPrefix = rawAnswer.replace(/^[A-Da-d]\.\s*/, '').toLowerCase();
        const prefixMatch = options.find(opt => opt.replace(/^[A-Da-d]\.\s*/, '').trim().toLowerCase() === withoutPrefix);
        resolvedCorrectAnswer = prefixMatch || '';
        // Also try by letter index fallback
        if (!resolvedCorrectAnswer) {
          const letterIndex = rawAnswer.toUpperCase().charCodeAt(0) - 65;
          resolvedCorrectAnswer = options[letterIndex] || '';
        }
      }
      // Case 4: options are single letters but correctAnswer is full text → find by letter prefix in answer
      else {
        const firstChar = rawAnswer[0]?.toUpperCase();
        if (firstChar && /[A-D]/.test(firstChar) && options.some(o => /^[A-D]$/.test(o.trim()))) {
          const letterMatch = options.find(o => o.trim().toUpperCase() === firstChar);
          resolvedCorrectAnswer = letterMatch || '';
        }
      }

      // Final fallback: use first option only if nothing resolved (logs warning for debugging)
      if (!resolvedCorrectAnswer) {
        console.warn(`⚠️ Q${idx + 1}: Could not resolve correctAnswer "${rawAnswer}" from options [${options.join(' | ')}]. Defaulting to option A.`);
        resolvedCorrectAnswer = options[0] || '';
      }

      // Build optionVariants from scratch using the resolved answer to ensure isCorrect is accurate
      const optionVariants = options.map((opt: string) => ({
        text: opt,
        isCorrect: opt === resolvedCorrectAnswer,
      }));

      return {
        ...mcq,
        aiIcon: mcq.aiIcon || '🔬',
        correctAnswer: resolvedCorrectAnswer,
        optionVariants,
      };
    });

  } catch (error: any) {
    console.error(`💥 Error in batch ${batchIndex + 1} (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, error.message);

    if (retryCount < MAX_RETRIES) {
      let delay = 2000;

      if (error.message.includes('Connection error')) {
        delay = 5000 * Math.pow(1.5, retryCount);
      } else if (error.message.includes('Overloaded error')) {
        const nextLockout = Date.now() + 60000;
        if (nextLockout > globalOverloadUntil) {
          globalOverloadUntil = nextLockout;
        }
        // Cap at 75s — 300s was too punishing for free-tier transient overloads
        delay = (20000 * Math.pow(2, retryCount)) + (Math.random() * 10000);
        delay = Math.min(delay, 75000);
      } else {
        delay = Math.min(2000 * Math.pow(2, retryCount), 15000);
      }

      console.log(`🔄 Retrying batch ${batchIndex + 1} in ${Math.round(delay / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return generateSingleBatch(request, batchCount, batchIndex, totalBatches, retryCount + 1);
    }

    return [];
  }

  return [];
}

export async function generateMCQsFromSOP(
  request: MCQGenerationRequest
): Promise<MCQGenerationResponse> {
  const currentCount = request.existingQuestions?.length || 0;

  let TOTAL_TARGET;
  if (request.targetCount) {
    TOTAL_TARGET = request.targetCount;
  } else if (request.isBulk) {
    TOTAL_TARGET = 100;
  } else {
    TOTAL_TARGET = currentCount + 50;
  }

  const BATCH_SIZE = 10;       // Smaller batches = shorter prompts = less chance of 429
  const NEEDED = Math.max(0, TOTAL_TARGET - currentCount);
  const NUM_BATCHES = Math.ceil(NEEDED / BATCH_SIZE);
  const PARALLEL_BATCHES = 1;  // Always sequential to respect rate limits

  console.log(`🚀 Starting generation for: ${request.sopName}. Progress: ${currentCount}/${TOTAL_TARGET}`);

  let allMCQs: GeneratedMCQ[] = [];
  let currentExisting = [...(request.existingQuestions || [])];
  let processedBatchesCount = 0;
  const MAX_BATCH_ATTEMPTS = Math.max(10, NUM_BATCHES * 4);

  while (allMCQs.length < NEEDED && processedBatchesCount < MAX_BATCH_ATTEMPTS) {
    const remainingNeeded = NEEDED - allMCQs.length;
    const batchSize = Math.min(BATCH_SIZE, remainingNeeded);

    const batch = await generateSingleBatch(
      { ...request, existingQuestions: currentExisting },
      batchSize,
      processedBatchesCount,
      NUM_BATCHES
    );

    if (batch.length > 0) {
      const uniqueBatch = batch.filter(mcq => {
        const qClean = mcq.question.replace(/^⭐\s*/, '').trim().toLowerCase();
        return !currentExisting.some(ex => ex.replace(/^⭐\s*/, '').trim().toLowerCase() === qClean);
      });

      if (uniqueBatch.length > 0) {
        allMCQs = [...allMCQs, ...uniqueBatch];
        currentExisting = [...currentExisting, ...uniqueBatch.map(m => m.question)];

        if (request.onBatchComplete) {
          try {
            await request.onBatchComplete(uniqueBatch);
          } catch (saveError) {
            console.error(`⚠️ Save error:`, saveError);
          }
        }
      }
    }

    processedBatchesCount++;
    if (allMCQs.length < NEEDED) {
      // 8s gap between batches = ~7 req/min, safely under the 15 RPM free-tier limit
      await new Promise(resolve => setTimeout(resolve, 8000));
    }
  }

  const distribution = {
    easy: allMCQs.filter(m => m.difficulty === 'Easy').length,
    medium: allMCQs.filter(m => m.difficulty === 'Medium').length,
    hard: allMCQs.filter(m => m.difficulty === 'Hard').length,
  };

  return {
    mcqs: allMCQs,
    difficultyDistribution: distribution,
    totalQuestions: allMCQs.length,
    aiModel: DEFAULT_MODEL,
  };
}
