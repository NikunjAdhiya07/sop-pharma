import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';

export async function GET(req: NextRequest) {
  try {
    await connectDB();
    const identifier = req.nextUrl.searchParams.get('identifier');
    if (!identifier) {
      return NextResponse.json({ error: 'identifier is required' }, { status: 400 });
    }
    const rows = await SOP.find({ identifier })
      .select('_id identifier name department language')
      .lean();
    return NextResponse.json({
      siblings: rows.map((r: any) => ({
        sopId: String(r._id),
        sopIdentifier: r.identifier,
        sopName: r.name,
        department: r.department,
        language: r.language,
      })),
    });
  } catch (err) {
    console.error('[pipeline/siblings]', err);
    return NextResponse.json({ error: 'Failed to fetch siblings' }, { status: 500 });
  }
}
