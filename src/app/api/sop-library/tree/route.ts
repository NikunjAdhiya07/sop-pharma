import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import SOPLibrary from '@/models/SOPLibrary';

export async function GET(request: Request) {
  try {
    await dbConnect();

    // Get department filter from query params
    const { searchParams } = new URL(request.url);
    const departmentFilter = searchParams.get('department');

    // Fetch all SOP libraries
    const query = departmentFilter && departmentFilter !== 'all' 
      ? { department: departmentFilter }
      : {};
    
    const sopLibraries = await SOPLibrary.find(query)
      .populate('mcqBankId')
      .lean();

    // Group SOPs by department (simple organization, no subcategories)
    const departmentMap: Record<string, any[]> = {};
    
    sopLibraries.forEach((sop: any) => {
      const dept = sop.department || 'Uncategorized';
      if (!departmentMap[dept]) {
        departmentMap[dept] = [];
      }
      departmentMap[dept].push(sop);
    });

    // Build simple tree structure - each department is a folder with all its SOPs
    const tree = Object.entries(departmentMap).map(([deptName, sops]) => {
      const totalVideos = sops.reduce((sum: number, sop: any) => sum + (sop.videos?.length || 0), 0);
      const totalSlides = sops.reduce((sum: number, sop: any) => sum + (sop.slides?.length || 0), 0);

      return {
        name: deptName,
        subcategories: [
          {
            name: 'All SOPs',
            code: deptName,
            sops: sops,
            totalSOPs: sops.length,
            totalVideos: totalVideos,
            totalSlides: totalSlides
          }
        ],
        totalSOPs: sops.length,
        totalVideos: totalVideos,
        totalSlides: totalSlides
      };
    }).filter(dept => dept.totalSOPs > 0);

    return NextResponse.json({
      success: true,
      tree
    });
  } catch (error) {
    console.error('Error fetching SOP tree:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch SOP tree' },
      { status: 500 }
    );
  }
}
