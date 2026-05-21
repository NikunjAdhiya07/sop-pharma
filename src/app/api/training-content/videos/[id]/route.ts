import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import TrainingVideo from '@/models/TrainingVideo';
import { deleteFromBunny } from '@/lib/bunnyStorage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const doc = await TrainingVideo.findById(id).lean();
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ video: doc });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const allowed = ['title', 'department', 'designation', 'sopNo', 'version', 'description'];
  const update: Record<string, any> = {};
  for (const key of allowed) {
    if (key in body) {
      const v = body[key];
      update[key] = typeof v === 'string' ? v.trim() : v;
    }
  }
  const doc = await TrainingVideo.findByIdAndUpdate(id, update, { new: true }).lean();
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, video: doc });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connectDB();
  const { id } = await params;
  const doc = await TrainingVideo.findById(id);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Remove from Bunny first; if it fails, still soft-delete the DB row.
  if (doc.storagePath) {
    try { await deleteFromBunny(doc.storagePath); } catch { /* best effort */ }
  }
  if (doc.thumbnailStoragePath) {
    try { await deleteFromBunny(doc.thumbnailStoragePath); } catch { /* best effort */ }
  }

  await TrainingVideo.findByIdAndDelete(id);
  return NextResponse.json({ ok: true });
}
