import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import ApplicableFinding from '@/models/ApplicableFinding';
import ComplianceReport from '@/models/ComplianceReport';
import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(GEMINI_KEY);

/**
 * ═══════════════════════════════════════════════════════════════════════
 * POST /api/compliance/applicable-findings
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Mark findings as applicable and compile verbiage by SOP section
 */
export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    
    const body = await request.json();
    const { reportId, findingIds, userId } = body;
    
    if (!reportId || !findingIds || !Array.isArray(findingIds) || findingIds.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: reportId, findingIds',
      }, { status: 400 });
    }
    
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'User authentication required',
      }, { status: 401 });
    }
    
    // Fetch the compliance report
    const report = await ComplianceReport.findById(reportId);
    if (!report) {
      return NextResponse.json({
        success: false,
        error: 'Compliance report not found',
      }, { status: 404 });
    }
    
    // Extract the selected findings
    const selectedFindings = report.findings.filter((f: any) => 
      findingIds.includes(f._id?.toString() || f.findingId)
    );
    
    if (selectedFindings.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No valid findings found with the provided IDs',
      }, { status: 404 });
    }
    
    // Group findings by SOP section
    const sectionGroups = new Map<string, any[]>();
    
    for (const finding of selectedFindings) {
      const sectionKey = finding.sopSectionAffected || 'Unknown Section';
      if (!sectionGroups.has(sectionKey)) {
        sectionGroups.set(sectionKey, []);
      }
      sectionGroups.get(sectionKey)!.push(finding);
    }
    
    // Process each section group
    const createdRecords = [];
    
    for (const [sectionKey, findings] of sectionGroups.entries()) {
      // Extract section number and title
      const sectionMatch = sectionKey.match(/Section\s+([\d.]+)\s*[-–]?\s*(.*)/i);
      const sectionNumber = sectionMatch ? sectionMatch[1] : sectionKey;
      const sectionTitle = sectionMatch ? sectionMatch[2].trim() : sectionKey;
      
      // Check if this section already has an applicable finding record
      let applicableRecord = await ApplicableFinding.findOne({
        reportId,
        sopSection: sectionKey,
      });
      
      if (!applicableRecord) {
        // Create new record
        applicableRecord = new ApplicableFinding({
          reportId,
          sopId: report.sopId,
          sopIdentifier: report.sopIdentifier,
          sopName: report.sopName,
          department: report.department,
          sopSection: sectionKey,
          sopSectionTitle: sectionTitle,
          sopSectionNumber: sectionNumber,
          findings: [],
          compiledVerbiage: '',
          compilationMethod: 'auto',
        });
      }
      
      // Add findings to the record (avoid duplicates)
      for (const finding of findings) {
        const findingId = finding._id?.toString() || finding.findingId || `finding-${Date.now()}`;
        const exists = applicableRecord.findings.some((f: any) => f.findingId === findingId);
        
        if (!exists) {
          applicableRecord.findings.push({
            findingId,
            guidelineName: finding.guidelineName,
            clauseNumber: finding.clauseNumber,
            clauseTitle: finding.clauseTitle,
            issueSeverity: finding.issueSeverity,
            specificGap: finding.mismatchExplanation || finding.highlightedIssue || 'Gap identified',
            suggestedAction: finding.suggestedAction,
            proposedVerbiage: finding.suggestedText,
            markedAt: new Date(),
            markedBy: userId,
          });
        }
      }
      
      // Compile verbiage using AI
      const compiledText = await compileVerbiageForSection(
        sectionKey,
        sectionTitle,
        applicableRecord.findings
      );
      
      applicableRecord.compiledVerbiage = compiledText;
      applicableRecord.compiledAt = new Date();
      applicableRecord.compiledBy = userId;
      
      await applicableRecord.save();
      createdRecords.push(applicableRecord);
    }
    
    return NextResponse.json({
      success: true,
      message: `Marked ${selectedFindings.length} finding(s) as applicable across ${createdRecords.length} section(s)`,
      data: {
        sectionsProcessed: createdRecords.length,
        findingsMarked: selectedFindings.length,
        sections: createdRecords.map(r => ({
          id: r._id,
          section: r.sopSection,
          findingsCount: r.findings.length,
          compiledVerbiage: r.compiledVerbiage,
        })),
      },
    });
    
  } catch (error) {
    console.error('Error marking findings as applicable:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to mark findings as applicable',
      details: (error as Error).message,
    }, { status: 500 });
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * GET /api/compliance/applicable-findings?reportId=xxx
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Fetch all applicable findings for a report, grouped by section
 */
