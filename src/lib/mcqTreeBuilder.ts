// New Tree Structure Builder for MCQ Bank
// Builds hierarchy from actual SOP data: Department → Subcategory → SOP → MCQs

import { ISOP } from '@/models/SOP';
import { IMCQBank } from '@/models/MCQBank';

export interface SOPNode {
  sopId: string;
  sopCode: string;
  sopName: string;
  sopFileUrl: string;
  /** When this identifier has a Gujarati SOP, its document URL (so View opens correct language) */
  sopFileUrlGujarati?: string;
  sopFileType: 'pdf' | 'docx';
  mcqBanks: IMCQBank[];
  totalQuestions: number;
  checkedCount: number;
  reviewedCount: number;
  similarCount: number;
}

export interface SubcategoryNode {
  code: string;
  name: string;
  sops: SOPNode[];
  totalSOPs: number;
  totalQuestions: number;
}

export interface DepartmentNode {
  name: string;
  subcategories: Map<string, SubcategoryNode>;
  totalSOPs: number;
  totalQuestions: number;
}

export interface MCQTreeStructure {
  departments: Map<string, DepartmentNode>;
  unorganized: {
    sops: SOPNode[];
    totalSOPs: number;
    totalQuestions: number;
  };
}

/**
 * Extract subcategory code from SOP identifier
 * Examples: "QAMI64-00" → "QAMI", "PRMA45-02" → "PRMA", "MAGE04-05" → "MAGE"
 */
export function extractSubcategoryFromIdentifier(identifier: string): string {
  const match = identifier.toUpperCase().trim().match(/^([A-Z]{2,4})/);
  return match ? match[1] : 'OTHER';
}

/**
 * Get human-readable subcategory name from code
 * Based on the official folder structure
 */
export function getSubcategoryName(code: string): string {
  // Official subcategory mappings
  const nameMap: Record<string, string> = {
    // QA
    'QAGE': 'General',
    
    // QC
    'QCGE': 'General',
    'QAIC': 'Instrument Calibration',
    'QAIO': 'Instrument Operation',
    
    // Microbiology
    'QAMI': 'Microbiology',
    'QCMI': 'Microbiology',
    
    // Production
    'PRAA': 'Aseptic Area',
    'PRCL': 'Cleaning',
    'PRED': 'Eye Drops',
    'PREO': 'Eye Ointment',
    'PREP': 'External Preparation',
    'PRGE': 'General',
    'PRMA': 'Manufacturing',
    'PRPA': 'Packing',
    
    // Store
    'BSGE': 'BSR',
    'STCL': 'Store Cleaning',
    'STGE': 'Store General',
    'STOP': 'Store Operation',
    'STPA': 'Store Packing Material',
    'STRM': 'Store Raw Material',
    
    // Engineering and Maintenance
    'MAGE': 'Maintenance',
    'PREG': 'Engineering',
    
    // Personnel
    'PEGE': 'Personnel General',
    
    // Annexure (typically under QA)
    'ANNE': 'Annexure',
  };

  return nameMap[code] || code;
}

/**
 * Get the correct department for a subcategory code
 * This ensures SOPs are placed in the right department folder
 */
export function getDepartmentForSubcategory(code: string): string {
  const subcategoryToDepartment: Record<string, string> = {
    // QA
    'QAGE': 'QA',
    
    // QC
    'QCGE': 'QC',
    'QAIC': 'QC',
    'QAIO': 'QC',
    
    // Microbiology
    'QAMI': 'Microbiology',
    'QCMI': 'Microbiology',
    
    // Production
    'PRAA': 'Production',
    'PRCL': 'Production',
    'PRED': 'Production',
    'PREO': 'Production',
    'PREP': 'Production',
    'PRGE': 'Production',
    'PRMA': 'Production',
    'PRPA': 'Production',
    
    // Store
    'BSGE': 'Store',
    'STCL': 'Store',
    'STGE': 'Store',
    'STOP': 'Store',
    'STPA': 'Store',
    'STRM': 'Store',
    
    // Engineering and Maintenance
    'MAGE': 'Engineering and Maintenance',
    'PREG': 'Engineering and Maintenance',
    
    // Personnel
    'PEGE': 'Personnel',
    
    // Annexure
    'ANNE': 'QA',  // Annexures typically fall under QA
  };

  return subcategoryToDepartment[code] || ''; // Empty string = unknown → will be treated as unorganized
}

/**
 * Map department names to standardized format
 */
