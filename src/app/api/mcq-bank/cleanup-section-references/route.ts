import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';

/**
 * Patterns to identify section reference questions
 */
const SECTION_REFERENCE_PATTERNS = [
  /in\s+section\s+\d+(\.\d+)*/i,           // "In section 4.4.2"
  /section\s+\d+(\.\d+)*\s+(states?|says?|mentions?|describes?)/i, // "Section 4.4.2 states"
  /what\s+(does|is)\s+section\s+\d+(\.\d+)*/i, // "What does section 4.4.2"
  /according\s+to\s+section\s+\d+(\.\d+)*/i,   // "According to section 4.4.2"
  /as\s+per\s+section\s+\d+(\.\d+)*/i,         // "As per section 4.4.2"
  /refer\s+to\s+section\s+\d+(\.\d+)*/i,       // "Refer to section 4.4.2"
  /in\s+\d+(\.\d+)+,?\s+what/i,                // "In 4.4.2, what"
  /clause\s+\d+(\.\d+)*\s+(states?|says?)/i,   // "Clause 4.4.2 states"
];

/**
 * Check if a question is a section reference question
 */
function isSectionReferenceQuestion(question: string): boolean {
  return SECTION_REFERENCE_PATTERNS.some(pattern => pattern.test(question));
}

/**
 * POST /api/mcq-bank/cleanup-section-references
 * 
 * Removes MCQs that ask questions based on section references
 * Optional: Pass sopId to clean up a specific SOP's MCQ bank
 */
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const { sopId } = body;

    // Build query
    const query = sopId ? { sopId } : {};

    // Fetch MCQ banks
    const mcqBanks = await MCQBank.find(query);

    if (mcqBanks.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No MCQ banks found',
        stats: {
          banksAnalyzed: 0,
          banksModified: 0,
          mcqsRemoved: 0,
        },
      });
    }

    let totalBanksModified = 0;
    let totalMCQsRemoved = 0;
    const detailedReport: Array<{
      sopName: string;
      sopIdentifier: string;
      removedCount: number;
      removedQuestions: string[];
    }> = [];

    // Process each bank
    for (const bank of mcqBanks) {
      const originalCount = bank.mcqs.length;
      const removedQuestions: string[] = [];

      // Filter out section reference questions
      const filteredMCQs = bank.mcqs.filter((mcq) => {
        const isSectionRef = isSectionReferenceQuestion(mcq.question);
        if (isSectionRef) {
          removedQuestions.push(mcq.question);
        }
        return !isSectionRef;
      });

      // If any MCQs were removed, update the bank
      if (filteredMCQs.length < originalCount) {
        const removedCount = originalCount - filteredMCQs.length;
        
        bank.mcqs = filteredMCQs;
        bank.totalQuestions = filteredMCQs.length;
        
        // Recalculate difficulty distribution
        bank.difficultyDistribution = {
          easy: filteredMCQs.filter(m => m.difficulty === 'Easy').length,
          medium: filteredMCQs.filter(m => m.difficulty === 'Medium').length,
          hard: filteredMCQs.filter(m => m.difficulty === 'Hard').length,
        };

        await bank.save();
        
        totalBanksModified++;
        totalMCQsRemoved += removedCount;
        
        detailedReport.push({
          sopName: bank.sopName,
          sopIdentifier: bank.sopIdentifier,
          removedCount,
          removedQuestions,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: totalMCQsRemoved > 0 
        ? `Successfully removed ${totalMCQsRemoved} section reference MCQs from ${totalBanksModified} bank(s)`
        : 'No section reference MCQs found',
      stats: {
        banksAnalyzed: mcqBanks.length,
        banksModified: totalBanksModified,
        mcqsRemoved: totalMCQsRemoved,
      },
      detailedReport,
    });

  } catch (error) {
    console.error('Error cleaning up section reference MCQs:', error);
    return NextResponse.json(
      { 
        error: 'Failed to clean up section reference MCQs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/mcq-bank/cleanup-section-references
 * 
 * Analyzes MCQ banks for section reference questions without removing them
 * Optional: Pass sopId query param to analyze a specific SOP's MCQ bank
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const sopId = searchParams.get('sopId');

    // Build query
    const query = sopId ? { sopId } : {};

    // Fetch MCQ banks
    const mcqBanks = await MCQBank.find(query);

    if (mcqBanks.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No MCQ banks found',
        stats: {
          banksAnalyzed: 0,
          totalMCQs: 0,
          sectionReferenceMCQs: 0,
        },
      });
    }

    let totalMCQs = 0;
    let totalSectionReferenceMCQs = 0;
    const analysis: Array<{
      sopName: string;
      sopIdentifier: string;
      totalQuestions: number;
      sectionReferenceCount: number;
      sectionReferenceQuestions: string[];
    }> = [];

    // Analyze each bank
    for (const bank of mcqBanks) {
      const sectionReferenceQuestions: string[] = [];

      bank.mcqs.forEach((mcq) => {
        totalMCQs++;
        if (isSectionReferenceQuestion(mcq.question)) {
          totalSectionReferenceMCQs++;
          sectionReferenceQuestions.push(mcq.question);
        }
      });

      if (sectionReferenceQuestions.length > 0) {
        analysis.push({
          sopName: bank.sopName,
          sopIdentifier: bank.sopIdentifier,
          totalQuestions: bank.mcqs.length,
          sectionReferenceCount: sectionReferenceQuestions.length,
          sectionReferenceQuestions,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: totalSectionReferenceMCQs > 0
        ? `Found ${totalSectionReferenceMCQs} section reference MCQs across ${analysis.length} bank(s)`
        : 'No section reference MCQs found',
      stats: {
        banksAnalyzed: mcqBanks.length,
        totalMCQs,
        sectionReferenceMCQs: totalSectionReferenceMCQs,
        percentageAffected: totalMCQs > 0 
          ? ((totalSectionReferenceMCQs / totalMCQs) * 100).toFixed(2) + '%'
          : '0%',
      },
      analysis,
    });

  } catch (error) {
    console.error('Error analyzing section reference MCQs:', error);
    return NextResponse.json(
      { 
        error: 'Failed to analyze section reference MCQs',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
