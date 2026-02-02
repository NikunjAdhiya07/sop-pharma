import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import { buildMCQTreeStructure, getTreeAsArray } from '@/lib/mcqTreeBuilder';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Fetch all SOPs
    const sops = await SOP.find({})
      .select('_id name identifier department fileUrl fileType')
      .lean();

    // Fetch all MCQ Banks
    const mcqBanks = await MCQBank.find({})
      .select('_id sopId sopName sopIdentifier department totalQuestions mcqs')
      .lean();

    console.log(`📊 Building tree from ${sops.length} SOPs and ${mcqBanks.length} MCQ banks`);

    // Build the tree structure
    const tree = buildMCQTreeStructure(sops as any, mcqBanks as any);
    const treeArray = getTreeAsArray(tree);

    return NextResponse.json({
      success: true,
      tree: treeArray,
      unorganized: tree.unorganized,
      stats: {
        totalDepartments: tree.departments.size,
        totalSOPs: sops.length,
        totalMCQBanks: mcqBanks.length,
        totalQuestions: mcqBanks.reduce((sum, bank) => sum + bank.totalQuestions, 0),
      },
    });

  } catch (error) {
    console.error('Error building MCQ tree:', error);
    return NextResponse.json(
      { 
        error: 'Failed to build MCQ tree',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
