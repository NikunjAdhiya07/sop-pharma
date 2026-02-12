/**
 * Utility script to detect and flag similar questions in MCQ banks
 * 
 * Usage:
 * 1. Run similarity detection on a specific MCQ bank:
 *    POST /api/similar-questions/detect
 *    Body: { "mcqBankId": "...", "threshold": 75 }
 * 
 * 2. Run similarity detection across all banks for a SOP:
 *    POST /api/similar-questions/detect
 *    Body: { "sopId": "...", "scanAllBanks": true, "threshold": 75 }
 * 
 * 3. Run similarity detection on all MCQ banks (use with caution):
 *    This should be done via a background job or during off-peak hours
 */

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
  const words1 = str1.toLowerCase().split(/\s+/);
  const words2 = str2.toLowerCase().split(/\s+/);
  
  const matches: string[] = [];
  
  for (const word1 of words1) {
    if (word1.length > 4 && words2.includes(word1)) {
      matches.push(word1);
    }
  }
  
  return matches.slice(0, 5).join(', ');
}

/**
 * Detect similarities in a single MCQ bank
 */
export async function detectSimilaritiesInBank(
  mcqBankId: string,
  threshold: number = 75
): Promise<{
  success: boolean;
  similaritiesFound: number;
  details: any[];
}> {
  try {
    await dbConnect();
    
    const bank = await MCQBank.findById(mcqBankId).lean();
    if (!bank) {
      return { success: false, similaritiesFound: 0, details: [] };
    }
    
    const similarities: any[] = [];
    
    for (let i = 0; i < bank.mcqs.length; i++) {
      const q1 = bank.mcqs[i];
      const similarQuestions: any[] = [];
      
      for (let j = i + 1; j < bank.mcqs.length; j++) {
        const q2 = bank.mcqs[j];
        const similarity = calculateSimilarity(q1.question, q2.question);
        
        if (similarity >= threshold) {
          similarQuestions.push({
            mcqBankId: bank._id,
            questionIndex: j,
            question: q2,
            similarityScore: similarity,
            matchingText: findMatchingText(q1.question, q2.question),
          });
        }
      }
      
      if (similarQuestions.length > 0) {
        // Check if already flagged
        const existing = await SimilarQuestion.findOne({
          'primaryQuestion.mcqBankId': bank._id,
          'primaryQuestion.questionIndex': i,
        });
        
        if (!existing) {
          similarities.push({
            sopId: bank.sopId,
            sopName: bank.sopName,
            sopIdentifier: bank.sopIdentifier,
            department: bank.department,
            primaryQuestion: {
              mcqBankId: bank._id,
              questionIndex: i,
              question: q1,
            },
            similarQuestions,
          });
        }
      }
    }
    
    // Create similarity records
    for (const similarity of similarities) {
      await SimilarQuestion.create({
        ...similarity,
        flaggedBy: 'Auto-Detection',
        reviewStatus: 'pending',
      });
      
      // Update isSimilar flags
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
    }
    
    return {
      success: true,
      similaritiesFound: similarities.length,
      details: similarities,
    };
  } catch (error) {
    console.error('Error detecting similarities:', error);
    return { success: false, similaritiesFound: 0, details: [] };
  }
}

/**
 * Detect similarities across all MCQ banks for a SOP
 */
export async function detectSimilaritiesForSOP(
  sopId: string,
  threshold: number = 75
): Promise<{
  success: boolean;
  similaritiesFound: number;
  banksScanned: number;
}> {
  try {
    await dbConnect();
    
    const banks = await MCQBank.find({ sopId }).lean();
    let totalSimilarities = 0;
    
    for (const bank of banks) {
      const result = await detectSimilaritiesInBank(bank._id.toString(), threshold);
      if (result.success) {
        totalSimilarities += result.similaritiesFound;
      }
    }
    
    return {
      success: true,
      similaritiesFound: totalSimilarities,
      banksScanned: banks.length,
    };
  } catch (error) {
    console.error('Error detecting similarities for SOP:', error);
    return { success: false, similaritiesFound: 0, banksScanned: 0 };
  }
}

/**
 * Detect similarities across all MCQ banks (use with caution)
 */
export async function detectSimilaritiesGlobal(
  threshold: number = 75,
  batchSize: number = 10
): Promise<{
  success: boolean;
  totalSimilarities: number;
  totalBanks: number;
  errors: string[];
}> {
  try {
    await dbConnect();
    
    const totalBanks = await MCQBank.countDocuments();
    let processed = 0;
    let totalSimilarities = 0;
    const errors: string[] = [];
    
    console.log(`Starting global similarity detection for ${totalBanks} banks...`);
    
    while (processed < totalBanks) {
      const banks = await MCQBank.find()
        .skip(processed)
        .limit(batchSize)
        .lean();
      
      for (const bank of banks) {
        try {
          const result = await detectSimilaritiesInBank(bank._id.toString(), threshold);
          if (result.success) {
            totalSimilarities += result.similaritiesFound;
            console.log(`Bank ${bank.sopIdentifier}: ${result.similaritiesFound} similarities found`);
          }
        } catch (error: any) {
          errors.push(`Error in bank ${bank._id}: ${error.message}`);
        }
      }
      
      processed += banks.length;
      console.log(`Progress: ${processed}/${totalBanks} banks processed`);
    }
    
    return {
      success: true,
      totalSimilarities,
      totalBanks: processed,
      errors,
    };
  } catch (error: any) {
    console.error('Error in global similarity detection:', error);
    return {
      success: false,
      totalSimilarities: 0,
      totalBanks: 0,
      errors: [error.message],
    };
  }
}

/**
 * Clear all similarity flags from a bank
 */
export async function clearSimilarityFlags(mcqBankId: string): Promise<boolean> {
  try {
    await dbConnect();
    
    const bank = await MCQBank.findById(mcqBankId);
    if (!bank) return false;
    
    // Clear all isSimilar flags
    for (let i = 0; i < bank.mcqs.length; i++) {
      bank.mcqs[i].isSimilar = false;
    }
    
    await bank.save();
    
    // Delete similarity records
    await SimilarQuestion.deleteMany({
      $or: [
        { 'primaryQuestion.mcqBankId': mcqBankId },
        { 'similarQuestions.mcqBankId': mcqBankId },
      ],
    });
    
    return true;
  } catch (error) {
    console.error('Error clearing similarity flags:', error);
    return false;
  }
}

// Export utility functions
export const SimilarityUtils = {
  calculateSimilarity,
  levenshteinDistance,
  findMatchingText,
  detectSimilaritiesInBank,
  detectSimilaritiesForSOP,
  detectSimilaritiesGlobal,
  clearSimilarityFlags,
};