export function normalizeDepartmentName(department: string): string {
  const deptMap: Record<string, string> = {
    // QA variations
    'qa': 'QA',
    'quality assurance': 'QA',
    'quality assurance (qa)': 'QA',
    
    // QC variations
    'qc': 'QC',
    'quality control': 'QC',
    'quality control (qc)': 'QC',
    
    // Microbiology variations
    'microbiology': 'Microbiology',
    'micro': 'Microbiology',
    
    // Production variations
    'production': 'Production',
    'prod': 'Production',
    
    // Store variations
    'store': 'Store',
    'warehouse': 'Store',
    'warehouse / logistics': 'Store',
    'logistics': 'Store',
    
    // Engineering and Maintenance variations
    'engineering and maintenance': 'Engineering and Maintenance',
    'engineering & maintenance': 'Engineering and Maintenance',
    'maintenance / engineering': 'Engineering and Maintenance',
    'maintenance': 'Engineering and Maintenance',
    'engineering': 'Engineering and Maintenance',
    
    // Personnel variations
    'personnel': 'Personnel',
    'hr': 'Personnel',
    'human resources': 'Personnel',
    'human resources (hr)': 'Personnel',
    
    // General - map to QA
    'general': 'QA',
  };

  const normalized = deptMap[department.toLowerCase()];
  return normalized || department;
}

/**
 * Build the complete tree structure from SOPs and MCQ Banks
 */
export function buildMCQTreeStructure(
  sops: ISOP[],
  mcqBanks: IMCQBank[]
): MCQTreeStructure {
  const tree: MCQTreeStructure = {
    departments: new Map(),
    unorganized: {
      sops: [],
      totalSOPs: 0,
      totalQuestions: 0,
    },
  };

  // Create a map of SOP ID to MCQ Banks for quick lookup
  const mcqBanksBySopId = new Map<string, IMCQBank[]>();
  mcqBanks.forEach(bank => {
    const sopId = bank.sopId.toString();
    if (!mcqBanksBySopId.has(sopId)) {
      mcqBanksBySopId.set(sopId, []);
    }
    mcqBanksBySopId.get(sopId)!.push(bank);
  });

  // Also create a map by identifier for fallback matching
  const mcqBanksByIdentifier = new Map<string, IMCQBank[]>();
  mcqBanks.forEach(bank => {
    const identifier = bank.sopIdentifier?.toUpperCase().trim();
    if (identifier) {
      if (!mcqBanksByIdentifier.has(identifier)) {
        mcqBanksByIdentifier.set(identifier, []);
      }
      mcqBanksByIdentifier.get(identifier)!.push(bank);
    }
  });

  // Sort banks by language: English first, then Gujarati (so both appear in same SOP section)
  const LANGUAGE_ORDER = { English: 0, Gujarati: 1 };
  function sortBanksByLanguage(banks: IMCQBank[]): IMCQBank[] {
    return [...banks].sort((a, b) => {
      const langA = (a.language || 'English') as keyof typeof LANGUAGE_ORDER;
      const langB = (b.language || 'English') as keyof typeof LANGUAGE_ORDER;
      return (LANGUAGE_ORDER[langA] ?? 2) - (LANGUAGE_ORDER[langB] ?? 2);
    });
  }

  // Group SOPs by identifier so one node per identifier shows English + Gujarati banks together
  const sopsByIdentifier = new Map<string, ISOP[]>();
  sops.forEach(sop => {
    const identifier = sop.identifier?.toUpperCase().trim();
    if (identifier) {
      if (!sopsByIdentifier.has(identifier)) {
        sopsByIdentifier.set(identifier, []);
      }
      sopsByIdentifier.get(identifier)!.push(sop);
    }
  });

  // Process each unique identifier (one node per SOP identifier; combines all language banks)
  // IMPORTANT: Only include SOPs that have at least one MCQ bank generated
  sopsByIdentifier.forEach((sopsWithId, sopIdentifier) => {
    // Prefer English SOP for display (name, fileUrl, etc.)
    const primarySop = sopsWithId.find(s => s.language === 'English') || sopsWithId[0];
    const sopId = primarySop._id.toString();
    const subcategoryCode = extractSubcategoryFromIdentifier(primarySop.identifier);

    // Collect all MCQ banks for any SOP with this identifier (English + Gujarati)
    const seenBankIds = new Set<string>();
    const allBanksForIdentifier: IMCQBank[] = [];
    for (const sop of sopsWithId) {
      const sid = sop._id.toString();
      const banksBySop = mcqBanksBySopId.get(sid) || [];
      if (banksBySop.length === 0 && sopIdentifier) {
        const byIdent = mcqBanksByIdentifier.get(sopIdentifier) || [];
        for (const bank of byIdent) {
          if (bank.sopId.toString() === sid && !seenBankIds.has(bank._id.toString())) {
            seenBankIds.add(bank._id.toString());
            allBanksForIdentifier.push(bank);
          }
        }
      }
      for (const bank of banksBySop) {
        if (!seenBankIds.has(bank._id.toString())) {
          seenBankIds.add(bank._id.toString());
          allBanksForIdentifier.push(bank);
        }
      }
    }
    // Fallback: any bank with this identifier not yet included (e.g. orphaned by sopId)
    const byIdent = mcqBanksByIdentifier.get(sopIdentifier) || [];
    for (const bank of byIdent) {
      if (!seenBankIds.has(bank._id.toString())) {
        seenBankIds.add(bank._id.toString());
        allBanksForIdentifier.push(bank);
      }
    }

    // ── GATE: Skip SOPs with no MCQ banks at all ─────────────────────────────
    if (allBanksForIdentifier.length === 0) return;

    const sopMCQBanks = sortBanksByLanguage(allBanksForIdentifier);

    const gujaratiSop = sopsWithId.find((s: any) => s.language === 'Gujarati');
    const sopFileUrlGujarati = gujaratiSop?.fileUrl || undefined;

    const totalQuestions = sopMCQBanks.reduce(
      (sum, bank) => sum + (bank.mcqs?.length ?? bank.totalQuestions ?? 0),
      0
    );
    const checkedCount = sopMCQBanks.reduce((sum, bank) => sum + (bank.mcqs?.filter(q => q.isChecked).length || 0), 0);
    const reviewedCount = sopMCQBanks.reduce((sum, bank) => sum + (bank.mcqs?.filter(q => q.isReviewed).length || 0), 0);
    const similarCount = sopMCQBanks.reduce((sum, bank) => sum + (bank.mcqs?.filter(q => q.isSimilar).length || 0), 0);

    const sopNode: SOPNode = {
      sopId,
      sopCode: primarySop.identifier,
      sopName: primarySop.name,
      sopFileUrl: primarySop.fileUrl,
      sopFileUrlGujarati,
      sopFileType: primarySop.fileType,
      mcqBanks: sopMCQBanks,
      totalQuestions,
      checkedCount,
      reviewedCount,
      similarCount,
    };

    const correctDepartment = getDepartmentForSubcategory(subcategoryCode);

    // If the subcategory code is unknown (no mapping), add to unorganized instead of defaulting to QA
    if (!correctDepartment) {
      tree.unorganized.sops.push(sopNode);
      tree.unorganized.totalSOPs++;
      tree.unorganized.totalQuestions += totalQuestions;
      return;
    }

    if (!tree.departments.has(correctDepartment)) {
      tree.departments.set(correctDepartment, {
        name: correctDepartment,
        subcategories: new Map(),
        totalSOPs: 0,
        totalQuestions: 0,
      });
    }
    const dept = tree.departments.get(correctDepartment)!;

    if (!dept.subcategories.has(subcategoryCode)) {
      dept.subcategories.set(subcategoryCode, {
        code: subcategoryCode,
        name: getSubcategoryName(subcategoryCode),
        sops: [],
        totalSOPs: 0,
        totalQuestions: 0,
      });
    }
    const subcat = dept.subcategories.get(subcategoryCode)!;

    subcat.sops.push(sopNode);
    subcat.totalSOPs++;
    subcat.totalQuestions += totalQuestions;

    dept.totalSOPs++;
    dept.totalQuestions += totalQuestions;
  });

  // Handle MCQ banks without corresponding SOPs (orphaned)
  mcqBanks.forEach(bank => {
    const sopId = bank.sopId.toString();
    const sopExists = sops.some(sop => sop._id.toString() === sopId);
    
    if (!sopExists) {
      // This MCQ bank has no SOP - add to unorganized
      const bankQuestionCount = bank.mcqs?.length ?? bank.totalQuestions ?? 0;
      const sopNode: SOPNode = {
        sopId,
        sopCode: bank.sopIdentifier,
        sopName: bank.sopName,
        sopFileUrl: '', // No file available
        sopFileType: 'pdf',
        mcqBanks: [bank],
        totalQuestions: bankQuestionCount,
        checkedCount: bank.mcqs?.filter(q => q.isChecked).length || 0,
        reviewedCount: bank.mcqs?.filter(q => q.isReviewed).length || 0,
        similarCount: bank.mcqs?.filter(q => q.isSimilar).length || 0,
      };

      tree.unorganized.sops.push(sopNode);
      tree.unorganized.totalSOPs++;
      tree.unorganized.totalQuestions += bankQuestionCount;
    }
  });

  return tree;
}

