import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';

export async function GET(request: NextRequest) {
  await connectDB();
  const id = request.nextUrl.searchParams.get('id') || 'QCMI07-00';

  const sops = await SOP.find({
    identifier: { $regex: new RegExp(id.replace(/[-]/g, '.?'), 'i') }
  }).select('_id identifier name language status content mcqCount createdAt').lean() as any[];

  const result = sops.map((s: any) => ({
    _id: s._id,
    identifier: s.identifier,
    name: s.name,
    language: s.language,
    status: s.status,
    contentLength: s.content?.length ?? 0,
    mcqCount: s.mcqCount,
    createdAt: s.createdAt,
  }));

  // Also check MCQ banks
  const banks = await MCQBank.find({
    sopId: { $in: sops.map((s: any) => s._id) }
  }).select('sopId sopIdentifier language totalQuestions').lean() as any[];

  return NextResponse.json({ sops: result, banks });
}
