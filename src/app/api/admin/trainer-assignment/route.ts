import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import User from '@/models/User';
import SOP from '@/models/SOP';
import DepartmentTrainer from '@/models/DepartmentTrainer';
import * as XLSX from 'xlsx';

interface RowEntry {
  trainerName: string;
  sopCode: string;
  sopName: string;
  department: string;
  sheet: string;
}

function deptFromSheet(sheetName: string): string {
  const raw = sheetName.replace(/\(.*?\)/g, '').trim();
  const map: Record<string, string> = {
    QA: 'QA',
    QC: 'QC',
    MICRO: 'Microbiology',
    MICROBIOLOGY: 'Microbiology',
    'PRODUCTION-ENGINEERING': 'Engineering and Maintenance',
    'PRODUCTION-MAINTENANCE': 'Engineering and Maintenance',
    PRODUCTION: 'Production',
    'EXTERNAL PREPARATION': 'Production',
    STORE: 'Store',
    BSR: 'Store',
    PERSONNEL: 'Personnel',
  };
  return map[raw.toUpperCase()] ?? raw;
}

function findCol(keys: string[], candidates: string[]): string | null {
  for (const c of candidates) {
    const exact = keys.find(k => k.toLowerCase().trim() === c.toLowerCase());
    if (exact) return exact;
  }
  for (const c of candidates) {
    const partial = keys.find(k => k.toLowerCase().includes(c.toLowerCase()));
    if (partial) return partial;
  }
  return null;
}

function parseAllSheets(buffer: Buffer): { rows: RowEntry[]; sheetsProcessed: string[]; warnings: string[] } {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const rows: RowEntry[] = [];
  const sheetsProcessed: string[] = [];
  const warnings: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, string>[];
    if (!data.length) continue;

    const keys = Object.keys(data[0]);
    const trainerKey = findCol(keys, [
      'Trainer Name', "Trainer's Name", 'Trainier Name', 'Trainer', 'Training Officer', 'Training Incharge',
    ]);
    const sopCodeKey = findCol(keys, ['SOP NO.', 'SOP NO', 'SOP Code', 'SOP Number', 'SOP Identifier', 'SOP']);
    const sopNameKey = findCol(keys, ['SOP SUBJECT', 'SOP Subject', 'SOP Name', 'Subject', 'Description']);

    if (!trainerKey || !sopCodeKey) {
      warnings.push(`Sheet "${sheetName}" skipped — could not detect Trainer or SOP Code column.`);
      continue;
    }

    const dept = deptFromSheet(sheetName);
    let sheetRows = 0;

    for (const row of data) {
      const trainerName = row[trainerKey]?.toString().trim();
      const rawSop = row[sopCodeKey]?.toString().trim().toUpperCase();
      const sopName = sopNameKey ? row[sopNameKey]?.toString().trim() : '';
      if (!trainerName || !rawSop) continue;

      for (const code of rawSop.split(/[,;\/]+/).map(s => s.trim()).filter(Boolean)) {
        rows.push({ trainerName, sopCode: code, sopName: sopName || code, department: dept, sheet: sheetName });
        sheetRows++;
      }
    }

    if (sheetRows > 0) sheetsProcessed.push(sheetName);
  }

  return { rows, sheetsProcessed, warnings };
}

// Drop any stale unique index on departmentName — awaited so it always completes before upserts.
async function ensureCleanIndexes() {
  try {
    await DepartmentTrainer.collection.dropIndex('departmentName_1');
  } catch { /* doesn't exist — safe to ignore */ }
}

