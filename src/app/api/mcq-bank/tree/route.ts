import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import User from '@/models/User';
import { buildMCQTreeStructure, getTreeAsArray } from '@/lib/mcqTreeBuilder';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Try to get session, but don't require it
    let session: any = null;
    let allowedDepartments: string[] = [];
    
    try {
      session = await getServerSession();
    } catch (error) {
      console.log('Session not available, proceeding without authentication');
    }

    // Get user's allowed departments if authenticated
    if (session?.user?.username) {
      const user: any = await User.findOne({ username: session.user.username })
        .select('allowedDepartments role')
        .lean();

      allowedDepartments = user?.allowedDepartments || [];
      console.log(`🔐 User ${session.user.username} (${user?.role}) accessing tree with departments:`, allowedDepartments);
    } else {
      console.log('📂 Unauthenticated access to MCQ tree - showing all departments');
    }


    // Fetch all SOPs
    const sops = await SOP.find({})
      .select('_id name identifier department fileUrl fileType')
      .lean();

    // Fetch all MCQ Banks with status fields
    const mcqBanks = await MCQBank.find({})
      .select('_id sopId sopName sopIdentifier department totalQuestions mcqs.isChecked mcqs.isReviewed')
      .lean();

    console.log(`📊 Building tree from ${sops.length} SOPs and ${mcqBanks.length} MCQ banks`);

    // Build the tree structure
    const tree = buildMCQTreeStructure(sops as any, mcqBanks as any);
    let treeArray = getTreeAsArray(tree);

    // Filter tree by allowed departments (unless admin/qa-head with all access)
    if (allowedDepartments.length > 0 && allowedDepartments.length < 7) {
      treeArray = treeArray.filter(dept => 
        allowedDepartments.includes(dept.name)
      );
      console.log(`🔒 Filtered to ${treeArray.length} departments for user`);
    }

    return NextResponse.json({
      success: true,
      tree: treeArray,
      unorganized: tree.unorganized,
      stats: {
        totalDepartments: treeArray.length,
        totalSOPs: sops.length,
        totalMCQBanks: mcqBanks.length,
        totalQuestions: mcqBanks.reduce((sum, bank) => sum + bank.totalQuestions, 0),
      },
      userAccess: {
        allowedDepartments,
        isRestricted: allowedDepartments.length > 0 && allowedDepartments.length < 7
      }
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
