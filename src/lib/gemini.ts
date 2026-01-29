import { GoogleGenerativeAI } from '@google/generative-ai';

if (!process.env.GOOGLE_AI_API_KEY) {
  throw new Error('GOOGLE_AI_API_KEY is not defined in environment variables');
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

// Switch to Flash for faster generation with higher rate limits
export const geminiModel = genAI.getGenerativeModel({ 
  model: 'models/gemini-3-flash-preview',
  generationConfig: {
    responseMimeType: "application/json",
    maxOutputTokens: 32768, // Increased to reduce truncation risk
    temperature: 0.1, // Very low temperature for maximum JSON stability
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
    console.warn(`⏳ Global Gemini lockout active. Waiting ${Math.round(waitTime/1000)}s before starting batch ${batchIndex + 1}...`);
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

  const prompt = `
🔹 **ULTRA-STABLE MCQ GENERATOR [Batch ${batchIndex + 1}/${totalBatches}]**
Model: Gemini-3-Flash-Preview

Objective: Generate EXACTLY ${batchCount} HIGH-QUALITY MCQs from the pharmaceutical SOP provided.

📄 **SOP CONTEXT**
Name: ${request.sopName}
Identifier: ${request.sopIdentifier}
Content: ${request.sopContent}

${forbiddenSection}

🎯 **STRICT REQUIREMENTS:**
1. Generate exactly ${batchCount} questions.
2. Start every question with ⭐.
3. Every question MUST have exactly 4 options.
4. Explanations must be concise (max 2 sentences).
5. Output MUST be valid JSON matching the schema below.
6. ❌ **FORBIDDEN**: Do NOT create questions that ask about section references (e.g., "In section 4.4.2, what is stated?", "What does section X.Y say?"). Questions must focus on actual content, procedures, and concepts, NOT on section numbers or references.
7. 💎 **UNIQUENESS**: Each question MUST be distinct. Do NOT repeat the same concept with slight variations in this batch.
8. 🧩 **DEEP COVERAGE**: Cover DIFFERENT parts of the provided SOP. If you've already covered the basics, go into specific details, parameters, tolerances, and "if-then" scenarios mentioned in the text.
9. 🚀 **EXHAUSTIVE**: Be exhaustive. Find every possible unique piece of information to form a question.

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
    try {
      console.log(`📡 Calling Gemini API for batch ${batchIndex + 1} (Attempt ${retryCount + 1}/${MAX_RETRIES + 1})...`);
      result = await geminiModel.generateContent(prompt);
    } catch (apiError: any) {
      // Handle Gemini API specific errors
      console.error(`🚨 Gemini API Error in batch ${batchIndex + 1}:`, apiError);
      
      const errorMessage = apiError.message || '';
      const status = apiError.status || (apiError.response ? apiError.response.status : null);
      
      if (errorMessage.includes('fetch failed') || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNREFUSED')) {
        console.warn(`🌐 Network/Connection issue detected. API endpoint might be temporarily unreachable.`);
        throw new Error(`Connection error: ${errorMessage}`);
      } else if (status === 503 || status === 429 || errorMessage.includes('503') || errorMessage.includes('429') || errorMessage.includes('overloaded') || errorMessage.includes('Service Unavailable') || errorMessage.includes('Too Many Requests')) {
        console.warn(`🔥 AI Model is currently OVERLOADED or RATE LIMITED (${status || 'API Error'}). Need a long pause.`);
        throw new Error(`Overloaded error: ${errorMessage}`);
      } else if (errorMessage.includes('API key')) {
        throw new Error(`Authentication error: Invalid or missing API key.`);
      } else if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
        throw new Error(`Rate limit exceeded.`);
      } else if (errorMessage.includes('model')) {
        throw new Error(`Model error: The model 'gemini-3-flash-preview' may not be available. Error: ${errorMessage}`);
      } else {
        throw new Error(`Gemini API error: ${errorMessage || 'Unknown API error'}`);
      }
    }
    
    const response = await result.response;
    const rawText = response.text();
    
    console.log(`📥 Batch ${batchIndex + 1} raw response length: ${rawText.length} chars`);
    
    // Check for completely empty response - THIS SHOULD BE RETRIED
    if (!rawText || rawText.trim().length === 0) {
      console.error(`❌ Batch ${batchIndex + 1} - Empty response from AI. Treat as retryable error.`);
      throw new Error(`Connection error: AI returned empty response.`);
    }
    
    // Warn if response seems suspiciously short for the batch size
    const expectedMinLength = batchCount * 200; // Rough estimate: 200 chars per MCQ minimum
    if (rawText.length < expectedMinLength) {
      console.warn(`⚠️ Batch ${batchIndex + 1} response seems short (${rawText.length} chars, expected ~${expectedMinLength}+)`);
    }
    
    // Clean and extract JSON
    const jsonText = cleanAndExtractJSON(rawText);
    
    console.log(`🧹 Batch ${batchIndex + 1} cleaned JSON length: ${jsonText.length} chars`);
    
    // Check if cleaning resulted in empty string
    if (!jsonText || jsonText.trim().length === 0) {
      console.error(`❌ Batch ${batchIndex + 1} - Cleaning resulted in empty JSON`);
      throw new Error(`Unable to extract JSON from AI response. Response may be malformed or non-JSON.`);
    }
    
    // Validate JSON structure before parsing
    if (!jsonText.startsWith('{') && !jsonText.startsWith('[')) {
      throw new Error(`Response doesn't start with valid JSON character.`);
    }

    let parsed: { mcqs: GeneratedMCQ[] };
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      console.error(`❌ Batch ${batchIndex + 1} JSON Parse Error:`, parseError);
      throw new Error(`AI returned malformed JSON in batch ${batchIndex + 1}`);
    }

    // Validate structure
    if (!parsed.mcqs || !Array.isArray(parsed.mcqs)) {
      throw new Error(`Batch ${batchIndex + 1} structure invalid: missing or invalid 'mcqs' array`);
    }
    
    if (parsed.mcqs.length === 0) {
      throw new Error(`Batch ${batchIndex + 1} returned 0 questions`);
    }

    console.log(`✅ Batch ${batchIndex + 1} parsed successfully: ${parsed.mcqs.length} questions`);

    // Standardize and heal
    return parsed.mcqs.map(mcq => ({
      ...mcq,
      aiIcon: mcq.aiIcon || '🔬',
      optionVariants: (mcq.optionVariants || mcq.options.map((opt: string) => ({
        text: opt,
        isCorrect: opt === mcq.correctAnswer
      }))).map((v: any) => ({
        ...v,
        isCorrect: v.isCorrect !== undefined ? v.isCorrect : v.text === mcq.correctAnswer
      }))
    }));

  } catch (error: any) {
    console.error(`💥 Error in batch ${batchIndex + 1} (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, error.message);
    
    // Retry logic with increased delay for fetch/overload failures
    if (retryCount < MAX_RETRIES) {
      let delay = 2000;
      
      if (error.message.includes('Connection error')) {
        delay = 5000 * Math.pow(1.5, retryCount);
      } else if (error.message.includes('Overloaded error')) {
        // Update global lockout to coordinate other concurrent tasks
        const nextLockout = Date.now() + 60000;
        if (nextLockout > globalOverloadUntil) {
          globalOverloadUntil = nextLockout;
          console.warn(`🛑 Setting global Gemini lockout for 60s due to 503/429 error.`);
        }

        // Aggressive exponential backoff for overloads: 45s, 90s, 180s...
        // Added 0-15s jitter to prevent "thundering herd" effect
        const jitter = Math.random() * 15000;
        delay = (45000 * Math.pow(2, retryCount)) + jitter;
        delay = Math.min(delay, 300000); // Max 5 minutes wait
      } else {
        delay = Math.min(2000 * Math.pow(2, retryCount), 15000);
      }
      
      console.log(`🔄 Retrying batch ${batchIndex + 1} in ${Math.round(delay/1000)}s... (Attempt ${retryCount + 2}/${MAX_RETRIES + 1})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return generateSingleBatch(request, batchCount, batchIndex, totalBatches, retryCount + 1);
    }
    
    // After all retries failed, return empty array instead of throwing
    console.error(`❌ Batch ${batchIndex + 1} failed after ${MAX_RETRIES + 1} attempts. Returning empty array.`);
    return [];
  }
}