export async function GET(request: NextRequest) {
  try {
    await dbConnect();
    
    const { searchParams } = new URL(request.url);
    const reportId = searchParams.get('reportId');
    const sopId = searchParams.get('sopId');
    
    let query: any = {};
    if (reportId) {
      query.reportId = reportId;
    } else if (sopId) {
      query.sopId = sopId;
    } else {
      return NextResponse.json({
        success: false,
        error: 'Missing reportId or sopId parameter',
      }, { status: 400 });
    }
    
    const applicableFindings = await ApplicableFinding.find(query)
      .populate('markedBy', 'name username')
      .populate('compiledBy', 'name username')
      .populate('implementedBy', 'name username')
      .sort({ sopSectionNumber: 1 });
    
    return NextResponse.json({
      success: true,
      data: applicableFindings,
      count: applicableFindings.length,
    });
    
  } catch (error) {
    console.error('Error fetching applicable findings:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch applicable findings',
      details: (error as Error).message,
    }, { status: 500 });
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * PATCH /api/compliance/applicable-findings
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Update implementation status or recompile verbiage
 */
export async function PATCH(request: NextRequest) {
  try {
    await dbConnect();
    
    const body = await request.json();
    const { id, action, userId, implementationNotes } = body;
    
    if (!id || !action) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: id, action',
      }, { status: 400 });
    }
    
    const applicableRecord = await ApplicableFinding.findById(id);
    if (!applicableRecord) {
      return NextResponse.json({
        success: false,
        error: 'Applicable finding record not found',
      }, { status: 404 });
    }
    
    switch (action) {
      case 'recompile':
        // Recompile the verbiage
        const recompiledText = await compileVerbiageForSection(
          applicableRecord.sopSection,
          applicableRecord.sopSectionTitle,
          applicableRecord.findings
        );
        applicableRecord.compiledVerbiage = recompiledText;
        applicableRecord.compiledAt = new Date();
        applicableRecord.compiledBy = userId;
        break;
        
      case 'mark-in-progress':
        applicableRecord.implementationStatus = 'in-progress';
        break;
        
      case 'mark-completed':
        applicableRecord.implementationStatus = 'completed';
        applicableRecord.implementedAt = new Date();
        applicableRecord.implementedBy = userId;
        if (implementationNotes) {
          applicableRecord.implementationNotes = implementationNotes;
        }
        break;
        
      case 'mark-rejected':
        applicableRecord.implementationStatus = 'rejected';
        if (implementationNotes) {
          applicableRecord.implementationNotes = implementationNotes;
        }
        break;
        
      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}`,
        }, { status: 400 });
    }
    
    await applicableRecord.save();
    
    return NextResponse.json({
      success: true,
      message: `Action "${action}" completed successfully`,
      data: applicableRecord,
    });
    
  } catch (error) {
    console.error('Error updating applicable finding:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update applicable finding',
      details: (error as Error).message,
    }, { status: 500 });
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * AI COMPILATION HELPER
 * ═══════════════════════════════════════════════════════════════════════
 */
async function compileVerbiageForSection(
  sectionKey: string,
  sectionTitle: string,
  findings: any[]
): Promise<string> {
  if (findings.length === 0) {
    return '';
  }
  
  // If only one finding, return its proposed verbiage
  if (findings.length === 1) {
    return findings[0].proposedVerbiage || '';
  }
  
  // Multiple findings - use AI to compile
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const prompt = `You are a pharmaceutical SOP compliance expert. You need to create a comprehensive, well-written section text that addresses ALL the compliance issues identified below.

**SOP Section:** ${sectionKey} - ${sectionTitle}

**Issues to Address:**
${findings.map((f, idx) => `
${idx + 1}. **Guideline:** ${f.guidelineName} - ${f.clauseTitle}
   **Gap:** ${f.specificGap}
   **Proposed Text:** ${f.proposedVerbiage}
`).join('\n')}

**Task:**
Create a single, cohesive paragraph or section text that:
1. Incorporates ALL the proposed changes above
2. Maintains a professional, regulatory-compliant tone
3. Ensures no contradictions between different requirements
4. Flows naturally as a single section
5. Is ready to be directly inserted into the SOP

**Output Format:**
Provide ONLY the compiled section text, without any explanations, headers, or metadata. The text should be ready to copy-paste into the SOP document.`;

    const result = await model.generateContent(prompt);
    const compiledText = result.response.text().trim();
    
    return compiledText;
    
  } catch (error) {
    console.error('Error compiling verbiage with AI:', error);
    // Fallback: concatenate all proposed verbiage
    return findings.map(f => f.proposedVerbiage).join('\n\n');
  }
}
