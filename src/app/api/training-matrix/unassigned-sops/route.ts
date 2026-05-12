import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingMatrixUpload from '@/models/TrainingMatrixUpload';
import SOP from '@/models/SOP';
import SOPLibrary from '@/models/SOPLibrary';
import Employee from '@/models/Employee';

export const dynamic = 'force-dynamic';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function stripVersion(code: string): string {
  return String(code || '').toUpperCase().replace(/-\d+$/, '').trim();
}

// GET /api/training-matrix/unassigned-sops?department=QA&search=QAGE
// Returns SOPs from the master DB that belong to this department but are NOT
// present in the latest uploaded Excel snapshot for that department.
// These are the SOPs that can be manually "assigned" (added) to the matrix.
export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(req.url);
    const department = searchParams.get('department');
    const search     = searchParams.get('search') || '';

    if (!department) {
      return NextResponse.json({ error: 'department is required' }, { status: 400 });
    }

    // 1. Get the SOP codes already in the latest uploaded Excel snapshot for this dept
    const latestUpload = await TrainingMatrixUpload.findOne({ department, fileType: 'main', snapshot: { $exists: true, $ne: null } })
      .sort({ uploadedAt: -1 })
      .lean();

    const snapshot = (latestUpload as any)?.snapshot as {
      sopCodes: string[];
      employees: Array<{ name: string; designation: string }>;
    } | undefined;

    const excelSopSet = new Set<string>(
      (snapshot?.sopCodes || []).map((c: string) => stripVersion(c)).filter(Boolean)
    );

    // Existing employees — merge master collection + snapshot so manually added
    // employees always appear even if they aren't in the uploaded Excel yet.
    const masterEmployees = (await Employee.find({ department: { $regex: new RegExp(`^${department}$`, 'i') }, isActive: true })
      .select('name designation')
      .sort({ name: 1 })
      .lean()) as unknown as Array<{ name: string; designation: string }>;

    const masterNames = new Set(masterEmployees.map((e) => e.name));
    const snapshotOnly = (snapshot?.employees || [])
      .filter((e: any) => e.name && !masterNames.has(e.name))
      .map((e: any) => ({ name: e.name || '', designation: e.designation || '' }));

    const merged = [
      ...masterEmployees.map((e) => ({ name: e.name, designation: e.designation })),
      ...snapshotOnly,
    ];
    merged.sort((a, b) => a.name.localeCompare(b.name));

    const existingEmployees = merged;

    // 2. Query the master SOP DB for SOPs belonging to this department
    const filter: Record<string, unknown> = {
      department: { $regex: department, $options: 'i' },
      status: 'completed',
      isObsolete: { $ne: true },
    };
    if (search) {
      filter.$or = [
        { identifier: { $regex: search, $options: 'i' } },
        { name:       { $regex: search, $options: 'i' } },
      ];
    }

    const masterSops = await SOP.find(filter)
      .select('_id identifier name department version effectiveDate reviewDate')
      .sort({ identifier: 1 })
      .limit(300)
      .lean();

    // 3. Filter out SOPs already present in the Excel snapshot
    const filteredSops = (masterSops as any[]).filter((s: any) => {
      const base = stripVersion(String(s.identifier || ''));
      return !excelSopSet.has(base);
    });

    // 4. Build a name map from SOPLibrary for any SOPs whose SOP.name is blank or equals the identifier
    //    (SOPLibrary.sopName is the canonical human-readable name)
    const needsNameLookup = filteredSops
      .filter((s: any) => !s.name || s.name === s.identifier)
      .map((s: any) => stripVersion(String(s.identifier || '')));

    const libNameMap = new Map<string, string>();
    if (needsNameLookup.length) {
      const libDocs = await SOPLibrary.find(
        { sopIdentifier: { $in: needsNameLookup } },
        { sopIdentifier: 1, sopName: 1 },
      ).lean();
      for (const doc of libDocs as any[]) {
        const base = stripVersion(String(doc.sopIdentifier || ''));
        if (base && doc.sopName) libNameMap.set(base, String(doc.sopName));
      }
    }

    const unassigned = filteredSops.map((s: any) => {
      const base = stripVersion(String(s.identifier || ''));
      const resolvedName = (s.name && s.name !== s.identifier)
        ? s.name
        : (libNameMap.get(base) || s.name || s.identifier);
      return {
        _id:        String(s._id),
        identifier: s.identifier,
        name:       resolvedName,
        department: s.department,
        effectiveDate: s.effectiveDate,
        reviewDate:    s.reviewDate,
      };
    });

    // 4. Return upload context so the UI knows month/year for the latest upload
    return NextResponse.json({
      unassigned,
      totalUnassigned: unassigned.length,
      uploadContext: latestUpload ? {
        uploadId:   String((latestUpload as any)._id),
        month:      (latestUpload as any).month,
        year:       (latestUpload as any).year,
        monthName:  (latestUpload as any).monthName || MONTH_NAMES[((latestUpload as any).month || 1) - 1],
        department: (latestUpload as any).department,
      } : null,
      existingEmployees,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
