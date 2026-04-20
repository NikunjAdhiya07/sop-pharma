import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import SOPLibrary from '@/models/SOPLibrary';
import {
  normalizeSopIdentifierKey,
  sopFamilyKeyFromIdentifier,
  parseRevisionFromSopIdentifier,
} from '@/lib/sopIdentifierNormalize';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const department = searchParams.get('department');
    const search = searchParams.get('search');

    const matchStage: any = {
      sopIdentifier: { $regex: /^[A-Z]{2,6}\d{1,4}-\d{1,3}$/i },
      sopName: { $not: /annexure/i },
    };

    if (department && department !== 'all') {
      matchStage.department = department;
    }

    if (search) {
      matchStage.$or = [
        { sopName: { $regex: search, $options: 'i' } },
        { sopIdentifier: { $regex: search, $options: 'i' } },
      ];
    }

    // Fetch all matching English rows (one per identifier, language already unique-indexed)
    const rows = await SOPLibrary.find({ ...matchStage, language: { $in: ['English', null, undefined] } })
      .select('_id sopId sopIdentifier sopName department language location updatedAt')
      .lean();

    // Also grab any rows without a language field (legacy)
    const allRows = rows.length > 0 ? rows : await SOPLibrary.find(matchStage)
      .select('_id sopId sopIdentifier sopName department language location updatedAt')
      .lean();

    // Group by SOP family key (e.g. MAGE01-06, MAGE01-07, MAGE01-08 → family MAGE:1)
    // Keep only the highest revision per family
    const familyMap = new Map<string, any>();

    for (const row of allRows) {
      const identifier = String(row.sopIdentifier || '').trim().toUpperCase();
      const familyKey = sopFamilyKeyFromIdentifier(identifier);
      if (!familyKey) continue;

      const rev = parseRevisionFromSopIdentifier(identifier) ?? -1;
      const existing = familyMap.get(familyKey);

      if (!existing || rev > existing.rev) {
        familyMap.set(familyKey, { row, rev });
      }
    }

    const sops = Array.from(familyMap.values())
      .map(({ row }) => ({
        _id: row.sopId,   // SOP._id — used by analyze API (SOP.findById)
        identifier: normalizeSopIdentifierKey(String(row.sopIdentifier || '').trim().toUpperCase()),
        name: row.sopName,
        department: row.department,
        location: row.location,
      }))
      .sort((a, b) => {
        const deptCmp = (a.department || '').localeCompare(b.department || '');
        if (deptCmp !== 0) return deptCmp;
        return a.identifier.localeCompare(b.identifier);
      });

    const departments: string[] = Array.from(
      new Set(sops.map((s) => s.department).filter(Boolean))
    ).sort() as string[];

    return NextResponse.json({
      success: true,
      sops,
      departments,
      pagination: {
        page: 1,
        limit: sops.length,
        total: sops.length,
        totalPages: 1,
      },
    });
  } catch (error) {
    console.error('Error fetching SOPs for compliance:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch SOPs',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
