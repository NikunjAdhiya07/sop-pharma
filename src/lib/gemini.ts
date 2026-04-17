import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';

if (!GEMINI_API_KEY) {
  console.error('❌ Gemini API Key is missing! Please set GEMINI_API_KEY or GOOGLE_AI_API_KEY in your environment.');
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Model selection for MCQ generation - Using Gemini models
// Try models in order of preference:
// 1. gemini-2.0-flash - Latest Gemini 2.0 Flash (PAID TIER - unlimited quota, best performance)
// 2. gemini-1.5-pro - Gemini 1.5 Pro (PAID TIER - reliable, very capable)
// 3. gemini-1.5-flash - Fallback (fast, good quality)
const MODEL_CANDIDATES = [
  'gemini-2.0-flash',
  'gemini-1.5-pro',
  'gemini-1.5-flash'
];
let DEFAULT_MODEL = MODEL_CANDIDATES[0];
let currentModelIndex = 0;

const createGeminiModel = (modelName: string) => {
  return genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      maxOutputTokens: 32768,
      temperature: 0.5,  // Lower temp for more focused, consistent quality
      topP: 0.95,
      topK: 40,  // Slightly more conservative for better coherence
    },
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
    ],
  });
};

export let geminiModel = createGeminiModel(DEFAULT_MODEL);

