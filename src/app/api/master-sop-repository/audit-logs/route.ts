import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import AuditLog from '@/models/AuditLog';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const skip = (page - 1) * limit;

    // Fetch only FOLDER_UPLOAD audit logs
    const logs = await AuditLog.find({ action: 'FOLDER_UPLOAD' })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalLogs = await AuditLog.countDocuments({ action: 'FOLDER_UPLOAD' });
    const totalPages = Math.ceil(totalLogs / limit);

    return NextResponse.json({
      success: true,
      logs,
      pagination: {
        page,
        limit,
        totalLogs,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch audit logs',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
