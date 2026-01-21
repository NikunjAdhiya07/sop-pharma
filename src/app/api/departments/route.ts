import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MCQBank from '@/models/MCQBank';

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    
    // Get unique departments from MCQBank
    const departments = await MCQBank.distinct('department');
    
    return NextResponse.json({
      success: true,
      departments: departments.length > 0 ? departments : ['General']
    });
  } catch (error) {
    console.error('Error fetching departments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch departments' },
      { status: 500 }
    );
  }
}