// Switch to next available model when current one fails
export const switchToNextModel = () => {
  if (currentModelIndex < MODEL_CANDIDATES.length - 1) {
    currentModelIndex++;
    DEFAULT_MODEL = MODEL_CANDIDATES[currentModelIndex];
    geminiModel = createGeminiModel(DEFAULT_MODEL);
    console.log(`🔄 Switched to fallback model: ${DEFAULT_MODEL}`);
    return true;
  }
  console.error(`❌ No more fallback models available`);
  return false;
};

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
  const MAX_RETRIES = 8; // Increased from 5 to handle more transient errors

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

  // Rotate question angle per batch so successive batches never repeat the same style
  const ANGLE_ROTATION = [
    'Focus on: DEFINITIONS and KEY TERMS from the SOP. Ask "what is", "what does X mean", "which term describes".',
    'Focus on: STEP-BY-STEP PROCEDURES. Ask about sequence, order of steps, "what is done first/next/last".',
    'Focus on: COMPLIANCE REQUIREMENTS and REGULATIONS. Ask about limits, thresholds, mandatory actions, regulatory basis.',
    'Focus on: SCENARIO-BASED questions. Describe a situation and ask what should be done, what went wrong, or what is correct.',
    'Focus on: RESPONSIBILITIES and ROLES. Ask who is responsible, who approves, who performs each action.',
    'Focus on: SAFETY and QUALITY CONTROL. Ask about critical control points, failure modes, corrective actions.',
    'Focus on: DOCUMENTATION and RECORDS. Ask about what must be recorded, how long records are kept, who signs.',
    'Focus on: EQUIPMENT and MATERIALS. Ask about specifications, usage conditions, cleaning requirements.',
  ];
  const angleHint = ANGLE_ROTATION[batchIndex % ANGLE_ROTATION.length];

  const prompt = `
You are an expert pharmaceutical compliance and training specialist. Generate high-quality MCQs from the SOP below.

TASK: Generate EXACTLY ${batchCount} unique MCQs.
BATCH FOCUS: ${angleHint}
This batch must cover DIFFERENT concepts than any forbidden questions listed below.

📄 SOP DETAILS:
- Name: ${request.sopName}
- Identifier: ${request.sopIdentifier}
- Language: ${targetLanguage}
- Content:
${request.sopContent}

${forbiddenSection}

✅ STRICT REQUIREMENTS:
1. Language: ${targetLanguage === 'Gujarati' ? 'GUJARATI (ગુજરાતી) ONLY — every word, every option, every explanation must be in Gujarati script' : 'English only'}
2. Generate EXACTLY ${batchCount} questions
3. Each question starts with ⭐
4. Exactly 4 options per question — all must be realistic and plausible (no obviously wrong options)
5. correctAnswer must be the EXACT text of one of the options
6. NO questions about document numbers, section numbers, or page references
7. NO repeating concepts from forbidden questions — test completely new aspects
8. Mix difficulty: roughly 1/3 Easy, 1/3 Medium, 1/3 Hard
9. Return ONLY valid JSON — no markdown, no code blocks, no explanation text

📋 EXACT JSON FORMAT:
{
  "mcqs": [
    {
      "aiIcon": "🔬",
      "question": "⭐ [question text]",
      "difficulty": "Easy",
      "difficultyStars": "⭐",
      "options": ["Full option A", "Full option B", "Full option C", "Full option D"],
      "correctAnswer": "Full option A",
      "explanation": "One sentence explanation referencing the SOP.",
      "sopReference": "Relevant section name",
      "optionVariants": [
        {"text": "Full option A", "isCorrect": true},
        {"text": "Full option B", "isCorrect": false},
        {"text": "Full option C", "isCorrect": false},
        {"text": "Full option D", "isCorrect": false}
      ]
    }
  ]
}

OUTPUT ONLY THE JSON OBJECT. Nothing else.`;

  try {
    let result;
    let apiCallRetries = 3;
    let apiCallDelay = 2000;

    while (apiCallRetries > 0) {
      try {
        result = await geminiModel.generateContent(prompt);
        break; // Success, exit retry loop
      } catch (apiError: any) {
        const errorMessage = apiError.message || '';
        const status = apiError.status || (apiError.response ? apiError.response.status : null);
        const isBusy = status === 503 || status === 429 || errorMessage.includes('503') || errorMessage.includes('429') || errorMessage.includes('overloaded') || errorMessage.includes('Service Unavailable') || errorMessage.includes('Too Many Requests');
        const isNotFound = status === 404 || errorMessage.includes('404') || errorMessage.includes('not found');
        const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND');

        console.warn(`⚠️ API Error (Batch ${batchIndex + 1}): Status=${status}, Message: ${errorMessage.substring(0, 100)}`);

        // Model not found - try next fallback model
        if (isNotFound && errorMessage.includes('model')) {
          if (switchToNextModel()) {
            console.warn(`🔄 Model not available, trying fallback: ${DEFAULT_MODEL}`);
            await new Promise(r => setTimeout(r, 1000));
            apiCallRetries--;
          } else {
            throw new Error(`No available models: ${errorMessage}`);
          }
        } else if ((isBusy || isTimeout) && apiCallRetries > 1) {
          let waitTime = apiCallDelay;
          if (isBusy) {
            waitTime = Math.min(10000, apiCallDelay * 1.5); // Shorter wait for paid tier - 10s max
          } else if (isTimeout) {
            waitTime = 2000 + Math.random() * 2000; // 2-4s for timeouts
          }
          console.warn(`⏳ Retrying batch ${batchIndex + 1} in ${Math.round(waitTime / 1000)}s... (${apiCallRetries - 1} API retries left)`);
          await new Promise(r => setTimeout(r, waitTime));
          apiCallRetries--;
          apiCallDelay = Math.min(apiCallDelay * 1.3, 12000); // Slower backoff for paid tier
        } else {
          // If not a recoverable error, or no retries left, re-throw the original error
          console.error(`🚨 Gemini API Error in batch ${batchIndex + 1}:`, apiError);

          if (isTimeout) {
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
      console.warn(`⚠️ Batch ${batchIndex + 1}: Empty response from API`);
      throw new Error(`Connection error: AI returned empty response.`);
    }

    const jsonText = cleanAndExtractJSON(rawText);

    if (!jsonText || jsonText.trim().length === 0) {
      console.warn(`⚠️ Batch ${batchIndex + 1}: Could not extract JSON from response`);
      console.warn(`Raw response preview: ${rawText.substring(0, 500)}`);
      throw new Error(`Unable to extract JSON from AI response.`);
    }

    let parsed: { mcqs: GeneratedMCQ[] };
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      console.error(`❌ JSON Parse Error in batch ${batchIndex + 1}:`, parseError);
      console.error(`Cleaned JSON preview: ${jsonText.substring(0, 500)}`);
      throw new Error(`AI returned malformed JSON in batch ${batchIndex + 1}`);
    }

    if (!parsed.mcqs || !Array.isArray(parsed.mcqs)) {
      console.warn(`⚠️ Batch ${batchIndex + 1}: mcqs is not an array`);
      throw new Error(`Batch ${batchIndex + 1}: Invalid structure - mcqs must be an array`);
    }

    if (parsed.mcqs.length === 0) {
      console.warn(`⚠️ Batch ${batchIndex + 1}: Received empty mcqs array`);
      throw new Error(`Batch ${batchIndex + 1}: Generated 0 questions - retrying`);
    }

    return parsed.mcqs.map((mcq, idx) => {
      let options: string[] = mcq.options || [];

      // Validate options array
      if (!Array.isArray(options) || options.length === 0) {
        console.warn(`⚠️ Q${idx + 1} in batch ${batchIndex + 1}: Invalid options array. Using placeholder options.`);
        options = ['Option A', 'Option B', 'Option C', 'Option D'];
      } else if (options.length < 4) {
        console.warn(`⚠️ Q${idx + 1} in batch ${batchIndex + 1}: Only ${options.length} options provided, padding to 4.`);
        while (options.length < 4) {
          options.push(`Option ${String.fromCharCode(65 + options.length)}`);
        }
      } else if (options.length > 4) {
        console.warn(`⚠️ Q${idx + 1} in batch ${batchIndex + 1}: ${options.length} options provided, keeping first 4.`);
        options = options.slice(0, 4);
      }

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
        // Last resort: check if any option is marked as correct in optionVariants
        if (mcq.optionVariants && Array.isArray(mcq.optionVariants)) {
          const correctFromVariants = mcq.optionVariants.find(v => v.isCorrect);
          if (correctFromVariants) {
            resolvedCorrectAnswer = correctFromVariants.text;
          }
        }

        // If still not found, use the first option
        if (!resolvedCorrectAnswer) {
          console.warn(`⚠️ Q${idx + 1}: Could not resolve correctAnswer "${rawAnswer}" from options [${options.join(' | ')}]. Defaulting to option A.`);
          resolvedCorrectAnswer = options[0] || '';
        }
      }

      // Validate that resolved answer is in options array
      if (options.length > 0 && !options.includes(resolvedCorrectAnswer)) {
        console.warn(`⚠️ Q${idx + 1}: Resolved answer "${resolvedCorrectAnswer}" not in options. Using first option.`);
        resolvedCorrectAnswer = options[0];
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
        delay = (20000 * Math.pow(2, retryCount)) + (Math.random() * 10000);
        delay = Math.min(delay, 75000);
      } else if (error.message.includes('No available models')) {
        // All fallback models exhausted — reset to first model and wait longer
        currentModelIndex = 0;
        DEFAULT_MODEL = MODEL_CANDIDATES[0];
        geminiModel = createGeminiModel(DEFAULT_MODEL);
        console.warn(`🔄 All models exhausted. Resetting to ${DEFAULT_MODEL} and waiting 30s...`);
        delay = 30000;
      } else {
        delay = Math.min(2000 * Math.pow(2, retryCount), 15000);
      }

      console.log(`🔄 Retrying batch ${batchIndex + 1} in ${Math.round(delay / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return generateSingleBatch(request, batchCount, batchIndex, totalBatches, retryCount + 1);
    }

    // Final fallback: try with a smaller batch (1 question) to get at least something
    if (batchCount > 1) {
      console.warn(`⚠️ Batch of ${batchCount} failed after ${MAX_RETRIES + 1} attempts. Trying with batch size 1...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      return generateSingleBatch(request, 1, batchIndex, totalBatches, 0);
    }

    console.error(`❌ Batch ${batchIndex + 1} completely failed. Returning empty.`);
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

  const NEEDED = Math.max(0, TOTAL_TARGET - currentCount);

  // For small numbers of questions (1-3), generate a batch of 5 to handle duplicates/failures
  // For larger numbers, use standard batch size of 10
  let BATCH_SIZE = NEEDED <= 3 ? 5 : 10;
  const NUM_BATCHES = Math.ceil(NEEDED / BATCH_SIZE);
  const PARALLEL_BATCHES = 1;  // Always sequential to respect rate limits


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

    if (batch && batch.length > 0) {
      const uniqueBatch = batch.filter(mcq => {
        const qClean = mcq.question.replace(/^⭐\s*/, '').trim().toLowerCase();
        const isDuplicate = currentExisting.some(ex => ex.replace(/^⭐\s*/, '').trim().toLowerCase() === qClean);
        return !isDuplicate;
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
      } else if (batch.length > 0) {
        // All generated questions were duplicates
        // If we need very few questions (1-2) and exhausted retries, use duplicates as fallback
        if (NEEDED <= 2 && allMCQs.length === 0 && processedBatchesCount >= NUM_BATCHES - 1) {
          console.warn(`⚠️ All generated questions were duplicates, but need ${NEEDED} and have 0. Using one generated question as fallback.`);
          const fallbackQuestion = batch[0];
          allMCQs.push(fallbackQuestion);
          // Don't add to currentExisting to allow potential duplicates in edge cases
        } else {
          console.warn(`⚠️ Batch ${processedBatchesCount + 1} had all duplicates - will retry`);
        }
      }
    } else {
      console.warn(`⚠️ Batch ${processedBatchesCount + 1} returned 0 questions`);
    }

    processedBatchesCount++;

    if (allMCQs.length < NEEDED && processedBatchesCount < MAX_BATCH_ATTEMPTS) {
      // 2-3s gap between batches for paid tier (no rate-limit restrictions)
      const gapSeconds = 2 + Math.random() * 1; // 2-3s with jitter
      await new Promise(resolve => setTimeout(resolve, gapSeconds * 1000));
    }
  }

  if (allMCQs.length === 0) {
    console.error(`❌ CRITICAL: Failed to generate ANY questions after ${MAX_BATCH_ATTEMPTS} batch attempts. Making one final attempt with minimum batch size...`);
    // Reset model to first and do one last desperate attempt with batch size 1
    currentModelIndex = 0;
    DEFAULT_MODEL = MODEL_CANDIDATES[0];
    geminiModel = createGeminiModel(DEFAULT_MODEL);
    await new Promise(resolve => setTimeout(resolve, 10000));
    const lastResort = await generateSingleBatch(request, 1, 0, 1, 0);
    if (lastResort.length > 0) {
      allMCQs = lastResort;
      console.log(`✅ Last resort generation got ${lastResort.length} question(s).`);
      if (request.onBatchComplete) {
        await request.onBatchComplete(lastResort).catch(() => {});
      }
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
