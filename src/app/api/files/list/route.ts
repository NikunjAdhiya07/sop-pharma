import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Fetch all SOPs sorted by upload date (newest first)
    const sops = await SOP.find({})
      .sort({ uploadedAt: -1 })
      .select('name identifier department fileUrl fileType uploadedAt status mcqCount metadata')
      .lean();

    // Transform to match the FileItem interface
    const files = sops.map(sop => ({
      _id: sop._id.toString(),
      fileName: sop.fileUrl ? sop.fileUrl.split('/').pop() || 'unknown' : 'unknown',
      sopName: sop.name,
      sopIdentifier: sop.identifier,
      department: sop.department,
      fileType: sop.fileType,
      fileSize: sop.metadata?.fileSize || 0,
      uploadedAt: sop.uploadedAt,
      status: sop.status,
      mcqCount: sop.mcqCount || 0,
      wordCount: sop.metadata?.wordCount,
    }));

    return NextResponse.json({
      success: true,
      files,
      count: files.length,
    });

  } catch (error) {
    console.error('Error fetching files:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch files',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
