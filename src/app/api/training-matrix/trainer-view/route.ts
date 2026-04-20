import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrix from '@/models/TrainingMatrix';
import DepartmentTrainer from '@/models/DepartmentTrainer';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const sp         = request.nextUrl.searchParams;
    const trainerF   = sp.get('trainer')    || 'all';
    const deptF      = sp.get('department') || 'all';
    const statusF    = sp.get('status')     || 'all';
    const searchQ    = sp.get('search')     || '';

    // ── 1. Aggregate all trainers with their SOP & employee coverage ──────────
    const matchBase: Record<string, any> = {
      trainerName: { $exists: true, $nin: [null, ''] },
    };
    if (deptF !== 'all') matchBase.department = deptF;

    const allProfiles = await TrainingMatrix.aggregate([
      { $match: matchBase },
      {
        $group: {
          _id: '$trainerName',
          departments: { $addToSet: '$department' },
          sops: {
            $push: {
              sopIdentifier: '$sopIdentifier',
              sopName:       '$sopName',
              employeeName:  '$employeeName',
              status:        '$status',
              passStatus:    '$passStatus',
              score:         '$score',
              retestRequired: '$retestRequired',
              trainingDate:  '$trainingDate',
            },
          },
          totalRecords:   { $sum: 1 },
          pendingCount:   { $sum: { $cond: [{ $eq: ['$status', 'Pending'] },   1, 0] } },
          inProgressCount:{ $sum: { $cond: [{ $eq: ['$status', 'In Progress'] }, 1, 0] } },
          completedCount: { $sum: { $cond: [{ $in: ['$status', ['Completed', 'Trained']] }, 1, 0] } },
          passedCount:    { $sum: { $cond: [{ $eq: ['$passStatus', 'Pass'] }, 1, 0] } },
          failedCount:    { $sum: { $cond: [{ $eq: ['$passStatus', 'Fail'] }, 1, 0] } },
          retestCount:    { $sum: { $cond: ['$retestRequired', 1, 0] } },
          avgScore:       { $avg: '$score' },
        },
      },
      {
        $addFields: {
          trainerName:      '$_id',
          uniqueSOPCount:   { $size: { $setUnion: ['$sops.sopIdentifier'] } },
          uniqueEmpCount:   { $size: { $setUnion: ['$sops.employeeName'] } },
          passRate: {
            $cond: [
              { $eq: ['$totalRecords', 0] },
              0,
              { $multiply: [{ $divide: ['$passedCount', '$totalRecords'] }, 100] },
            ],
          },
          completionRate: {
            $cond: [
              { $eq: ['$totalRecords', 0] },
              0,
              { $multiply: [{ $divide: ['$completedCount', '$totalRecords'] }, 100] },
            ],
          },
        },
      },
      { $sort: { pendingCount: -1, trainerName: 1 } },
    ]);

    // ── 2. Build per-SOP summaries per trainer ────────────────────────────────
    const trainers = allProfiles.map((p: any) => {
      const sopMap: Record<string, {
        sopIdentifier: string;
        sopName:       string;
        employees:     string[];
        pending:       number;
        inProgress:    number;
        completed:     number;
        passed:        number;
        failed:        number;
        retests:       number;
        lastTrainingDate: Date | null;
      }> = {};

      for (const s of p.sops || []) {
        const key = s.sopIdentifier;
        if (!sopMap[key]) {
          sopMap[key] = {
            sopIdentifier:   key,
            sopName:         s.sopName || key,
            employees:       [],
            pending:         0,
            inProgress:      0,
            completed:       0,
            passed:          0,
            failed:          0,
            retests:         0,
            lastTrainingDate: null,
          };
        }
        const sop = sopMap[key];
        if (s.employeeName) sop.employees.push(s.employeeName);
        if (s.status === 'Pending')                            sop.pending++;
        if (s.status === 'In Progress')                        sop.inProgress++;
        if (['Completed', 'Trained'].includes(s.status))       sop.completed++;
        if (s.passStatus === 'Pass')                           sop.passed++;
        if (s.passStatus === 'Fail')                           sop.failed++;
        if (s.retestRequired)                                  sop.retests++;
        if (s.trainingDate && (!sop.lastTrainingDate || new Date(s.trainingDate) > sop.lastTrainingDate)) {
          sop.lastTrainingDate = s.trainingDate;
        }
      }

      const sopSummary = Object.values(sopMap).map((s: any) => ({
        ...s,
        uniqueEmployees: [...new Set(s.employees)].length,
        allCompleted:    s.pending === 0 && s.inProgress === 0 && s.completed > 0,
        employees:       undefined,
      })).sort((a: any, b: any) => b.pending - a.pending);

      // Status breakdown: all_done / has_pending / has_retest
      const allDoneSops    = sopSummary.filter((s: any) => s.allCompleted).length;
      const pendingSops    = sopSummary.filter((s: any) => s.pending > 0).length;
      const retestSops     = sopSummary.filter((s: any) => s.retests > 0).length;

      return {
        trainerName:     p.trainerName,
        departments:     p.departments,
        totalRecords:    p.totalRecords,
        pendingCount:    p.pendingCount,
        inProgressCount: p.inProgressCount,
        completedCount:  p.completedCount,
        passedCount:     p.passedCount,
        failedCount:     p.failedCount,
        retestCount:     p.retestCount,
        avgScore:        p.avgScore ? Math.round(p.avgScore * 10) / 10 : null,
        uniqueSOPCount:  p.uniqueSOPCount,
        uniqueEmpCount:  p.uniqueEmpCount,
        passRate:        Math.round(p.passRate),
        completionRate:  Math.round(p.completionRate),
        sopSummary,
        allDoneSops,
        pendingSops,
        retestSops,
      };
    });

    // ── 3. Also pull DepartmentTrainer-assigned trainers (may have no matrix entries) ─
    const deptTrainers = await DepartmentTrainer.find({}).lean() as any[];
    const deptTrainerNames = [...new Set(deptTrainers.map((t: any) => t.trainerName).filter(Boolean))];

    // Merge: any DeptTrainer name not in matrix profiles → add empty shell
    const knownNames = new Set(trainers.map(t => t.trainerName));
    for (const name of deptTrainerNames) {
      if (!knownNames.has(name)) {
        const depts = deptTrainers.filter((t: any) => t.trainerName === name).map((t: any) => t.departmentName).filter(Boolean);
        trainers.push({
          trainerName:     name,
          departments:     depts,
          totalRecords:    0,
          pendingCount:    0,
          inProgressCount: 0,
          completedCount:  0,
          passedCount:     0,
          failedCount:     0,
          retestCount:     0,
          avgScore:        null,
          uniqueSOPCount:  0,
          uniqueEmpCount:  0,
          passRate:        0,
          completionRate:  0,
          sopSummary:      [],
          allDoneSops:     0,
          pendingSops:     0,
          retestSops:      0,
        });
      }
    }

    // ── 4. Apply filters ──────────────────────────────────────────────────────
    let filtered = trainers;
    if (trainerF !== 'all') filtered = filtered.filter(t => t.trainerName === trainerF);
    if (statusF  !== 'all') {
      if (statusF === 'all_done')      filtered = filtered.filter(t => t.pendingCount === 0 && t.completedCount > 0);
      if (statusF === 'has_pending')   filtered = filtered.filter(t => t.pendingCount > 0);
      if (statusF === 'has_retest')    filtered = filtered.filter(t => t.retestCount  > 0);
    }
    if (searchQ) {
      const q = searchQ.toLowerCase();
      filtered = filtered.filter(t =>
        t.trainerName.toLowerCase().includes(q) ||
        t.departments.some((d: string) => d.toLowerCase().includes(q))
      );
    }

    // ── 5. Overall summary stats ──────────────────────────────────────────────
    const summary = {
      totalTrainers:   trainers.length,
      allDoneTrainers: trainers.filter(t => t.pendingCount === 0 && t.completedCount > 0).length,
      pendingTrainers: trainers.filter(t => t.pendingCount > 0).length,
      retestTrainers:  trainers.filter(t => t.retestCount  > 0).length,
      totalSOPs:       [...new Set(trainers.flatMap(t => t.sopSummary.map((s: any) => s.sopIdentifier)))].length,
      totalCompleted:  trainers.reduce((s, t) => s + t.completedCount, 0),
      totalPending:    trainers.reduce((s, t) => s + t.pendingCount,   0),
    };

    // Filter options
    const departments: string[] = await TrainingMatrix.distinct('department');

    return NextResponse.json({
      success: true,
      trainers: filtered,
      summary,
      departments: departments.filter(Boolean).sort(),
      trainerNames: trainers.map(t => t.trainerName).sort(),
    });
  } catch (error: any) {
    console.error('[trainer-view]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
