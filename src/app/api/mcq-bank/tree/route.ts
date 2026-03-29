import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import User from '@/models/User';
import { buildMCQTreeStructure, getTreeAsArray } from '@/lib/mcqTreeBuilder';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    let allowedDepartments: string[] = [];
    let isAdmin = false;

    // Look up the user's allowed departments from DB using the username from localStorage
    if (username) {
      const user: any = await User.findOne({ username: username.toLowerCase() })
        .select('allowedDepartments role')
        .lean();

      if (user) {
        isAdmin = user.role === 'admin' || user.role === 'qa-head';
        allowedDepartments = user.allowedDepartments || [];
        console.log(`🔐 User "${username}" (${user.role}) — allowed departments:`, allowedDepartments);
      } else {
        console.log(`⚠️ Username "${username}" not found in DB — showing all departments`);
      }
    } else {
      console.log('📂 No username provided — showing all departments');
    }

    // Fetch all SOPs
    const sops = await SOP.find({})
      .select('_id name identifier department fileUrl fileType')
      .lean();

    // Fetch all MCQ Banks with status fields
    const mcqBanks = await MCQBank.find({})
      .select('_id sopId sopName sopIdentifier department totalQuestions mcqs.isChecked mcqs.isReviewed mcqs.isSimilar')
      .lean();

    console.log(`📊 Building tree from ${sops.length} SOPs and ${mcqBanks.length} MCQ banks`);

    // Build the tree structure
    const tree = buildMCQTreeStructure(sops as any, mcqBanks as any);
    let treeArray = getTreeAsArray(tree);

    // Count SOPs actually shown (those with MCQs)
    const sopsWithMcqs = treeArray.reduce(
      (sum, dept) => sum + dept.subcategories.reduce(
        (s: number, sub: any) => s + sub.sops.length, 0
      ), 0
    ) + tree.unorganized.totalSOPs;
    console.log(`🔎 Filtered to ${sopsWithMcqs} SOPs with MCQs (excluded ${sops.length - sopsWithMcqs} SOPs without MCQs)`);

    // Apply department filter — skip for admin/qa-head (they see everything)
    const isRestricted = !isAdmin && allowedDepartments.length > 0 && allowedDepartments.length < 7;
    if (isRestricted) {
      treeArray = treeArray.filter(dept =>
        allowedDepartments.includes(dept.name)
      );
      console.log(`🔒 Filtered tree to ${treeArray.length} department(s) for user "${username}"`);
    }

    return NextResponse.json({
      success: true,
      tree: treeArray,
      unorganized: tree.unorganized,
      stats: {
        totalDepartments: treeArray.length,
        totalSOPs: sopsWithMcqs,          // Only SOPs that actually have MCQs
        totalMCQBanks: mcqBanks.length,
        totalQuestions: mcqBanks.reduce((sum, bank) => {
          const mcqsArr = (bank as any).mcqs;
          return sum + (Array.isArray(mcqsArr) ? mcqsArr.length : (bank.totalQuestions || 0));
        }, 0),
      },
      userAccess: {
        allowedDepartments,
        isRestricted,
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
