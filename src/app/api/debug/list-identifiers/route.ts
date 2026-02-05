import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';

export async function GET() {
  try {
    await connectDB();

    // Get all unique identifiers
    const sops = await SOP.find({}, { identifier: 1, name: 1 }).limit(50).lean();

    return NextResponse.json({
      success: true,
      count: sops.length,
      identifiers: sops.map(s => ({
        identifier: s.identifier,
        name: s.name,
      })),
    });

  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
