import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';
import SimilarQuestion from '@/models/SimilarQuestion';

/**
 * Calculate similarity between two strings using Levenshtein distance
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 100;
  
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 100;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return Math.round(((longer.length - editDistance) / longer.length) * 100);
}

/**
 * Normalize text for better comparison
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Extract key concepts (multi-word phrases)
 */
function extractConcepts(text: string): Set<string> {
  const normalized = normalizeText(text);
  const words = normalized.split(/\s+/);
  const concepts = new Set<string>();
  
  // Add individual important words (> 3 chars, lowered from 4)
  words.forEach(word => {
    if (word.length > 3) {
      concepts.add(word);
    }
  });
  
  // Add bigrams (2-word phrases)
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]} ${words[i + 1]}`;
    if (bigram.length > 6) { // Lowered from 8 to 6
      concepts.add(bigram);
    }
  }
  
  // Add trigrams (3-word phrases) for key concepts
  for (let i = 0; i < words.length - 2; i++) {
    const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    if (trigram.length > 10) { // Lowered from 12 to 10
      concepts.add(trigram);
    }
  }
  
  return concepts;
}

/**
 * Check if two words are synonyms or variations
 */
function areSynonyms(word1: string, word2: string): boolean {
  const synonymGroups = [
    // Action verbs
    ['enter', 'entry', 'access', 'entering', 'accessing'],
    ['conduct', 'conducting', 'perform', 'performed', 'performing', 'carry', 'execute'],
    ['authorize', 'authorized', 'allow', 'allowed', 'permit', 'permitted', 'approve', 'approved'],
    
    // People/Personnel
    ['personnel', 'person', 'people', 'staff', 'employee', 'worker', 'individual'],
    
    // Frequency/Time
    ['frequency', 'frequently', 'often', 'regular', 'regularly', 'periodic', 'periodically'],
    ['minimum', 'least', 'minimal'],
    ['maximum', 'most', 'maximal'],
    
    // Question words
    ['what', 'which', 'who'],
    ['how', 'what'],
    
    // Modifiers
    ['specific', 'specifically', 'particular', 'particularly'],
    ['according', 'per', 'as per', 'based'],
    
    // Document references
    ['section', 'clause', 'point', 'paragraph'],
    
    // Actions
    ['must', 'should', 'required', 'need', 'necessary'],
    ['store', 'storage', 'storing', 'kept', 'keep', 'maintain'],
    ['withdraw', 'withdrawn', 'take', 'taken', 'remove', 'removed'],
  ];
  
  // Normalize words
  const w1 = word1.toLowerCase();
  const w2 = word2.toLowerCase();
  
  // Check exact match first
  if (w1 === w2) return true;
  
  // Check synonym groups
  for (const group of synonymGroups) {
    if (group.includes(w1) && group.includes(w2)) {
      return true;
    }
  }
  
  // Check if words share a common stem (simple stemming)
  if (haveSimilarStem(w1, w2)) {
    return true;
  }
  
  return false;
}

/**
 * Check if two words have similar stems
 */
function haveSimilarStem(word1: string, word2: string): boolean {
  // Remove common suffixes
  const suffixes = ['ing', 'ed', 'ly', 'tion', 'sion', 'ment', 'ness', 'ity', 'er', 'or', 's'];
  
  let stem1 = word1;
  let stem2 = word2;
  
  for (const suffix of suffixes) {
    if (stem1.endsWith(suffix) && stem1.length > suffix.length + 2) {
      stem1 = stem1.slice(0, -suffix.length);
    }
    if (stem2.endsWith(suffix) && stem2.length > suffix.length + 2) {
      stem2 = stem2.slice(0, -suffix.length);
    }
  }
  
  // Check if stems are similar (at least 80% match)
  if (stem1.length < 3 || stem2.length < 3) return false;
  
  const minLength = Math.min(stem1.length, stem2.length);
  let matches = 0;
  
  for (let i = 0; i < minLength; i++) {
    if (stem1[i] === stem2[i]) matches++;
  }
  
  return (matches / minLength) >= 0.8;
}

/**
 * Calculate enhanced keyword-based similarity with synonyms
 */
function calculateKeywordSimilarity(str1: string, str2: string): number {
  const words1 = normalizeText(str1).split(/\s+/).filter(w => w.length > 2); // Lowered from 3 to 2
  const words2 = normalizeText(str2).split(/\s+/).filter(w => w.length > 2);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  // Direct matches
  const directMatches = new Set([...set1].filter(x => set2.has(x)));
  
  // Synonym matches
  let synonymMatches = 0;
  const matchedWords = new Set<string>();
  
  for (const word1 of set1) {
    if (directMatches.has(word1)) continue; // Skip already matched
    
    for (const word2 of set2) {
      if (matchedWords.has(word2)) continue; // Skip already matched
      
      if (areSynonyms(word1, word2)) {
        synonymMatches++;
        matchedWords.add(word2);
        break;
      }
    }
  }
  
  const totalMatches = directMatches.size + synonymMatches;
  const union = new Set([...set1, ...set2]);
  
  // Jaccard similarity with synonym boost
  return Math.round((totalMatches / union.size) * 100);
}

/**
 * Calculate concept-based similarity (n-grams)
 */
function calculateConceptSimilarity(str1: string, str2: string): number {
  const concepts1 = extractConcepts(str1);
  const concepts2 = extractConcepts(str2);
  
  if (concepts1.size === 0 || concepts2.size === 0) return 0;
  
  // Find matching concepts (exact matches)
  const exactMatches = new Set([...concepts1].filter(x => concepts2.has(x)));
  
  // Find fuzzy matches (concepts that are similar but not exact)
  const fuzzyMatches = new Set<string>();
  for (const concept1 of concepts1) {
    if (exactMatches.has(concept1)) continue;
    
    for (const concept2 of concepts2) {
      if (exactMatches.has(concept2) || fuzzyMatches.has(concept2)) continue;
      
      // Check if concepts are similar (share words or synonyms)
      const words1 = concept1.split(' ');
      const words2 = concept2.split(' ');
      
      let matchCount = 0;
      for (const w1 of words1) {
        for (const w2 of words2) {
          if (w1 === w2 || areSynonyms(w1, w2)) {
            matchCount++;
            break;
          }
        }
      }
      
      // If at least 50% of words match, consider it a fuzzy match
      const minLength = Math.min(words1.length, words2.length);
      if (matchCount >= minLength * 0.5) {
        fuzzyMatches.add(concept2);
        break;
      }
    }
  }
  
  // Weight longer concepts more heavily
  let weightedMatches = 0;
  let totalWeight = 0;
  
  // Exact matches get full weight
  for (const concept of exactMatches) {
    const weight = Math.min(concept.split(' ').length, 3);
    weightedMatches += weight;
  }
  
  // Fuzzy matches get 70% weight
  for (const concept of fuzzyMatches) {
    const weight = Math.min(concept.split(' ').length, 3);
    weightedMatches += weight * 0.7;
  }
  
  for (const concept of new Set([...concepts1, ...concepts2])) {
    const weight = Math.min(concept.split(' ').length, 3);
    totalWeight += weight;
  }
  
  if (totalWeight === 0) return 0;
  
  return Math.round((weightedMatches / totalWeight) * 100);
}

/**
 * Calculate combined similarity score with multiple methods
 */
function calculateCombinedSimilarity(str1: string, str2: string): number {
  const levenshteinScore = calculateSimilarity(str1, str2);
  const keywordScore = calculateKeywordSimilarity(str1, str2);
  const conceptScore = calculateConceptSimilarity(str1, str2);
  
  // Weighted average:
  // - 10% Levenshtein (exact matching) - reduced from 20%
  // - 45% Keyword (word-level matching with synonyms) - increased from 40%
  // - 45% Concept (phrase-level matching) - increased from 40%
  const combined = Math.round(
    (levenshteinScore * 0.1) + 
    (keywordScore * 0.45) + 
    (conceptScore * 0.45)
  );
  
  return combined;
}

/**
 * Levenshtein distance algorithm
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Find matching text portions between two questions
 */
function findMatchingText(str1: string, str2: string): string {
  const concepts1 = extractConcepts(str1);
  const concepts2 = extractConcepts(str2);
  
  const matches = [...concepts1].filter(x => concepts2.has(x));
  
  // Sort by length (longer matches first) and take top 5
  return matches
    .sort((a, b) => b.length - a.length)
    .slice(0, 5)
    .join(', ');
}

/**
 * POST /api/similar-questions/detect
 * Detect similar questions within an MCQ bank or across all banks
 */
export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    
    const body = await request.json();
    const {
      mcqBankId,
      sopId,
      threshold = 30, // Lowered to 30 for better detection
      scanAllBanks = false, // If true, scan across all banks for the SOP
      targetQuestionIndex, // If provided, only detect for this specific question
    } = body;
    
    if (!mcqBankId && !sopId) {
      return NextResponse.json({
        success: false,
        error: 'Either mcqBankId or sopId is required',
      }, { status: 400 });
    }
    
    // Fetch the MCQ bank(s)
    let mcqBanks: any[] = [];
    
    if (mcqBankId) {
      const bank = await MCQBank.findById(mcqBankId).lean();
      if (!bank) {
        return NextResponse.json({
          success: false,
          error: 'MCQ Bank not found',
        }, { status: 404 });
      }
      mcqBanks = [bank];
    } else if (sopId) {
      if (scanAllBanks) {
        mcqBanks = await MCQBank.find({ sopId }).lean();
      } else {
        const bank = await MCQBank.findOne({ sopId }).lean();
        if (bank) mcqBanks = [bank];
      }
    }
    
    if (mcqBanks.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No MCQ banks found',
      }, { status: 404 });
    }
    
    // Detect similarities
    const similarities: any[] = [];
    const processedPairs = new Set<string>();
    
    // Compare questions within and across banks
    for (let i = 0; i < mcqBanks.length; i++) {
      const bank1 = mcqBanks[i];
      
      // If targetQuestionIndex is specified, only process that question
      const startIdx = targetQuestionIndex !== undefined ? targetQuestionIndex : 0;
      const endIdx = targetQuestionIndex !== undefined ? targetQuestionIndex + 1 : bank1.mcqs.length;
      
      for (let q1Idx = startIdx; q1Idx < endIdx; q1Idx++) {
        const q1 = bank1.mcqs[q1Idx];
        const similarQuestions: any[] = [];
        
        // Compare with questions in the same bank
        for (let q2Idx = 0; q2Idx < bank1.mcqs.length; q2Idx++) {
          // Skip comparing with itself
          if (q1Idx === q2Idx) continue;
          
          const q2 = bank1.mcqs[q2Idx];
          const pairKey = `${bank1._id}-${q1Idx}-${bank1._id}-${q2Idx}`;
          
          if (processedPairs.has(pairKey)) continue;
          
          
          const similarity = calculateCombinedSimilarity(q1.question, q2.question);
          
          // Detailed logging for debugging
          if (q1Idx === 109 || q2Idx === 28) { // Q110 (index 109) or Q29 (index 28)
            const lev = calculateSimilarity(q1.question, q2.question);
            const kw = calculateKeywordSimilarity(q1.question, q2.question);
            const con = calculateConceptSimilarity(q1.question, q2.question);
            console.log(`\n=== DETAILED COMPARISON Q${q1Idx + 1} vs Q${q2Idx + 1} ===`);
            console.log(`Q${q1Idx + 1}: "${q1.question.substring(0, 80)}..."`);
            console.log(`Q${q2Idx + 1}: "${q2.question.substring(0, 80)}..."`);
            console.log(`Levenshtein: ${lev}%`);
            console.log(`Keywords: ${kw}%`);
            console.log(`Concepts: ${con}%`);
            console.log(`Combined: ${similarity}%`);
            console.log(`Threshold: ${threshold}`);
            console.log(`Match: ${similarity >= threshold ? 'YES ✅' : 'NO ❌'}`);
            console.log(`===================================\n`);
          } else {
            console.log(`Comparing Q${q1Idx + 1} with Q${q2Idx + 1}: ${similarity}% similarity`);
          }
          
          if (similarity >= threshold) {
            similarQuestions.push({
              mcqBankId: bank1._id,
              questionIndex: q2Idx,
              question: q2,
              similarityScore: similarity,
              matchingText: findMatchingText(q1.question, q2.question),
            });
            
            processedPairs.add(pairKey);
          }
        }
        
        // Compare with questions in other banks (if scanning all)
        if (scanAllBanks) {
          for (let j = i + 1; j < mcqBanks.length; j++) {
            const bank2 = mcqBanks[j];
            
            for (let q2Idx = 0; q2Idx < bank2.mcqs.length; q2Idx++) {
              const q2 = bank2.mcqs[q2Idx];
              const pairKey = `${bank1._id}-${q1Idx}-${bank2._id}-${q2Idx}`;
              
              if (processedPairs.has(pairKey)) continue;
              
              
              const similarity = calculateCombinedSimilarity(q1.question, q2.question);
              
              if (similarity >= threshold) {
                similarQuestions.push({
                  mcqBankId: bank2._id,
                  questionIndex: q2Idx,
                  question: q2,
                  similarityScore: similarity,
                  matchingText: findMatchingText(q1.question, q2.question),
                });
                
                processedPairs.add(pairKey);
              }
            }
          }
        }
        
        // If similarities found, create a record
        if (similarQuestions.length > 0) {
          console.log(`\n🔍 Found ${similarQuestions.length} similar questions for Q${q1Idx + 1}`);
          similarQuestions.forEach((sq, idx) => {
            console.log(`  ${idx + 1}. Q${sq.questionIndex + 1} (${sq.similarityScore}% similar)`);
          });
          
          // Check if already flagged
          const existing = await SimilarQuestion.findOne({
            'primaryQuestion.mcqBankId': bank1._id,
            'primaryQuestion.questionIndex': q1Idx,
          });
          
          if (!existing) {
            console.log(`✅ Creating new similarity record for Q${q1Idx + 1}`);
            similarities.push({
              sopId: bank1.sopId,
              sopName: bank1.sopName,
              sopIdentifier: bank1.sopIdentifier,
              department: bank1.department,
              primaryQuestion: {
                mcqBankId: bank1._id,
                questionIndex: q1Idx,
                question: q1,
              },
              similarQuestions,
            });
          } else {
            console.log(`🔄 Updating existing similarity record for Q${q1Idx + 1} with new matches`);
            // Update the existing record with new similarity data
            similarities.push({
              _id: existing._id, // Include the ID to update instead of create
              sopId: bank1.sopId,
              sopName: bank1.sopName,
              sopIdentifier: bank1.sopIdentifier,
              department: bank1.department,
              primaryQuestion: {
                mcqBankId: bank1._id,
                questionIndex: q1Idx,
                question: q1,
              },
              similarQuestions,
              isUpdate: true, // Flag to indicate this is an update
            });
          }
        }
      }
    }
    
    // Auto-flag detected similarities
    console.log(`\n📊 Total similarities to flag: ${similarities.length}`);
    let flaggedCount = 0;
    for (const similarity of similarities) {
      try {
        console.log(`\n💾 ${similarity.isUpdate ? 'Updating' : 'Saving'} similarity record for Q${similarity.primaryQuestion.questionIndex + 1}...`);
        
        let saved;
        if (similarity.isUpdate) {
          // Update existing record
          const { _id, isUpdate, ...updateData } = similarity;
          saved = await SimilarQuestion.findByIdAndUpdate(
            _id,
            {
              ...updateData,
              flaggedBy: 'Auto-Detection',
              reviewStatus: 'pending',
            },
            { new: true }
          );
          console.log(`✅ Updated record ID: ${saved?._id}`);
        } else {
          // Create new record
          saved = await SimilarQuestion.create({
            ...similarity,
            flaggedBy: 'Auto-Detection',
            reviewStatus: 'pending',
          });
          console.log(`✅ Saved with ID: ${saved._id}`);
        }
        
        // Update isSimilar flags
        console.log(`🏷️ Updating isSimilar flags...`);
        await MCQBank.updateOne(
          { _id: similarity.primaryQuestion.mcqBankId },
          { $set: { [`mcqs.${similarity.primaryQuestion.questionIndex}.isSimilar`]: true } }
        );
        
        for (const sq of similarity.similarQuestions) {
          await MCQBank.updateOne(
            { _id: sq.mcqBankId },
            { $set: { [`mcqs.${sq.questionIndex}.isSimilar`]: true } }
          );
        }
        
        flaggedCount++;
        console.log(`✅ Successfully ${similarity.isUpdate ? 'updated' : 'flagged'} similarity #${flaggedCount}`);
      } catch (error) {
        console.error(`❌ Error flagging similarity for Q${similarity.primaryQuestion.questionIndex + 1}:`, error);
      }
    }
    
    
    return NextResponse.json({
      success: true,
      message: `Detected ${similarities.length} similarity groups`,
      flaggedCount,
      similarities,
      threshold,
    });
  } catch (error: any) {
    console.error('Error detecting similarities:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to detect similarities',
    }, { status: 500 });
  }
}
