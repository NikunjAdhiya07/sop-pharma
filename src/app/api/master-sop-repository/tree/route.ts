import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import MasterSOPRepository from '@/models/MasterSOPRepository';

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Fetch all SOPs
    const allSOPs = await MasterSOPRepository.find({}).lean();

    // Build tree structure
    const departmentMap = new Map<string, any>();

    allSOPs.forEach((sop) => {
      const dept = sop.department;
      
      if (!departmentMap.has(dept)) {
        departmentMap.set(dept, {
          name: dept,
          subcategories: new Map<string, any>(),
          totalSOPs: 0
        });
      }

      const deptNode = departmentMap.get(dept);
      deptNode.totalSOPs++;

      // Parse folder path structure:
      // Expected: Department / [Subcategory] / SOP_Folder / File
      // Example 1: 6. ENGINEERING / MAGE - MAINTENANCE / MAGE01-07... / File.docx
      // Example 2: PRODUCTION / PRAA01-05... / File.docx (No subcategory)
      
      const folderPath = sop.folderPath || '';
      const pathParts = folderPath.split('/').filter(Boolean);
      
      // Determine Subcategory and SOP Folder
      let subcategoryName = 'General';
      let sopFolderName = 'Uncategorized';

      if (pathParts.length >= 3) {
        // Has subcategory: [0]=Dept, [1]=Subcategory, [2]=SOP Folder
        subcategoryName = pathParts[1];
        sopFolderName = pathParts[pathParts.length - 1]; // Last part is always the SOP folder of the document
      } else if (pathParts.length === 2) {
        // No subcategory: [0]=Dept, [1]=SOP Folder
        sopFolderName = pathParts[1];
      } else if (pathParts.length === 1) {
        sopFolderName = pathParts[0];
      }

      // Initialize Subcategory Node
      if (!deptNode.subcategories.has(subcategoryName)) {
        deptNode.subcategories.set(subcategoryName, {
          name: subcategoryName,
          sopFolders: new Map<string, any>(),
          totalSOPs: 0
        });
      }
      
      const subcategoryNode = deptNode.subcategories.get(subcategoryName);
      subcategoryNode.totalSOPs++;

      // Initialize SOP Folder Node
      if (!subcategoryNode.sopFolders.has(sopFolderName)) {
        subcategoryNode.sopFolders.set(sopFolderName, {
          name: sopFolderName,
          path: folderPath,
          sops: []
        });
      }

      const sopFolderNode = subcategoryNode.sopFolders.get(sopFolderName);
      sopFolderNode.sops.push({
        ...sop,
        _id: sop._id.toString()
      });
    });

    // Convert maps to arrays
    const tree = Array.from(departmentMap.values()).map(dept => ({
      name: dept.name,
      totalSOPs: dept.totalSOPs,
      subcategories: Array.from(dept.subcategories.values()).map((subcat: any) => ({
        name: subcat.name,
        totalSOPs: subcat.totalSOPs,
        sopFolders: Array.from(subcat.sopFolders.values())
      }))
    }));

    // Sort departments by name
    tree.sort((a, b) => a.name.localeCompare(b.name));

    // Sort subcategories and SOP folders
    tree.forEach(dept => {
      dept.subcategories.sort((a: any, b: any) => {
        if (a.name === 'General') return -1; // General first
        if (b.name === 'General') return 1;
        return a.name.localeCompare(b.name);
      });
      
      dept.subcategories.forEach((subcat: any) => {
        subcat.sopFolders.sort((a: any, b: any) => a.name.localeCompare(b.name));
        
        // Sort SOPs
        subcat.sopFolders.forEach((folder: any) => {
          folder.sops.sort((a: any, b: any) => a.sopIdentifier.localeCompare(b.sopIdentifier));
        });
      });
    });

    return NextResponse.json({
      success: true,
      tree,
      stats: {
        totalDepartments: tree.length,
        totalSOPs: allSOPs.length,
        totalSubcategories: tree.reduce((acc, dept) => acc + dept.subcategories.length, 0)
      }
    });

  } catch (error) {
    console.error('[API] Error building SOP tree:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to build SOP tree',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
