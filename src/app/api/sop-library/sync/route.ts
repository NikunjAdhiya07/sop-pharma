import { NextRequest, NextResponse } from 'next/server';
import { performSOPLibrarySync } from '@/lib/sopLibrarySync';

// POST - Sync existing SOPs and MCQ Banks into SOP Library
export async function POST(request: NextRequest) {
  try {
    const stats = await performSOPLibrarySync();

    return NextResponse.json({
      success: true,
      message: 'SOP Library sync completed',
      stats,
    });
  } catch (error: any) {
    console.error('Error syncing SOP library:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to sync SOP library', details: error.message },
      { status: 500 }
    );
  }
}