/**
 * Get tree structure as a flat array for easier rendering
 */
export function getTreeAsArray(tree: MCQTreeStructure) {
  // Define the official department order
  const DEPARTMENT_ORDER = [
    'QA',
    'QC',
    'Microbiology',
    'Production',
    'Store',
    'Engineering and Maintenance',
    'Personnel'
  ];

  const result: any[] = [];

  tree.departments.forEach((dept, deptName) => {
    const deptNode = {
      type: 'department',
      name: deptName,
      totalSOPs: dept.totalSOPs,
      totalQuestions: dept.totalQuestions,
      subcategories: [] as any[],
    };

    dept.subcategories.forEach((subcat, subcatCode) => {
      const subcatNode = {
        type: 'subcategory',
        code: subcatCode,
        name: subcat.name,
        totalSOPs: subcat.totalSOPs,
        totalQuestions: subcat.totalQuestions,
        sops: subcat.sops.map(sop => ({
          type: 'sop',
          ...sop,
        })),
      };

      deptNode.subcategories.push(subcatNode);
    });
    
    // Sort subcategories by code
    deptNode.subcategories.sort((a, b) => a.code.localeCompare(b.code));

    result.push(deptNode);
  });

  // Sort departments by official order
  result.sort((a, b) => {
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

  return result;
}
