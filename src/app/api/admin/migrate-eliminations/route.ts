import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import EliminatedQuestion from '@/models/EliminatedQuestion';

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    
    // Find all questions with reason 'manual'
    const manualEliminations = await EliminatedQuestion.find({ 
      eliminationReason: 'manual' 
    });
    
    console.log(`Found ${manualEliminations.length} questions with reason 'manual'`);
    
    if (manualEliminations.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No questions to migrate',
        updated: 0,
      });
    }
    
    // Update all to 'duplicate'
    let updated = 0;
    const errors = [];
    
    for (const q of manualEliminations) {
      try {
        await EliminatedQuestion.findByIdAndUpdate(q._id, {
          eliminationReason: 'duplicate',
          replacedWith: q.replacedWith || 'Migrated from manual to duplicate category',
          duplicateOf: q.duplicateOf || 'Similar question - deleted and regenerated (migrated)',
        });
        updated++;
        console.log(`✅ Updated: ${q.sopIdentifier} - Question #${q.originalQuestionIndex}`);
      } catch (error: any) {
        console.error(`❌ Failed to update ${q._id}:`, error);
        errors.push({ id: q._id, error: error.message });
      }
    }
    
    // Get new counts
    const duplicateCount = await EliminatedQuestion.countDocuments({ eliminationReason: 'duplicate' });
    const manualCount = await EliminatedQuestion.countDocuments({ eliminationReason: 'manual' });
    
    return NextResponse.json({
      success: true,
      message: `Migration complete! Updated ${updated} out of ${manualEliminations.length} questions.`,
      updated,
      total: manualEliminations.length,
      errors: errors.length > 0 ? errors : undefined,
      currentCounts: {
        duplicates: duplicateCount,
        manual: manualCount,
      },
    });

  } catch (error: any) {
    console.error('Migration error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Migration failed',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

// GET endpoint to preview what will be migrated
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    
    const manualEliminations = await EliminatedQuestion.find({ 
      eliminationReason: 'manual' 
    })
    .select('sopIdentifier question.question originalQuestionIndex eliminatedBy eliminatedAt')
    .limit(10)
    .lean();
    
    const totalManual = await EliminatedQuestion.countDocuments({ eliminationReason: 'manual' });
    const totalDuplicate = await EliminatedQuestion.countDocuments({ eliminationReason: 'duplicate' });
    
    return NextResponse.json({
      success: true,
      preview: manualEliminations.map((q: any) => ({
        sopIdentifier: q.sopIdentifier,
        question: q.question?.question?.substring(0, 80) + '...',
        questionIndex: q.originalQuestionIndex,
        eliminatedBy: q.eliminatedBy,
        eliminatedAt: q.eliminatedAt,
      })),
      counts: {
        currentManual: totalManual,
        currentDuplicate: totalDuplicate,
        willMigrate: totalManual,
      },
      message: `Ready to migrate ${totalManual} questions from 'manual' to 'duplicate'`,
    });

  } catch (error: any) {
    console.error('Preview error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Preview failed',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
