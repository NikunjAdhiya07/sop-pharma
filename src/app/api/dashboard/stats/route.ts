import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import User from '@/models/User';
import SOPLibrary from '@/models/SOPLibrary';
import SOPGuideline from '@/models/SOPGuideline';
import { Notification } from '@/models/Notification';
import { getRedis, REDIS_TTL } from '@/lib/redis';
import TrainingVideo from '@/models/TrainingVideo';
import TrainingSlide from '@/models/TrainingSlide';

export const dynamic = 'force-dynamic';

const DASHBOARD_STATS_CACHE_KEY = 'dashboard-stats:v1';

export async function GET() {
  try {
    const redis = getRedis();
    if (redis) {
      try {
        const cached = await redis.get(DASHBOARD_STATS_CACHE_KEY);
        if (cached) return NextResponse.json(cached);
      } catch { /* fall through */ }
    }

    await connectDB();

    // ── PARALLEL AGGREGATIONS ──────────────────────────────────────────────────
    const [
      mcqAgg,
      libraryAgg,
      libraryDistinctSopAgg,
      languageAgg,
      trainerCount,
      guidelineCount,
      deptAgg,
      difficultyAgg,
      tmTrainersRaw,
      tmDistributionRaw,
    ] = await Promise.all([
      // Total MCQs (sum of totalQuestions across all MCQBanks)
      MCQBank.aggregate([
        { $group: { _id: null, totalMCQs: { $sum: '$totalQuestions' }, totalBanks: { $sum: 1 } } }
      ]),

      // Videos and Slides count from SOPLibrary (same filters as dashboard sops API)
      SOPLibrary.aggregate([
        {
          $match: {
            sopIdentifier: { $regex: /^[A-Z]{2,6}\d{1,4}-\d{1,3}$/i },
            sopName: { $not: /annexure/i },
          }
        },
        {
          $group: {
            _id: null,
            totalVideos: {
              $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$videos', []] } }, 0] }, 1, 0] }
            },
            totalSlides: {
              $sum: { $cond: [{ $gt: [{ $size: { $ifNull: ['$slides', []] } }, 0] }, 1, 0] }
            },
          }
        }
      ]),

      // Distinct SOP codes in library (English + Gujarati rows share one identifier — count once)
      SOPLibrary.aggregate([
        {
          $match: {
            sopIdentifier: { $regex: /^[A-Z]{2,6}\d{1,4}-\d{1,3}$/i },
            sopName: { $not: /annexure/i },
          }
        },
        { $group: { _id: { $toUpper: { $trim: { input: '$sopIdentifier' } } } } },
        { $count: 'totalSOPs' },
      ]),

      // Language-wise SOP count from SOPLibrary (same filters as dashboard sops API)
      SOPLibrary.aggregate([
        {
          $match: {
            sopIdentifier: { $regex: /^[A-Z]{2,6}\d{1,4}-\d{1,3}$/i },
            sopName: { $not: /annexure/i },
          }
        },
        {
          $group: {
            _id: { $ifNull: ['$language', 'English'] },
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } }
      ]),

      // Trainer count from User model
      User.countDocuments({ $or: [{ role: 'trainer' }, { isTrainerEligible: true }] }),

      // Guidelines count
      SOPGuideline.countDocuments(),

      // ─── Department totals from SOPLibrary (matches uploaded folder / registry — not MCQBank-only) ───
      // Count DISTINCT sopIdentifiers per normalised department; English+Gujarati library rows dedupe by code.
      SOPLibrary.aggregate([
        {
          $match: {
            sopIdentifier: { $regex: /^[A-Z]{2,6}\d{1,4}-\d{1,3}$/i },
            sopName: { $not: /annexure/i },
            department: { $exists: true, $nin: [null, ''] },
          }
        },
        {
          $addFields: {
            normDept: {
              $switch: {
                branches: [
                  { case: { $regexMatch: { input: { $toLower: '$department' }, regex: /micro/ } }, then: 'Microbiology' },
                  { case: { $regexMatch: { input: { $toLower: '$department' }, regex: /engineer/ } }, then: 'Engineering and Maintenance' },
                  { case: { $regexMatch: { input: { $toLower: '$department' }, regex: /(person|hr)/ } }, then: 'Personnel' },
                  { case: { $regexMatch: { input: { $toLower: '$department' }, regex: /qa|quality.assur/ } }, then: 'QA' },
                  { case: { $regexMatch: { input: { $toLower: '$department' }, regex: /qc|quality.cont/ } }, then: 'QC' },
                  { case: { $regexMatch: { input: { $toLower: '$department' }, regex: /store/ } }, then: 'Store' },
                  { case: { $regexMatch: { input: { $toLower: '$department' }, regex: /prod/ } }, then: 'Production' },
                ],
                default: '$department',
              }
            }
          }
        },
        {
          $group: {
            _id: {
              dept: '$normDept',
              sop: { $toUpper: { $trim: { input: '$sopIdentifier' } } },
            },
          }
        },
        {
          $group: {
            _id: '$_id.dept',
            count: { $sum: 1 },
          }
        },
        { $sort: { count: -1 } }
      ]),

      // MCQ difficulty distribution summed across all banks
      MCQBank.aggregate([
        {
          $group: {
            _id: null,
            easy: { $sum: '$difficultyDistribution.easy' },
            medium: { $sum: '$difficultyDistribution.medium' },
            hard: { $sum: '$difficultyDistribution.hard' },
          }
        }
      ]),
      // DISTINCT Trainers from TrainingMatrix
      import('@/models/TrainingMatrix').then(m => m.default.distinct('trainerName', { trainerName: { $nin: [null, ''] } })),
      // Trainer SOP assignments distribution
      import('@/models/TrainingMatrix').then(m => m.default.aggregate([
        { $match: { trainerName: { $nin: [null, ''] }, sopIdentifier: { $exists: true } } },
        { $group: { _id: { trainer: '$trainerName', sop: '$sopIdentifier' } } },
        { $group: { _id: '$_id.trainer', sopCount: { $sum: 1 } } },
        { $sort: { sopCount: -1 } },
        { $limit: 10 } // Top 10 trainers
      ]))
    ]);

    const mcqStats = mcqAgg[0] || { totalMCQs: 0, totalBanks: 0 };
    const libStats = libraryAgg[0] || { totalVideos: 0, totalSlides: 0 };
    const distinctLib = libraryDistinctSopAgg[0] as { totalSOPs?: number } | undefined;
    const totalSOPsDistinct = typeof distinctLib?.totalSOPs === 'number' ? distinctLib.totalSOPs : 0;
    const difficulty = difficultyAgg[0] || { easy: 0, medium: 0, hard: 0 };

    // Calculate SOP video metrics: Brief, Explainer, and Both
    const allVideos = await TrainingVideo.find({ active: true }).lean();
    const sopVideoKinds = new Map<string, Set<string>>();

    console.log(`[SOP Videos] Total videos in DB: ${allVideos.length}`);

    // Helper to normalize SOP code: pad the prefix number to 2 digits
    // e.g., "STGE1-7" → "STGE01", "STGE01-07" → "STGE01"
    const normalizeSopCode = (code: string): string => {
      if (!code) return '';
      const match = code.match(/^([A-Z]{2,6})(\d{1,2})(-\d+)?$/i);
      if (match) {
        const prefix = match[1].toUpperCase();
        const num = match[2].padStart(2, '0');
        return prefix + num;
      }
      return code.replace(/-\d+$/, '').trim().toUpperCase();
    };

    allVideos.forEach((v: any) => {
      // Skip Gujarati versions (they're duplicates of English versions)
      const title = String(v.title || '').toUpperCase();
      if (title.includes('_GUJ')) return;

      // Extract SOP code from title if sopNo is not set (e.g., "STGE01-07_Brief" → "STGE01-07")
      let sopCode = String(v.sopNo || '').toUpperCase().trim();
      if (!sopCode && v.title) {
        const titleMatch = v.title.match(/^([A-Z]{2,6}\d{1,4}-\d{1,3})/i);
        if (titleMatch) {
          sopCode = titleMatch[1].toUpperCase();
        }
      }

      // Normalize the base code (remove version number and pad number to 2 digits)
      const baseCode = normalizeSopCode(sopCode);

      // Extract video kind from title if videoKind is not set
      let videoKind = String(v.videoKind || '').trim().toLowerCase();
      if (!videoKind && v.title) {
        if (v.title.toLowerCase().includes('brief')) {
          videoKind = 'brief';
        } else if (v.title.toLowerCase().includes('explainer')) {
          videoKind = 'explainer';
        }
      }

      if (baseCode && videoKind) {
        if (!sopVideoKinds.has(baseCode)) {
          sopVideoKinds.set(baseCode, new Set());
        }
        sopVideoKinds.get(baseCode)!.add(videoKind);
      }
    });

    console.log(`[SOP Videos] Found SOPs with videos:`, Array.from(sopVideoKinds.keys()).sort());

    // Count SOPs for each metric
    const sopsWithBrief = Array.from(sopVideoKinds.entries()).filter(([_, kinds]) => kinds.has('brief')).length;
    const sopsWithExplainer = Array.from(sopVideoKinds.entries()).filter(([_, kinds]) => kinds.has('explainer')).length;
    const sopsWithBoth = Array.from(sopVideoKinds.entries()).filter(([_, kinds]) => kinds.has('brief') && kinds.has('explainer')).length;

    const sopsWithVideosCount = sopsWithBoth;
    const sopsWithoutVideosCount = totalSOPsDistinct - sopsWithVideosCount;
    const sopsWithBriefNotFound = totalSOPsDistinct - sopsWithBrief;
    const sopsWithExplainerNotFound = totalSOPsDistinct - sopsWithExplainer;
    let videosFound = sopsWithVideosCount;
    let videosExpected = totalSOPsDistinct;

    console.log(`[SOP Videos] Total SOPs: ${totalSOPsDistinct}, Brief: ${sopsWithBrief}/${sopsWithBriefNotFound}, Explainer: ${sopsWithExplainer}/${sopsWithExplainerNotFound}, Both: ${sopsWithBoth}/${sopsWithoutVideosCount}`);

    // Calculate slides found (SOPs with slides)
    const allSlides = await TrainingSlide.find({ active: true }).lean();
    const slidesBySopCode = new Map<string, number>();
    allSlides.forEach((s: any) => {
      const baseCode = String(s.sopNo || '').toUpperCase().replace(/-\d+$/, '').trim();
      slidesBySopCode.set(baseCode, (slidesBySopCode.get(baseCode) || 0) + 1);
    });

    const slidesFound = slidesBySopCode.size;
    const slidesExpected = totalSOPsDistinct;

    const tmTrainers: string[] = Array.isArray(tmTrainersRaw) ? tmTrainersRaw : [];
    const tmDistribution: Array<{ _id: string; sopCount: number }> = Array.isArray(tmDistributionRaw) ? tmDistributionRaw : [];

    // ── TRAINER RESOLUTION (Identical to SOPs route) ──
    const normalizeDept = (d: string) => {
      if (!d) return '';
      const lower = d.toLowerCase();
      if (lower.includes('micro')) return 'Microbiology';
      if (lower.includes('engineer')) return 'Engineering and Maintenance';
      if (lower.includes('person') || lower.includes('hr')) return 'Personnel';
      if (lower.includes('qa') || lower.includes('quality assurance')) return 'QA';
      if (lower.includes('qc') || lower.includes('quality control')) return 'QC';
      if (lower.includes('store')) return 'Store';
      if (lower.includes('prod')) return 'Production';
      return d;
    };

    const fallbackTrainerMap: Record<string, string[]> = {
      'QA': ['Abhishek Dave'],
      'QC': ['Jayesh Aal'],
      'Microbiology': ['Ulhas Mahajan'],
      'Store': ['Sanjay Chauhan'],
      'Production': ['Darshan Parmar', 'Nirav Morasiya'],
      'Personnel': ['Jignesh Trivedi'],
      'Engineering and Maintenance': ['Devang Rathod']
    };

    const allTrainersSet = new Set<string>();
    const trainerSopMap = new Map<string, number>();

    // Add trainers from DB count + TM count directly
    tmTrainers.forEach((t: string) => allTrainersSet.add(t));

    // Distribute department-level counts to trainers using the fallback map
    deptAgg.forEach((d: any) => {
      const dept = normalizeDept(d._id);
      const counts = d.count;
      const assignedTrainers = fallbackTrainerMap[dept] || [];
      
      assignedTrainers.forEach(trainerName => {
        allTrainersSet.add(trainerName);
        trainerSopMap.set(trainerName, (trainerSopMap.get(trainerName) || 0) + counts);
      });
    });

    // Also inject TM specific distributions
    tmDistribution.forEach((t: any) => {
       const trainerName = t._id;
       allTrainersSet.add(trainerName);
       trainerSopMap.set(trainerName, (trainerSopMap.get(trainerName) || 0) + t.sopCount);
    });

    // totalTrainers = User model trainers + matrix trainers + static mapped trainers
    const finalTotalTrainers = Math.max(trainerCount, allTrainersSet.size);

    // Build language map
    const languageMap: Record<string, number> = {};
    languageAgg.forEach((l: any) => {
      languageMap[l._id || 'English'] = l.count;
    });

    // Build department distribution array
    const departmentDistribution = deptAgg.map((d: any) => ({
      department: d._id || 'Unknown',
      count: d.count,
      hasVideos: d.hasVideos,
      hasSlides: d.hasSlides,
    }));

    // Build trainer distribution array
    const trainerDistributionRaw: Array<{trainer: string, sopCount: number}> = [];
    trainerSopMap.forEach((sopCount, trainer) => {
      trainerDistributionRaw.push({ trainer, sopCount });
    });
    trainerDistributionRaw.sort((a, b) => b.sopCount - a.sopCount);
    
    // Default to 'Unknown' check just like before
    const trainerDistribution = trainerDistributionRaw.map((d: any) => ({
      trainer: d.trainer || 'Unknown',
      sopCount: d.sopCount
    }));

    // ── BACKGROUND EXPIRY NOTIFICATION CHECK ─────────────────────────────────
    (async () => {
      try {
        const today = new Date();
        const thirtyDaysFromNow = new Date(today);
        thirtyDaysFromNow.setDate(today.getDate() + 30);

        const expiringSOPs = await SOP.find({
          $or: [
            { expiryDate: { $gte: today, $lte: thirtyDaysFromNow } },
            { reviewDate: { $gte: today, $lte: thirtyDaysFromNow } }
          ]
        }).select('name identifier expiryDate reviewDate');

        if (expiringSOPs.length > 0) {
          const admins = await User.find({ role: { $in: ['admin', 'qa-head'] } }).select('_id');
          for (const sop of expiringSOPs) {
            const date = sop.reviewDate || sop.expiryDate;
            const dateStr = date ? new Date(date).toLocaleDateString() : 'soon';
            const link = `/sop-library/${sop._id}`;
            for (const admin of admins) {
              const existingNotif = await Notification.findOne({
                recipient: admin._id,
                type: 'expiry',
                link,
              }).sort({ createdAt: -1 });

              let shouldNotify = true;
              if (existingNotif) {
                const daysSince = (today.getTime() - new Date(existingNotif.createdAt).getTime()) / 86400000;
                if (daysSince < 7) shouldNotify = false;
                if (!existingNotif.read && daysSince < 14) shouldNotify = false;
              }
              if (shouldNotify) {
                await Notification.create({
                  recipient: admin._id,
                  type: 'expiry',
                  title: 'SOP Expiring Soon',
                  message: `SOP "${sop.name}" (${sop.identifier}) is expiring on ${dateStr}. Please review.`,
                  link,
                  read: false,
                });
              }
            }
          }
        }
      } catch (e) {
        console.error('Background expiry check failed:', e);
      }
    })();

    const responseBody = {
      success: true,
      stats: {
        totalSOPs: totalSOPsDistinct,
        totalMCQs: mcqStats.totalMCQs,
        totalMCQBanks: mcqStats.totalBanks,
        totalVideos: libStats.totalVideos,
        totalSlides: libStats.totalSlides,
        videosFound,
        videosExpected,
        sopsWithVideos: sopsWithVideosCount,
        sopsWithoutVideos: sopsWithoutVideosCount,
        sopsWithBrief,
        sopsWithoutBrief: sopsWithBriefNotFound,
        sopsWithExplainer,
        sopsWithoutExplainer: sopsWithExplainerNotFound,
        slidesFound,
        slidesExpected,
        totalTrainers: finalTotalTrainers,
        totalGuidelines: guidelineCount,
        languageDistribution: languageMap,
        departmentDistribution,
        trainerDistribution,
        difficultyDistribution: {
          easy: difficulty.easy,
          medium: difficulty.medium,
          hard: difficulty.hard,
        },
      }
    };

    if (redis) {
      try { await redis.set(DASHBOARD_STATS_CACHE_KEY, responseBody, { ex: REDIS_TTL.FIVE_MIN }); } catch { /* ignore */ }
    }

    return NextResponse.json(responseBody);

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
