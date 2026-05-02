import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import SOPLibrary from '@/models/SOPLibrary';
import SOP from '@/models/SOP';
import MasterSOPRepository from '@/models/MasterSOPRepository';
import { performSOPLibrarySync } from '@/lib/sopLibrarySync';
import { 
  extractSubcategoryFromIdentifier, 
  getSubcategoryName, 
  getDepartmentForSubcategory 
} from '@/lib/mcqTreeBuilder';

// Define the official department order (same as MCQ Bank)
const DEPARTMENT_ORDER = [
  'QA',
  'QC',
  'Microbiology',
  'Production',
  'Store',
  'Engineering and Maintenance',
  'Personnel'
];

export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    // Get department filter from query params
    const { searchParams } = new URL(request.url);
    const departmentFilter = searchParams.get('department');

    // Valid SOP identifier pattern: QAGE01-10, QCMI50-00, PRMA01-02, etc.
    const validIdentifierPattern = /^[A-Z]{2,4}\d{2,3}-\d{2}$/i;

    // Fetch all SOP libraries (no filter by department field - we'll organize by subcategory code)
    const allSopLibraries = await SOPLibrary.find({})
      .populate('mcqBankId', 'totalQuestions difficultyDistribution') // Exclude mcqs!
      .populate({
         path: 'sopId',
         select: 'reviewDate expiryDate version'
      })
      .lean();

    // Filter out annexures, temp files, and invalid identifiers
    const sopLibraries = allSopLibraries.filter((sop: any) => {
      const identifier = (sop.sopIdentifier || '').toLowerCase();
      const name = (sop.sopName || '').toLowerCase();
      
      // Exclude temp files
      if (name.startsWith('~$') || identifier.startsWith('~$')) return false;
      
      // Exclude annexures
      if (identifier.includes('annexure') || name.includes('annexure')) return false;
      
      // Exclude invalid identifiers
      if (!validIdentifierPattern.test(sop.sopIdentifier)) return false;
      
      return true;
    });

    // Use the populated data directly. No need to fetch MasterSOPRepository separately
    // as SOPLibrary sync should handle the source of truth if configured correctly.
    // For now, we rely on the populated sopId.
    sopLibraries.forEach((sop: any) => {
      if (sop.sopId) {
        sop.masterRepoData = {
          reviewDate: sop.sopId.reviewDate,
          expiryDate: sop.sopId.expiryDate,
          version: sop.sopId.version
        };
      }

      // If we don't have mcqBankId populated, or totalMCQs is missing, ensure it's at least 0
      if (!sop.metadata) sop.metadata = {};
      if (sop.metadata.totalMCQs === undefined) {
        sop.metadata.totalMCQs = sop.mcqBankId?.totalQuestions || 0;
      }
    });

    console.log(`📚 Building SOP Library tree from ${sopLibraries.length} valid SOPs (filtered ${allSopLibraries.length - sopLibraries.length} invalid entries)`);

    // Define types for better type safety
    interface SubcategoryNode {
      code: string;
      name: string;
      sops: any[];
      totalVideos: number;
      totalSlides: number;
      totalMCQs: number;
    }

    interface DepartmentNode {
      name: string;
      subcategories: Map<string, SubcategoryNode>;
      totalSOPs: number;
      totalVideos: number;
      totalSlides: number;
      totalMCQs: number;
    }

    // Build hierarchical tree structure using subcategory codes (SAME AS MCQ BANK)
    const departmentMap = new Map<string, DepartmentNode>();
    
    sopLibraries.forEach((sop: any) => {
      // Extract subcategory code from SOP identifier (e.g., "QAMI64-00" → "QAMI")
      const subcategoryCode = extractSubcategoryFromIdentifier(sop.sopIdentifier);
      
      // Get the CORRECT department for this subcategory (based on code, not DB field)
      const correctDepartment = getDepartmentForSubcategory(subcategoryCode);
      
      // Skip if department filter is active and doesn't match
      if (departmentFilter && departmentFilter !== 'all' && correctDepartment !== departmentFilter) {
        return;
      }
      
      // Get human-readable subcategory name
      const subcategoryName = getSubcategoryName(subcategoryCode);
      
      // Get or create department
      if (!departmentMap.has(correctDepartment)) {
        departmentMap.set(correctDepartment, {
          name: correctDepartment,
          subcategories: new Map<string, SubcategoryNode>(),
          totalSOPs: 0,
          totalVideos: 0,
          totalSlides: 0,
          totalMCQs: 0
        });
      }

      const deptNode = departmentMap.get(correctDepartment)!;
      
      // Get or create subcategory
      if (!deptNode.subcategories.has(subcategoryCode)) {
        deptNode.subcategories.set(subcategoryCode, {
          code: subcategoryCode,
          name: subcategoryName,
          sops: [],
          totalVideos: 0,
          totalSlides: 0,
          totalMCQs: 0
        });
      }

      const subcatNode = deptNode.subcategories.get(subcategoryCode)!;
      
      // Add SOP to subcategory
      subcatNode.sops.push(sop);
      subcatNode.totalVideos += sop.videos?.length || 0;
      subcatNode.totalSlides += sop.slides?.length || 0;
      subcatNode.totalMCQs += sop.metadata?.totalMCQs || 0;
      
      // Update department totals
      deptNode.totalSOPs++;
      deptNode.totalVideos += sop.videos?.length || 0;
      deptNode.totalSlides += sop.slides?.length || 0;
      deptNode.totalMCQs += sop.metadata?.totalMCQs || 0;
    });

    // Convert maps to arrays
    const tree = Array.from(departmentMap.values()).map((dept: DepartmentNode) => ({
      name: dept.name,
      totalSOPs: dept.totalSOPs,
      totalVideos: dept.totalVideos,
      totalSlides: dept.totalSlides,
      totalMCQs: dept.totalMCQs,
      subcategories: Array.from(dept.subcategories.values()).map((subcat: SubcategoryNode) => ({
        code: subcat.code,
        name: subcat.name,
        sops: subcat.sops.sort((a: any, b: any) => a.sopIdentifier.localeCompare(b.sopIdentifier)),
        totalSOPs: subcat.sops.length,
        totalVideos: subcat.totalVideos,
        totalSlides: subcat.totalSlides,
        totalMCQs: subcat.totalMCQs
      }))
    }));

    // Sort departments by official order (SAME AS MCQ BANK)
    tree.sort((a, b) => {
      const indexA = DEPARTMENT_ORDER.indexOf(a.name);
      const indexB = DEPARTMENT_ORDER.indexOf(b.name);
      
      // If both are in the official order, sort by position
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      
      // If only one is in the official order, it comes first
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      
      // If neither is in the official order, sort alphabetically
      return a.name.localeCompare(b.name);
    });

    // Sort subcategories within each department by code (alphabetically)
    tree.forEach(dept => {
      dept.subcategories.sort((a: any, b: any) => a.code.localeCompare(b.code));
    });

    console.log(`✅ Built tree with ${tree.length} departments`);

    return NextResponse.json({
      success: true,
      tree,
      stats: {
        totalDepartments: tree.length,
        totalSOPs: sopLibraries.length,
        totalSubcategories: tree.reduce((acc, dept) => acc + dept.subcategories.length, 0)
      }
    }, {
      headers: {
        // Browser cache for 60s, use stale data for up to 5 mins while revalidating
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
      }
    });
  } catch (error) {
    console.error('❌ Error fetching SOP tree:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch SOP tree' },
      { status: 500 }
    );
  }
}
