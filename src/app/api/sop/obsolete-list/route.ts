import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';

// Extract family prefix: "QAGE01-10" → "QAGE01", else return identifier as-is
function familyPrefix(identifier: string): string {
  const m = identifier.match(/^([A-Za-z]{2,6}\d+)-\d+$/);
  return m ? m[1] : identifier;
}

export async function GET() {
  try {
    await connectDB();

    // Fetch all SOP documents marked obsolete
    const obsoleteSops = await SOP.find({ isObsolete: true })
      .select(
        'name identifier department language fileUrl fileType originalFileName location ' +
        'metadata reviewDate expiryDate version obsoleteAt obsoleteReason createdAt ' +
        'sopDocuments isObsolete'
      )
      .lean() as any[];

    // Group by family prefix so all revisions of the same SOP appear as one entry
    // e.g. QAGE01-09, QAGE01-10, QAGE01-11 → one entry keyed "QAGE01"
    const byFamily = new Map<string, any>();

    for (const sop of obsoleteSops) {
      const id = sop.identifier || '';
      const fk = familyPrefix(id);

      if (!byFamily.has(fk)) {
        byFamily.set(fk, {
          // Use this SOP's identifier as the representative (we'll pick highest revision below)
          identifier: id,
          familyKey: fk,
          department: sop.department,
          obsoleteAt: sop.obsoleteAt,
          obsoleteReason: sop.obsoleteReason,
          version: sop.version,
          location: sop.location || null,
          expiryDate: sop.expiryDate || sop.reviewDate || sop.metadata?.reviewDate || null,
          language: sop.language,
          englishName: sop.language !== 'Gujarati' ? sop.name : undefined,
          gujaratiName: sop.language === 'Gujarati' ? sop.name : undefined,
          sopFile: sop.language !== 'Gujarati' && sop.fileUrl ? {
            filePath: sop.fileUrl,
            fileType: sop.fileType,
            fileName: sop.originalFileName || sop.name,
            language: sop.language || 'English',
          } : undefined,
          sopDocuments: sop.sopDocuments || [],
          mediaStatus: { videoCount: 0, slideCount: 0, videos: false, slides: false, videoRequired: 0, slideRequired: 0, videoAvailable: 0, slideAvailable: 0 },
          _revisions: [id],
        });
      } else {
        const entry = byFamily.get(fk);
        entry._revisions.push(id);

        // Pick highest revision as the representative identifier
        const currentRev = parseInt((entry.identifier.match(/-(\d+)$/) || [])[1] || '0', 10);
        const thisRev = parseInt((id.match(/-(\d+)$/) || [])[1] || '0', 10);
        if (thisRev > currentRev) {
          entry.identifier = id;
          entry.version = sop.version;
          entry.obsoleteAt = sop.obsoleteAt;
        }

        // Merge names
        if (sop.language === 'Gujarati') {
          entry.gujaratiName = sop.name;
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

    const list = Array.from(byFamily.values())
      .map(({ _revisions, familyKey, ...rest }) => rest)
      .sort((a, b) => String(a.identifier || '').localeCompare(String(b.identifier || '')));

    return NextResponse.json({ success: true, data: list });
  } catch (error) {
    console.error('obsolete-list error:', error);
    return NextResponse.json({ error: 'Failed to fetch obsolete SOPs' }, { status: 500 });
  }
}