export async function generateMCQsFromSOP(
  request: MCQGenerationRequest
): Promise<MCQGenerationResponse> {
  const currentCount = request.existingQuestions?.length || 0;
  
  let TOTAL_TARGET;
  if (request.targetCount) {
    TOTAL_TARGET = request.targetCount;
  } else if (request.isBulk) {
    // Bulk Process always targets 100 total
    TOTAL_TARGET = 100;
  } else {
    // Regenerate/Generate More adds 50 to whatever is there
    TOTAL_TARGET = currentCount + 50;
  }

  const BATCH_SIZE = 20; // Increased to 20 for faster generation - Flash model can handle this
  const NEEDED = Math.max(0, TOTAL_TARGET - currentCount);
  const NUM_BATCHES = Math.ceil(NEEDED / BATCH_SIZE);
  // Process batches serially (1 at a time) to ensure the next batch knows what the previous one generated
  // This is critical for uniqueness and hitting the target count accurately
  const PARALLEL_BATCHES = 1; 

  console.log(`🚀 Starting ${request.isBulk ? 'BULK' : 'REGEN'} generation for: ${request.sopName}`);
  console.log(`📊 Current: ${currentCount} | Target: ${TOTAL_TARGET} | Needed: ${NEEDED} (${NUM_BATCHES} batches, ${PARALLEL_BATCHES} parallel)`);
  
  let allMCQs: GeneratedMCQ[] = [];
  let currentExisting = [...(request.existingQuestions || [])];
  let failedBatchesCount = 0;
  let successBatchesCount = 0;
  // Allow more attempts, especially for smaller targets to ensure we hit progress
  const MAX_BATCH_ATTEMPTS = Math.max(10, NUM_BATCHES * 4); 

  // Process batches in parallel for faster generation
  while (allMCQs.length < NEEDED && (failedBatchesCount + successBatchesCount) < MAX_BATCH_ATTEMPTS) {
    const remainingNeeded = NEEDED - allMCQs.length;
    
    // Determine how many parallel batches to launch
    const batchesToLaunch = Math.min(
      PARALLEL_BATCHES,
      Math.ceil(remainingNeeded / BATCH_SIZE)
    );
    
    console.log(`📡 Launching ${batchesToLaunch} parallel batches (Progress: ${allMCQs.length}/${NEEDED})...`);
    
    // Create parallel batch promises
    const batchPromises = [];
    for (let i = 0; i < batchesToLaunch; i++) {
      const currentBatchIndex = failedBatchesCount + successBatchesCount + i;
      const batchSize = Math.min(BATCH_SIZE, remainingNeeded - (i * BATCH_SIZE));
      
      if (batchSize > 0) {
        batchPromises.push(
          generateSingleBatch(
            { ...request, existingQuestions: currentExisting },
            batchSize,
            currentBatchIndex,
            NUM_BATCHES
          ).then(batch => ({ batch, batchIndex: currentBatchIndex }))
        );
      }
    }
    
    // Wait for all parallel batches to complete
    const results = await Promise.allSettled(batchPromises);
    
    // Process results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const { batch, batchIndex } = result.value;
        
        if (batch.length === 0) {
          console.warn(`⚠️ Batch ${batchIndex + 1} returned 0 MCQs.`);
          failedBatchesCount++;
        } else {
          // Internal duplicate filtering against current progress
          const uniqueBatch = batch.filter(mcq => {
            const qClean = mcq.question.replace(/^⭐\s*/, '').trim().toLowerCase();
            return !currentExisting.some(ex => ex.replace(/^⭐\s*/, '').trim().toLowerCase() === qClean);
          });

          if (uniqueBatch.length === 0) {
            console.warn(`⚠️ Batch ${batchIndex + 1} produced ${batch.length} MCQs, but all were duplicates. Retrying with different focus...`);
            failedBatchesCount++;
          } else {
            successBatchesCount++;
            allMCQs = [...allMCQs, ...uniqueBatch];
            currentExisting = [...currentExisting, ...uniqueBatch.map(m => m.question)];
            
            console.log(`✅ Batch ${batchIndex + 1} completed (${uniqueBatch.length} new, unique MCQs). Progress: ${allMCQs.length}/${NEEDED}`);
            
            // Call the incremental save callback if provided with ONLY unique MCQs
            if (request.onBatchComplete) {
              try {
                console.log(`💾 Saving ${uniqueBatch.length} unique MCQs from batch ${batchIndex + 1} to database...`);
                await request.onBatchComplete(uniqueBatch);
                console.log(`✅ Unique batch saved successfully`);
              } catch (saveError) {
                console.error(`⚠️ Database save error for batch ${batchIndex + 1}:`, saveError);
              }
            }
          }
        }
      } else {
        console.error(`❌ Batch promise rejected:`, result.reason);
        failedBatchesCount++;
      }
    }
    
    // Add a shorter delay between parallel batch waves
    if (allMCQs.length < NEEDED) {
      console.log(`⏳ Waiting 1 second before next wave...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Log summary
  if (allMCQs.length < NEEDED) {
    console.warn(`⚠️ Target not fully met. Generated ${allMCQs.length}/${NEEDED} MCQs. Best effort was made after ${successBatchesCount + failedBatchesCount} attempts.`);
  } else {
    console.log(`🎉 Success! Target reached: ${allMCQs.length} MCQs generated after ${successBatchesCount + failedBatchesCount} attempts.`);
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
    aiModel: 'gemini-3-flash-preview',
  };
}
