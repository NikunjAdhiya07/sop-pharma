import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPGuideline from '@/models/SOPGuideline';
import ComplianceReport from '@/models/ComplianceReport';
import { analyzeSOPCompliance, filterRelevantGuidelines } from '@/lib/complianceEngine';

/**
 * API Endpoint: Batch Analyze All SOPs Against Guidelines
 * 
 * Analyzes all SOPs (or filtered by department) against guidelines
 * Useful for bulk compliance checks
 */

export async function POST(request: NextRequest) {
  console.log('🔍 Starting batch SOP compliance analysis...');
  const startTime = Date.now();

  try {
    await dbConnect();

    const body = await request.json();
    const { department, userId, maxSOPs = 10 } = body;

    // Step 1: Fetch SOPs
    console.log(`📄 Fetching SOPs...`);
    
    const sopQuery: any = { status: 'completed' };
    if (department) {
      sopQuery.department = department;
    }

    const sops = await SOP.find(sopQuery)
      .limit(maxSOPs)
      .sort({ uploadedAt: -1 });

    console.log(`✅ Found ${sops.length} SOPs to analyze`);

    if (sops.length === 0) {
      return NextResponse.json(
        { error: 'No SOPs found' },
        { status: 400 }
      );
    }

    // Step 2: Fetch all guidelines
    console.log(`📚 Fetching guidelines...`);
    
    const guidelines = await SOPGuideline.find({ ocrStatus: 'completed' });
    console.log(`✅ Found ${guidelines.length} guidelines`);

    if (guidelines.length === 0) {
      return NextResponse.json(
        { error: 'No guidelines found. Please upload guidelines first.' },
        { status: 400 }
      );
    }

    // Step 3: Extract all clauses
    const allClauses = guidelines.flatMap(guideline =>
      guideline.clauses.map(clause => ({
        guidelineId: guideline._id,
        guidelineName: guideline.name,
        folderName: guideline.folderName,
        pdfName: guideline.pdfName,
        clauseNumber: clause.clauseNumber,
        clauseTitle: clause.clauseTitle,
        clauseText: clause.clauseText,
        keywords: clause.keywords,
      }))
    );

    console.log(`✅ Total clauses extracted: ${allClauses.length}`);

    // Step 4: Analyze each SOP
    const results: any[] = [];
    const errors: any[] = [];

    for (let i = 0; i < sops.length; i++) {
      const sop = sops[i];
      console.log(`\n📊 Analyzing SOP ${i + 1}/${sops.length}: ${sop.name}`);

      try {
        // Filter relevant clauses for this SOP
        const relevantClauses = filterRelevantGuidelines(
          allClauses,
          sop.department,
          sop.content
        );

        const clausesToCheck = relevantClauses.length > 0 ? relevantClauses : allClauses;
        const limitedClauses = clausesToCheck.slice(0, 30); // Limit for batch processing

        console.log(`   - Checking ${limitedClauses.length} clauses`);

        // Perform analysis
        const analysisResult = await analyzeSOPCompliance({
          sopContent: sop.content,
          sopName: sop.name,
          sopIdentifier: sop.identifier,
          guidelineClauses: limitedClauses,
        });

        // Save report
        const complianceReport = new ComplianceReport({
          sopId: sop._id,
          sopIdentifier: sop.identifier,
          sopName: sop.name,
          sopVersion: sop.version || '1.0',
          department: sop.department,
          overallScore: analysisResult.overallScore,
          complianceStatus: analysisResult.complianceStatus,
          findings: analysisResult.findings.map(finding => ({
            guidelineId: finding.guidelineName,
            guidelineName: finding.guidelineName,
            folderName: finding.folderName,
            pdfName: finding.pdfName,
            clauseNumber: finding.clauseNumber,
            clauseTitle: finding.clauseTitle,
            clauseText: finding.clauseText,
            complianceLevel: finding.complianceLevel,
            matchConfidence: finding.matchConfidence,
            sopSectionAffected: finding.sopSectionAffected,
            mismatchExplanation: finding.mismatchExplanation,
            suggestedAction: finding.suggestedAction,
            sopTextSnippet: finding.sopTextSnippet,
            highlightedIssue: finding.highlightedIssue,
          })),
          totalGuidelinesChecked: analysisResult.totalGuidelinesChecked,
          compliantCount: analysisResult.compliantCount,
          partialCount: analysisResult.partialCount,
          nonCompliantCount: analysisResult.nonCompliantCount,
          analyzedAt: new Date(),
          analyzedBy: userId,
          analysisEngine: 'gemini-1.5-flash',
          processingTimeMs: analysisResult.processingTimeMs,
        });

        await complianceReport.save();

        console.log(`   ✅ Score: ${analysisResult.overallScore}/10 - ${analysisResult.complianceStatus}`);

        results.push({
          sopId: sop._id,
          sopIdentifier: sop.identifier,
          sopName: sop.name,
          reportId: complianceReport._id,
          overallScore: analysisResult.overallScore,
          complianceStatus: analysisResult.complianceStatus,
          processingTimeMs: analysisResult.processingTimeMs,
        });
      } catch (sopError) {
        console.error(`   ❌ Error analyzing SOP ${sop.identifier}:`, sopError);
        errors.push({
          sopId: sop._id,
          sopIdentifier: sop.identifier,
          sopName: sop.name,
          error: (sopError as Error).message,
        });
      }
    }

    const totalTime = Date.now() - startTime;

    console.log(`\n✅ Batch analysis completed`);
    console.log(`   - Successful: ${results.length}`);
    console.log(`   - Failed: ${errors.length}`);
    console.log(`   - Total time: ${totalTime}ms`);

    return NextResponse.json({
      success: true,
      results,
      errors,
      summary: {
        totalSOPs: sops.length,
        successCount: results.length,
        errorCount: errors.length,
        averageScore: results.reduce((sum, r) => sum + r.overallScore, 0) / results.length || 0,
        totalProcessingTimeMs: totalTime,
      },
    });
  } catch (error) {
    console.error('❌ Error in batch compliance analysis:', error);
    return NextResponse.json(
      {
        error: 'Failed to perform batch compliance analysis',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
