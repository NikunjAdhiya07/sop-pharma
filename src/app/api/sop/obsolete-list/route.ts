import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import ArchivedMCQBank from '@/models/ArchivedMCQBank';

export async function GET() {
  try {
    await connectDB();

    // 1. SOPs marked obsolete in the SOP registry — full fields for registry display
    const obsoleteSops = await SOP.find({ isObsolete: true })
      .select(
        'name identifier department language fileUrl fileType originalFileName location ' +
        'metadata reviewDate expiryDate version obsoleteAt obsoleteReason createdAt ' +
        'sopDocuments isObsolete'
      )
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
          location: sop.location || null,
          expiryDate: sop.expiryDate || sop.reviewDate || sop.metadata?.reviewDate || null,
          language: sop.language,
          englishName: sop.language !== 'Gujarati' ? sop.name : undefined,
          gujaratiName: sop.language === 'Gujarati' ? sop.name : undefined,
          // File info — collect from all language variants below
          sopFile: sop.language !== 'Gujarati' && sop.fileUrl ? {
            filePath: sop.fileUrl,
            fileType: sop.fileType,
            fileName: sop.originalFileName || sop.name,
            language: sop.language || 'English',
          } : undefined,
          sopDocuments: sop.sopDocuments || [],
          fromRegistry: true,
          fromMCQBank: false,
          // media stubs — not tracked per-SOP in the obsolete query but keep shape consistent
          mediaStatus: { videoCount: 0, slideCount: 0 },
        });
      } else {
        const entry = byIdentifier.get(id);
        if (sop.language === 'Gujarati') {
          entry.gujaratiName = sop.name;
          // Add Gujarati file as a sopDocument
          if (sop.fileUrl) {
            const gujDoc = {
              filePath: sop.fileUrl,
              fileType: sop.fileType,
              fileName: sop.originalFileName || sop.name,
              language: 'Gujarati',
            };
            if (!entry.sopDocuments.some((d: any) => d.filePath === gujDoc.filePath)) {
              entry.sopDocuments.push(gujDoc);
            }
          }
          entry.isDualLanguage = true;
        } else {
          entry.englishName = sop.name;
          if (sop.fileUrl && !entry.sopFile) {
            entry.sopFile = {
              filePath: sop.fileUrl,
              fileType: sop.fileType,
              fileName: sop.originalFileName || sop.name,
              language: 'English',
            };
          }
        }
        // Merge sopDocuments
        (sop.sopDocuments || []).forEach((doc: any) => {
          if (doc.filePath && !entry.sopDocuments.some((d: any) => d.filePath === doc.filePath)) {
            entry.sopDocuments.push(doc);
          }
        });
      }
    }

    // 2. SOPs in ArchivedMCQBank
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
          language: bank.language || 'English',
          location: null,
          expiryDate: null,
          version: null,
          sopFile: undefined,
          sopDocuments: [],
          mediaStatus: { videoCount: 0, slideCount: 0 },
          fromRegistry: false,
          fromMCQBank: true,
          mcqCount: bank.totalQuestions,
          archivedAt: bank.archivedAt,
        });
      }
    }

    const list = Array.from(byIdentifier.values()).sort((a, b) =>
      String(a.identifier || '').localeCompare(String(b.identifier || ''))
    );

    return NextResponse.json({ success: true, data: list });
  } catch (error) {
    console.error('obsolete-list error:', error);
    return NextResponse.json({ error: 'Failed to fetch obsolete SOPs' }, { status: 500 });
  }
}
