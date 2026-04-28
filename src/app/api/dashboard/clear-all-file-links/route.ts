import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPLibrary from '@/models/SOPLibrary';
import SOPVersionArtifacts from '@/models/SOPVersionArtifacts';
import SupersedeSOPVersion from '@/models/SupersedeSOPVersion';
import { invalidateDashboardSopsCache } from '@/lib/dashboardSopsCache';

export const dynamic = 'force-dynamic';

/**
 * POST /api/dashboard/clear-all-file-links
 *
 * Bulk-nulls every file URL stored in the DB across all SOP-related models.
 * Use this after manually deleting files from Bunny so the dashboard reflects
 * the missing state without needing a full Bunny recheck.
 */
export async function POST() {
  try {
    await connectDB();

    // 1. SOP.fileUrl → empty string (field is required so we can't use null)
    const sopRes = await SOP.updateMany(
      { fileUrl: { $exists: true, $ne: '' } },
      { $set: { fileUrl: '' } },
    );

    // 2. SOPLibrary.sopDocuments — pull all subdocs that have a filePath
    const libRes = await SOPLibrary.updateMany(
      { 'sopDocuments.filePath': { $exists: true, $ne: '' } },
      { $pull: { sopDocuments: { filePath: { $exists: true, $ne: '' } } } },
    );

    // 3. SOPVersionArtifacts — unset docxPath and pdfPath on every entry
    const artDocxRes = await SOPVersionArtifacts.updateMany(
      { 'entries.docxPath': { $exists: true } },
      { $unset: { 'entries.$[].docxPath': '' } },
    );
    const artPdfRes = await SOPVersionArtifacts.updateMany(
      { 'entries.pdfPath': { $exists: true } },
      { $unset: { 'entries.$[].pdfPath': '' } },
    );

    // 4. SupersedeSOPVersion — unset docxPath and pdfPath
    const supDocxRes = await SupersedeSOPVersion.updateMany(
      { docxPath: { $exists: true } },
      { $unset: { docxPath: '' } },
    );
    const supPdfRes = await SupersedeSOPVersion.updateMany(
      { pdfPath: { $exists: true } },
      { $unset: { pdfPath: '' } },
    );

    // Bust cached dashboard data so next fetch reflects cleared state
    invalidateDashboardSopsCache();

    const totalCleared =
      sopRes.modifiedCount +
      libRes.modifiedCount +
      artDocxRes.modifiedCount +
      artPdfRes.modifiedCount +
      supDocxRes.modifiedCount +
      supPdfRes.modifiedCount;

    return Response.json({
      success: true,
      cleared: {
        sops: sopRes.modifiedCount,
        sopLibraryDocs: libRes.modifiedCount,
        versionArtifacts: artDocxRes.modifiedCount + artPdfRes.modifiedCount,
        superseded: supDocxRes.modifiedCount + supPdfRes.modifiedCount,
        total: totalCleared,
      },
    });
  } catch (err) {
    console.error('[clear-all-file-links]', err);
    return Response.json(
      { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
