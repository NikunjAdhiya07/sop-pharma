import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import ArchivedMCQBank from '@/models/ArchivedMCQBank';
import mongoose from 'mongoose';

const DELETE_PASSWORD = 'Nik1234';

/**
 * POST /api/mcq-bank/delete-sop
 * Delete an SOP and its MCQ bank permanently (with password authentication).
 * Body: { sopId: string, password: string }
 */
export async function POST(request: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error: 'Delete from MCQ Bank has been disabled. Use Dashboard → Mark Obsolete instead.',
    },
    { status: 410 },
  );
}
