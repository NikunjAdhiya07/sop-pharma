import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import { buildMCQTreeStructure, getTreeAsArray } from '@/lib/mcqTreeBuilder';
import { filterPrimaryRegistryRows } from '@/lib/registryPrimaryRows';
import { getDashboardRegistryPayload } from '@/lib/dashboardRegistrySource';
import { getRedis, REDIS_TTL } from '@/lib/redis';
import { getMcqTreeVersion } from '@/lib/mcqCacheInvalidate';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const username = searchParams.get('username');
    const includeObsolete = searchParams.get('includeObsolete') === '1';
    const forceFresh = searchParams.get('refresh') === '1';

    // Cache key scoped to user + global version (version bump = instant invalidation for all users)
    const treeVersion = await getMcqTreeVersion();
    const cacheKey = `mcq-tree:v${treeVersion}:${username || '_all'}:obsolete=${includeObsolete}`;
    if (!forceFresh) {
      const redis = getRedis();
      if (redis) {
        try {
          const cached = await redis.get(cacheKey);
          if (cached) return NextResponse.json(cached);
        } catch { /* fall through */ }
      }
    }

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

    // Run dashboard registry fetch and MCQ aggregation in parallel.
    const [dashboard, mcqBanks] = await Promise.all([
      getDashboardRegistryPayload(process.env.NEXTAUTH_URL || 'http://localhost:3000'),

      // Aggregate counts server-side — sends ~50 bytes per bank instead of ~5KB of subdocuments
      dbConnection.collection('mcqbanks').aggregate([
        ...(includeObsolete ? [] : [{ $match: { isObsolete: { $ne: true } } }]),
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

    const registryRows = Array.isArray((dashboard as any)?.data) ? (dashboard as any).data : [];
    const primaryRows = filterPrimaryRegistryRows(registryRows);
    const sops = (primaryRows as any[])
      .filter((r) => (includeObsolete ? true : !Boolean(r?.isObsolete)))
      .map((r) => {
      const primaryPath = r?.sopFile?.filePath || '';
      const primaryType = (r?.sopFile?.fileType || 'pdf') as 'pdf' | 'docx';
      const langRaw = String(r?.language || '').toLowerCase();
      const isObsolete = Boolean(r?.isObsolete);
      // Normalize into SOP-like shape expected by tree builder.
      return {
        _id: r?._id || r?.sopNo || r?.sopIdentifier,
        name: r?.englishName || r?.sopName || r?.name || '',
        identifier: r?.sopNo || r?.identifier || '',
        department: r?.department || '',
        fileUrl: primaryPath,
        fileType: primaryType,
        language: langRaw === 'gujarati' ? 'Gujarati' : 'English',
        isObsolete,
      };
    });

    console.log(`📊 Building tree from ${sops.length} dashboard SOPs and ${mcqBanks.length} MCQ banks (aggregated counts)`);

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

    // Store in Redis (best-effort)
    const redis = getRedis();
    if (redis) {
      try { await redis.set(cacheKey, responseData, { ex: REDIS_TTL.FIVE_MIN }); } catch { /* ignore */ }
    }

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
