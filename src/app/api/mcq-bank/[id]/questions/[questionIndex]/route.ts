import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';

/**
 * DELETE /api/mcq-bank/[id]/questions/[questionIndex]
 * Delete a specific question from an MCQ bank
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; questionIndex: string }> }
) {
  try {
    await connectDB();

    // Await params in Next.js 15+
    const { id, questionIndex } = await params;
    const index = parseInt(questionIndex);

    if (isNaN(index)) {
      console.error(`❌ Invalid question index: ${questionIndex} (NaN)`);
      return NextResponse.json(
        { success: false, error: 'Invalid question index' },
        { status: 400 }
      );
    }

    console.log(`\n🔍 DELETE Request for MCQ Bank ${id}, Question Index: ${index}`);

    // Find the MCQ bank
    const bank = await MCQBank.findById(id);

    if (!bank) {
      console.error(`❌ MCQ bank not found: ${id}`);
      return NextResponse.json(
        { success: false, error: 'MCQ bank not found' },
        { status: 404 }
      );
    }

    console.log(`📊 MCQ Bank found: ${bank.sopName}`);
    console.log(`📊 Total questions in bank: ${bank.mcqs.length}`);
    console.log(`📊 Requested index: ${index} (Q${index + 1})`);
    console.log(`📊 Valid range: 0 to ${bank.mcqs.length - 1}`);

    // Check if question index is valid
    if (index < 0 || index >= bank.mcqs.length) {
      console.error(`❌ Question index ${index} out of range (0-${bank.mcqs.length - 1})`);
      return NextResponse.json(
        { success: false, error: `Question index out of range. Bank has ${bank.mcqs.length} questions (indices 0-${bank.mcqs.length - 1}), but received index ${index}` },
        { status: 400 }
      );
    }

    // Remove the question
    bank.mcqs.splice(index, 1);

    // Save the updated bank
    await bank.save();

    console.log(`✅ Deleted question #${index + 1} from MCQ Bank ${id}`);

    return NextResponse.json({
      success: true,
      message: `Question #${index + 1} deleted successfully`,
      remainingQuestions: bank.mcqs.length,
    });
  } catch (error) {
    console.error('Error deleting question:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete question' },
      { status: 500 }
    );
  }
}
