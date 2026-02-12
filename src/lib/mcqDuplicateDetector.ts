import { IMCQ } from '@/models/MCQBank';

/**
 * Normalize question text for comparison
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/^⭐\s*/, '') // Remove star prefix
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity percentage between two strings
 */
function calculateSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  
  if (maxLength === 0) return 100;
  
  const similarity = ((maxLength - distance) / maxLength) * 100;
  return Math.round(similarity * 100) / 100; // Round to 2 decimal places
}

/**
 * Find exact duplicate questions
 * Returns map of normalized question text to array of indices
 */
export function findExactDuplicates(mcqs: IMCQ[]): Map<string, number[]> {
  const duplicates = new Map<string, number[]>();
  
  mcqs.forEach((mcq, index) => {
    const normalized = normalizeText(mcq.question);
    
    if (!duplicates.has(normalized)) {
      duplicates.set(normalized, []);
    }
    
    duplicates.get(normalized)!.push(index);
  });
  
  // Filter to only keep entries with duplicates
  const result = new Map<string, number[]>();
  duplicates.forEach((indices, text) => {
    if (indices.length > 1) {
      result.set(text, indices);
    }
  });
  
  return result;
}

/**
 * Find semantically similar questions using Levenshtein distance
 */
export function findSimilarQuestions(
  mcqs: IMCQ[], 
  threshold: number = 80
): Array<{
  index1: number;
  index2: number;
  similarity: number;
  question1: string;
  question2: string;
}> {
  const similar: Array<{
    index1: number;
    index2: number;
    similarity: number;
    question1: string;
    question2: string;
  }> = [];
  
  for (let i = 0; i < mcqs.length; i++) {
    for (let j = i + 1; j < mcqs.length; j++) {
      const text1 = normalizeText(mcqs[i].question);
      const text2 = normalizeText(mcqs[j].question);
      
      const similarity = calculateSimilarity(text1, text2);
      
      if (similarity >= threshold) {
        similar.push({
          index1: i,
          index2: j,
          similarity,
          question1: mcqs[i].question,
          question2: mcqs[j].question,
        });
      }
    }
  }
  
  return similar.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Detect all problematic questions
 * IMPORTANT: Only exact duplicates are marked for automatic removal
 * Similar questions are returned for manual review only
 */
export function detectProblematicQuestions(
  mcqs: IMCQ[],
  similarityThreshold: number = 80
): {
  exactDuplicates: Array<{ indices: number[]; questionText: string }>;
  similarQuestions: Array<{
    index1: number;
    index2: number;
    similarity: number;
    question1: string;
    question2: string;
  }>;
  indicesToRemove: Set<number>;
} {
  // Find exact duplicates
  const exactDuplicatesMap = findExactDuplicates(mcqs);
  const exactDuplicates = Array.from(exactDuplicatesMap.entries()).map(
    ([text, indices]) => ({
      questionText: text,
      indices,
    })
  );
  
  // Find similar questions (for manual review only - NOT for automatic removal)
  const similarQuestions = findSimilarQuestions(mcqs, similarityThreshold);
  
  // Determine which indices to remove
  const indicesToRemove = new Set<number>();
  
  // ONLY remove exact duplicates - keep the first occurrence, remove the rest
  exactDuplicates.forEach(({ indices }) => {
    indices.slice(1).forEach(index => indicesToRemove.add(index));
  });
  
  // DO NOT automatically remove similar questions
  // They should be reviewed manually as they may be conceptually different
  
  return {
    exactDuplicates,
    similarQuestions, // Return for reporting only
    indicesToRemove, // Only contains exact duplicate indices
  };
}
