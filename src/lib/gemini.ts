import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';

if (!GEMINI_API_KEY) {
  console.error('❌ Gemini API Key is missing! Please set GEMINI_API_KEY or GOOGLE_AI_API_KEY in your environment.');
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Model selection for MCQ generation - Using Gemini models
// Try models in order of preference:
// 1. gemini-2.0-flash - Latest Gemini 2.0 Flash (PAID TIER - unlimited quota)
// 2. gemini-1.5-pro - Gemini 1.5 Pro (PAID TIER - reliable, unlimited quota)
// 3. gemini-3-flash-preview - Fallback (has free tier quota limit)
const MODEL_CANDIDATES = [
  'gemini-2.0-flash',
  'gemini-1.5-pro',
  'gemini-3-flash-preview'
];
let DEFAULT_MODEL = MODEL_CANDIDATES[0];
let currentModelIndex = 0;

const createGeminiModel = (modelName: string) => {
  console.log(`🤖 Initializing Gemini model: ${modelName} (PAID TIER - Unlimited Quota)`);
  return genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      maxOutputTokens: 32768,
      temperature: 0.6,  // Slightly lower for better quality in paid tier
      topP: 0.9,
      topK: 50,
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

  console.log(`📡 Calling Gemini API for batch ${batchIndex + 1} (Attempt ${retryCount + 1}/${MAX_RETRIES + 1})...`);
  const prompt = `
You are an expert pharmaceutical compliance and training specialist. Your task is to generate high-quality Multiple Choice Questions (MCQs) from the SOP provided below.

TASK: Generate EXACTLY ${batchCount} unique, well-crafted MCQs from this pharmaceutical SOP.

📄 SOP DETAILS:
- Name: ${request.sopName}
- Identifier: ${request.sopIdentifier}
- Language: ${targetLanguage}
- SOP Content:
${request.sopContent}

${forbiddenSection}

✅ CRITICAL REQUIREMENTS:
1. Language: ${targetLanguage === 'Gujarati' ? 'GUJARATI (ગુજરાતી) ONLY - Every part must be in Gujarati script' : 'English'}
2. Generate EXACTLY ${batchCount} questions - no more, no less
3. Each question must start with ⭐
4. Each question must have exactly 4 options
5. Each option must be a realistic answer choice
6. correctAnswer must be one of the actual option texts (not a letter)
7. Explanations: concise, 1-2 sentences max
8. No questions about section numbers - focus on content, procedures, concepts
9. Every question must be unique - no concept repetition
10. Cover different parts of the SOP - vary the topics
11. Return VALID JSON only - no markdown, no extra text

📋 JSON SCHEMA - FOLLOW EXACTLY:
{
  "mcqs": [
    {
      "aiIcon": "🔬",
      "question": "⭐ What is the main purpose of...",
      "difficulty": "Easy",
      "difficultyStars": "⭐",
      "options": ["Option A full text", "Option B full text", "Option C full text", "Option D full text"],
      "correctAnswer": "Option A full text",
      "explanation": "Brief explanation with SOP reference.",
      "sopReference": "Main procedure section",
      "optionVariants": [
        {"text": "Option A full text", "isCorrect": true},
        {"text": "Option B full text", "isCorrect": false},
        {"text": "Option C full text", "isCorrect": false},
        {"text": "Option D full text", "isCorrect": false}
      ]
    }
  ]
}

DIFFICULTY GUIDE:
- Easy (⭐): Basic definitions, procedures
- Medium (⭐⭐): Application, scenarios, procedures
- Hard (⭐⭐⭐): Complex scenarios, calculations, edge cases

NOW GENERATE THE JSON:
Output ONLY the JSON object with "mcqs" array. No explanation, no markdown, no code blocks.`;

  try {
    let result;
    let apiCallRetries = 3;
    let apiCallDelay = 2000;

    while (apiCallRetries > 0) {
      try {
        console.log(`📡 Calling Gemini API for batch ${batchIndex + 1} (Attempt ${retryCount + 1}/${MAX_RETRIES + 1}, API Call Retry ${4 - apiCallRetries}/3)...`);
        result = await geminiModel.generateContent(prompt);
        console.log(`✅ API call successful for batch ${batchIndex + 1}`);
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

    console.log(`📝 Raw response length for batch ${batchIndex + 1}: ${rawText.length} characters`);

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

    console.log(`✅ Batch ${batchIndex + 1}: Successfully parsed ${parsed.mcqs.length} questions`);


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

  const NEEDED = Math.max(0, TOTAL_TARGET - currentCount);

  // For small numbers of questions (1-3), generate a batch of 5 to handle duplicates/failures
  // For larger numbers, use standard batch size of 10
  let BATCH_SIZE = NEEDED <= 3 ? 5 : 10;
  const NUM_BATCHES = Math.ceil(NEEDED / BATCH_SIZE);
  const PARALLEL_BATCHES = 1;  // Always sequential to respect rate limits

  console.log(`🚀 Starting generation for: ${request.sopName}. Progress: ${currentCount}/${TOTAL_TARGET}`);
  console.log(`📊 Need ${NEEDED} questions. Using batch size: ${BATCH_SIZE}`);
  console.log(`🔢 Will attempt ${NUM_BATCHES} batch(es)`);

  let allMCQs: GeneratedMCQ[] = [];
  let currentExisting = [...(request.existingQuestions || [])];
  let processedBatchesCount = 0;
  const MAX_BATCH_ATTEMPTS = Math.max(10, NUM_BATCHES * 4);

  while (allMCQs.length < NEEDED && processedBatchesCount < MAX_BATCH_ATTEMPTS) {
    const remainingNeeded = NEEDED - allMCQs.length;
    const batchSize = Math.min(BATCH_SIZE, remainingNeeded);

    console.log(`🔨 Processing batch ${processedBatchesCount + 1}/${NUM_BATCHES} (need ${remainingNeeded} more questions, already have ${allMCQs.length})`);

    const batch = await generateSingleBatch(
      { ...request, existingQuestions: currentExisting },
      batchSize,
      processedBatchesCount,
      NUM_BATCHES
    );

    if (batch && batch.length > 0) {
      console.log(`📥 Batch ${processedBatchesCount + 1} generated ${batch.length} questions`);

      const uniqueBatch = batch.filter(mcq => {
        const qClean = mcq.question.replace(/^⭐\s*/, '').trim().toLowerCase();
        const isDuplicate = currentExisting.some(ex => ex.replace(/^⭐\s*/, '').trim().toLowerCase() === qClean);
        if (isDuplicate) {
          console.log(`⚠️ Skipping duplicate: ${mcq.question.substring(0, 50)}...`);
        }
        return !isDuplicate;
      });

      if (uniqueBatch.length > 0) {
        console.log(`✅ Added ${uniqueBatch.length} unique questions from batch ${processedBatchesCount + 1}`);
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
      console.log(`⏳ Waiting ${Math.round(gapSeconds)}s before next batch...`);
      await new Promise(resolve => setTimeout(resolve, gapSeconds * 1000));
    }
  }

  if (allMCQs.length === 0) {
    console.error(`❌ CRITICAL: Failed to generate ANY questions after ${MAX_BATCH_ATTEMPTS} batch attempts`);
    console.error(`📊 Stats:`, {
      needed: NEEDED,
      batchSize: BATCH_SIZE,
      numBatches: NUM_BATCHES,
      processedBatches: processedBatchesCount,
      allMCQsLength: allMCQs.length,
      currentExistingLength: currentExisting.length
    });
  } else if (allMCQs.length < NEEDED) {
    console.warn(`⚠️ Only generated ${allMCQs.length}/${NEEDED} needed questions after ${MAX_BATCH_ATTEMPTS} attempts`);
  } else {
    console.log(`✅ Successfully generated all ${allMCQs.length} needed questions!`);
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
