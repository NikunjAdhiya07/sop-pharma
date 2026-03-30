import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import ArchivedMCQBank from '@/models/ArchivedMCQBank';

export async function GET() {
  try {
    await connectDB();

    // 1. SOPs marked obsolete in the SOP registry
    const obsoleteSops = await SOP.find({ isObsolete: true })
      .select('name identifier department language fileUrl fileType obsoleteAt obsoleteReason version')
      .lean() as any[];

    // Group by identifier (English + Gujarati variants)
    const byIdentifier = new Map<string, any>();
    for (const sop of obsoleteSops) {
      const id = sop.identifier;
      if (!byIdentifier.has(id)) {
        byIdentifier.set(id, {
          identifier: id,
          department: sop.department,
          obsoleteAt: sop.obsoleteAt,
          obsoleteReason: sop.obsoleteReason,
          version: sop.version,
          englishName: sop.language !== 'Gujarati' ? sop.name : undefined,
          gujaratiName: sop.language === 'Gujarati' ? sop.name : undefined,
          fromRegistry: true,
          fromMCQBank: false,
        });
      } else {
        const entry = byIdentifier.get(id);
        if (sop.language === 'Gujarati') entry.gujaratiName = sop.name;
        else entry.englishName = sop.name;
      }
    }

    // 2. SOPs in ArchivedMCQBank (already "obsolete" in MCQ bank — archived via archive-sops)
    const archivedBanks = await ArchivedMCQBank.find()
      .select('sopName sopIdentifier department archivedAt language totalQuestions')
      .lean() as any[];

    for (const bank of archivedBanks) {
      const id = bank.sopIdentifier;
      if (byIdentifier.has(id)) {
        byIdentifier.get(id).fromMCQBank = true;
        byIdentifier.get(id).mcqCount = bank.totalQuestions;
        byIdentifier.get(id).archivedAt = bank.archivedAt;
      } else {
        byIdentifier.set(id, {
          identifier: id,
          department: bank.department,
          obsoleteAt: bank.archivedAt,
          englishName: bank.sopName,
          gujaratiName: undefined,
          fromRegistry: false,
          fromMCQBank: true,
          mcqCount: bank.totalQuestions,
          archivedAt: bank.archivedAt,
        });
      }
    }

    const list = Array.from(byIdentifier.values()).sort((a, b) => {
      // Sort by identifier
      return String(a.identifier || '').localeCompare(String(b.identifier || ''));
    });

    return NextResponse.json({ success: true, data: list });
  } catch (error) {
    console.error('obsolete-list error:', error);
    return NextResponse.json({ error: 'Failed to fetch obsolete SOPs' }, { status: 500 });
  }
}