// ─── GET: return all DepartmentTrainer records grouped by trainer ─────────────
export async function GET() {
  try {
    await connectDB();

    const records = await DepartmentTrainer.find({})
      .sort({ trainerName: 1, departmentName: 1 })
      .lean();

    // Group by trainerName
    const map = new Map<string, { departments: Set<string>; sops: { code: string; name: string; dept: string }[] }>();
    const sopCodesSet = new Set<string>();

    for (const r of records) {
      if (!r.trainerName) continue;
      if (!map.has(r.trainerName)) map.set(r.trainerName, { departments: new Set(), sops: [] });
      const entry = map.get(r.trainerName)!;
      if (r.departmentName) entry.departments.add(r.departmentName);
      if (r.sopIdentifier) {
        entry.sops.push({ code: r.sopIdentifier, name: (r.sopName || r.sopIdentifier).toString(), dept: r.departmentName?.toString() || '' });
        sopCodesSet.add(r.sopIdentifier);
      }
    }

    const sopsData = await SOP.find(
      { identifier: { $in: Array.from(sopCodesSet) } },
      { identifier: 1, nextReviewDate: 1, expiryDate: 1 }
    ).lean();

    const sopExpiryMap = new Map();
    const now = new Date();
    sopsData.forEach((s: any) => {
      const d = s.nextReviewDate ? new Date(s.nextReviewDate) : s.expiryDate ? new Date(s.expiryDate) : null;
      let expired = false;
      if (d) {
        // Same calculation as dashboard client (start of day or exact time could be used, we'll use exact for simplicity or diffDays)
        const diffDays = Math.ceil((d.getTime() - now.getTime()) / 86400000);
        if (diffDays < 0) {
          expired = true;
        }
      }
      sopExpiryMap.set(s.identifier, expired);
    });

    const trainerAssignments = Array.from(map.entries()).map(([trainerName, data]) => {
      let expiredCount = 0;
      let okayCount = 0;
      data.sops.forEach(sop => {
        // If expired is explicitly true, count as expired, otherwise okay (or we can treat unknown as okay like dashboard does for missing dates)
        if (sopExpiryMap.get(sop.code) === true) {
          expiredCount++;
        } else {
          okayCount++;
        }
      });
      return {
        trainerName,
        departments: Array.from(data.departments),
        sops: data.sops,
        sopCount: data.sops.length,
        expiredCount,
        okayCount
      };
    });

    return NextResponse.json({ success: true, trainerAssignments, total: trainerAssignments.length });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ─── DELETE: clear all DepartmentTrainer records + user assignedSOPs ──────────
export async function DELETE() {
  try {
    await connectDB();
    await Promise.all([
      DepartmentTrainer.deleteMany({}),
      User.updateMany({}, { $set: { assignedSOPs: [] } }),
    ]);
    return NextResponse.json({ success: true, message: 'All trainer SOP assignments cleared.' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ─── POST: parse & import Excel ───────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const mode = (formData.get('mode') as string) || 'append';
    const previewOnly = formData.get('previewOnly') === 'true';

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, sheetsProcessed, warnings } = parseAllSheets(buffer);

    if (!rows.length) {
      return NextResponse.json({ success: false, error: 'No valid trainer-SOP data found across all sheets.' }, { status: 400 });
    }

    // Build per-sheet summary + trainerSopMap
    const sheetSummary: Record<string, { department: string; sopCount: number; trainerNames: string[] }> = {};
    const trainerSopMap = new Map<string, { sopCode: string; sopName: string; department: string }[]>();

    for (const row of rows) {
      if (!sheetSummary[row.sheet]) {
        sheetSummary[row.sheet] = { department: row.department, sopCount: 0, trainerNames: [] };
      }
      sheetSummary[row.sheet].sopCount++;
      if (!sheetSummary[row.sheet].trainerNames.includes(row.trainerName)) {
        sheetSummary[row.sheet].trainerNames.push(row.trainerName);
      }

      const existing = trainerSopMap.get(row.trainerName) ?? [];
      if (!existing.some(e => e.sopCode === row.sopCode)) {
        existing.push({ sopCode: row.sopCode, sopName: row.sopName, department: row.department });
      }
      trainerSopMap.set(row.trainerName, existing);
    }

    // Preview — no DB writes
    if (previewOnly) {
      return NextResponse.json({
        success: true,
        preview: {
          totalSheets: sheetsProcessed.length,
          totalRows: rows.length,
          totalTrainers: trainerSopMap.size,
          sheetSummary,
          warnings,
        },
      });
    }

    // ── Actual import ──────────────────────────────────────────────────────────

    // Drop the stale unique index BEFORE any upserts (awaited — not fire-and-forget)
    await ensureCleanIndexes();

    if (mode === 'replace') {
      await Promise.all([
        DepartmentTrainer.deleteMany({}),
        User.updateMany({}, { $set: { assignedSOPs: [] } }),
      ]);
    }

    const allUsers = await User.find({}, { name: 1, assignedSOPs: 1 }).lean();
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

    const summary = {
      totalTrainers: trainerSopMap.size,
      matched: 0,
      unmatched: [] as string[],
      assignments: [] as { trainerName: string; sopCount: number; sops: { code: string; name: string }[] }[],
    };

    // Build all DepartmentTrainer bulk ops to avoid per-row await in loop
    const dtOps: Parameters<typeof DepartmentTrainer.bulkWrite>[0] = [];

    for (const [trainerName, entries] of trainerSopMap.entries()) {
      const sopCodes = entries.map(e => e.sopCode);

      const matchedUser =
        allUsers.find(u => u.name === trainerName) ??
        allUsers.find(u => normalize(u.name as string) === normalize(trainerName));

      if (!matchedUser) {
        summary.unmatched.push(trainerName);
      } else {
        summary.matched++;
        const existingSOPs: string[] = (matchedUser.assignedSOPs as string[]) ?? [];
        const mergedSOPs = Array.from(new Set([...existingSOPs, ...sopCodes]));
        await User.findByIdAndUpdate(matchedUser._id as any, { $set: { assignedSOPs: mergedSOPs } });

        for (const { sopCode, sopName } of entries) {
          const escapedCode = sopCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          await SOP.updateOne(
            { identifier: { $regex: new RegExp(`^${escapedCode}$`, 'i') } },
            { $addToSet: { assignedTrainers: matchedUser._id as any } }
          );
          await SOP.updateOne(
            {
              identifier: { $regex: new RegExp(`^${escapedCode}$`, 'i') },
              $or: [{ name: { $exists: false } }, { name: '' }],
            },
            { $set: { name: sopName } }
          );
        }

        summary.assignments.push({
          trainerName,
          sopCount: entries.length,
          sops: entries.map(e => ({ code: e.sopCode, name: e.sopName })),
        });
      }

      // Queue DepartmentTrainer upserts (one per SOP)
      for (const { sopCode, sopName, department } of entries) {
        dtOps.push({
          updateOne: {
            filter: { sopIdentifier: sopCode },
            update: { $set: { sopIdentifier: sopCode, sopName, trainerName, departmentName: department } },
            upsert: true,
          },
        });
      }
    }

    if (dtOps.length) {
      await DepartmentTrainer.bulkWrite(dtOps, { ordered: false });
    }

    return NextResponse.json({ success: true, summary, warnings });
  } catch (error: any) {
    console.error('[trainer-assignment] POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
