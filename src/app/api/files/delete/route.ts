import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import { unlink } from 'fs/promises';
import path from 'path';

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'File ID is required' },
        { status: 400 }
      );
    }

    // Find the SOP
    const sop = await SOP.findById(id);
    if (!sop) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Delete associated MCQ Bank if exists
    await MCQBank.deleteOne({ sopId: id });

    // Delete the physical file
    try {
      const filePath = path.join(process.cwd(), sop.fileUrl);
      await unlink(filePath);
    } catch (err) {
      console.error('Error deleting physical file:', err);
      // Continue even if file deletion fails
    }

    // Delete the SOP document
    await SOP.findByIdAndDelete(id);

    return NextResponse.json({
      success: true,
      message: 'File and associated MCQs deleted successfully',
    });

  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete file',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
