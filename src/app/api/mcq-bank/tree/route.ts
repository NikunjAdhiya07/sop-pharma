import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import User from '@/models/User';
import { buildMCQTreeStructure, getTreeAsArray } from '@/lib/mcqTreeBuilder';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');

    let allowedDepartments: string[] = [];
    let isAdmin = false;

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

    const dbConnection = mongoose.connection.db;
    if (!dbConnection) throw new Error('Database connection lost');

    // Run SOP fetch and MCQ aggregation in parallel
    // Exclude obsolete SOPs so superseded versions never appear in the active tree
    const [sops, mcqBanks] = await Promise.all([
      SOP.find({ $or: [{ isObsolete: { $ne: true } }, { isObsolete: { $exists: false } }] })
        .select('_id name identifier department fileUrl fileType language')
        .lean(),

      // Aggregate counts server-side — sends ~50 bytes per bank instead of ~5KB of subdocuments
      dbConnection.collection('mcqbanks').aggregate([
        {
          // Exclude MCQ banks that belong to obsolete (superseded) SOP versions
          $match: { $or: [{ isObsolete: { $ne: true } }, { isObsolete: { $exists: false } }] },
        },
        {
          $project: {
            _id: 1,
            sopId: 1,
            sopName: 1,
            sopIdentifier: 1,
            department: 1,
            folderDepartment: 1,
            folderSubcategory: 1,
            language: 1,
            totalQuestions: { $size: { $ifNull: ['$mcqs', []] } },
            checkedCount: {
              $size: {
                $filter: { input: '$mcqs', as: 'q', cond: { $eq: ['$$q.isChecked', true] } }
              }
            },
            reviewedCount: {
              $size: {
                $filter: { input: '$mcqs', as: 'q', cond: { $eq: ['$$q.isReviewed', true] } }
              }
            },
            similarCount: {
              $size: {
                $filter: { input: '$mcqs', as: 'q', cond: { $eq: ['$$q.isSimilar', true] } }
              }
            },
          }
        }
      ]).toArray(),
    ]);

    console.log(`📊 Building tree from ${sops.length} SOPs and ${mcqBanks.length} MCQ banks (aggregated counts)`);

    const tree = buildMCQTreeStructure(sops as any, mcqBanks as any);
    let treeArray = getTreeAsArray(tree);

    const sopsWithMcqs = treeArray.reduce(
      (sum, dept) => sum + dept.subcategories.reduce(
        (s: number, sub: any) => s + sub.sops.length, 0
      ), 0
    ) + tree.unorganized.totalSOPs;

    const isRestricted = !isAdmin && allowedDepartments.length > 0 && allowedDepartments.length < 7;
    if (isRestricted) {
      treeArray = treeArray.filter(dept => allowedDepartments.includes(dept.name));
      console.log(`🔒 Filtered tree to ${treeArray.length} department(s) for user "${username}"`);
    }

    const responseData = {
      success: true,
      tree: treeArray,
      unorganized: tree.unorganized,
      stats: {
        totalDepartments: treeArray.length,
        totalSOPs: sopsWithMcqs,
        totalMCQBanks: mcqBanks.length,
        totalQuestions: mcqBanks.reduce((sum: number, bank: any) => sum + (bank.totalQuestions || 0), 0),
      },
      userAccess: {
        allowedDepartments,
        isRestricted,
      }
    };

    return NextResponse.json(responseData, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
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
