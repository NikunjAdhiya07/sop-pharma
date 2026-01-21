import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();
    
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'MCQ Bank ID is required' },
        { status: 400 }
      );
    }

    const mcqBank = await MCQBank.findById(id).lean();

    if (!mcqBank) {
      return NextResponse.json(
        { success: false, error: 'MCQ Bank not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      mcqBank,
    });

  } catch (error) {
    console.error('Error fetching MCQ Bank:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to fetch MCQ Bank',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
