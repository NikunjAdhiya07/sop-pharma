import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import SOP from '@/models/SOP';
import SOPLibrary from '@/models/SOPLibrary';
import SOPVersionArtifacts from '@/models/SOPVersionArtifacts';
import { pathSuggestsGujarati } from '@/lib/pathLanguageDetection';
import { fileKindFromStoredPath } from '@/lib/filePathFileKind';

interface FileStatus {
  exists: boolean;
  count: number;
  paths?: string[];
  languages?: string[];
}

interface SOPAnalysis {
  sopCode: string;
  sopName?: string;
  department?: string;
  isDualLanguage: boolean;
  currentFileStatus: {
    englishDocx: FileStatus;
    gujaratiDocx: FileStatus;
    englishPdf: FileStatus;
    gujaratiPdf: FileStatus;
  };
  versionFileStatus: {
    englishDocx: FileStatus;
    gujaratiDocx: FileStatus;
    englishPdf: FileStatus;
    gujaratiPdf: FileStatus;
  };
  issues: string[];
}

export async function GET(request: Request) {
  try {
    await dbConnect();

    // Fetch all SOPs
    const sops = await SOP.find({}).lean();
    const sopsByIdentifier = new Map(sops.map((s: any) => [s.sopIdentifier, s]));

    // Fetch all SOPLibrary records
    const libraries = await SOPLibrary.find({}).lean();

    // Fetch all SOPVersionArtifacts
    const versionArtifacts = await SOPVersionArtifacts.find({}).lean();
    const versionsByIdentifierLang = new Map<string, any>();
    versionArtifacts.forEach((v: any) => {
      const key = `${v.identifier}:${v.language}`;
      versionsByIdentifierLang.set(key, v);
    });

    // Group libraries by SOP identifier
    const libsByIdentifier = new Map<string, any[]>();
    libraries.forEach((lib: any) => {
      const existing = libsByIdentifier.get(lib.sopIdentifier) || [];
      existing.push(lib);
      libsByIdentifier.set(lib.sopIdentifier, existing);
    });

    // Analyze each SOP
    const sopAnalyses: SOPAnalysis[] = [];
    const issuesList: Array<{ sopCode: string; issue: string; details: string }> = [];

    sops.forEach((sop: any) => {
      const sopCode = sop.sopIdentifier;
      const libs = libsByIdentifier.get(sopCode) || [];

      // Check if dual language
      const engLib = libs.find((l: any) => l.language === 'English');
      const gujLib = libs.find((l: any) => l.language === 'Gujarati');
      const isDualLanguage = !!engLib && !!gujLib;

      // Analyze current files
      const analyzeFiles = (libs: any[], lang: string) => {
        const docxPaths: string[] = [];
        const docxLangs: string[] = [];
        const pdfPaths: string[] = [];
        const pdfLangs: string[] = [];

        libs.forEach((lib: any) => {
          (lib.sopDocuments || []).forEach((doc: any) => {
            if (!doc.filePath) return;
            const kind = fileKindFromStoredPath(doc.filePath, doc.fileType);
            const docLang = String(doc.language || 'English').trim();

            // Check for language mismatch
            if (kind === 'docx') {
              docxPaths.push(doc.filePath);
              docxLangs.push(docLang);

              if (lang === 'English' && docLang === 'Gujarati') {
                issuesList.push({
                  sopCode,
                  issue: 'ENGLISH_LIB_HAS_GUJARATI_DOCX',
                  details: `English library contains Gujarati DOCX: ${doc.filePath}`
                });
              } else if (lang === 'Gujarati' && docLang === 'English') {
                issuesList.push({
                  sopCode,
                  issue: 'GUJARATI_LIB_HAS_ENGLISH_DOCX',
                  details: `Gujarati library contains English DOCX: ${doc.filePath}`
                });
              }
            } else if (kind === 'pdf') {
              pdfPaths.push(doc.filePath);
              pdfLangs.push(docLang);

              if (lang === 'English' && docLang === 'Gujarati') {
                issuesList.push({
                  sopCode,
                  issue: 'ENGLISH_LIB_HAS_GUJARATI_PDF',
                  details: `English library contains Gujarati PDF: ${doc.filePath}`
                });
              } else if (lang === 'Gujarati' && docLang === 'English') {
                issuesList.push({
                  sopCode,
                  issue: 'GUJARATI_LIB_HAS_ENGLISH_PDF',
                  details: `Gujarati library contains English PDF: ${doc.filePath}`
                });
              }
            }
          });

          // Also check sopFile field
          if (lib.sopFile?.filePath) {
            const kind = fileKindFromStoredPath(lib.sopFile.filePath, lib.sopFile.fileType);
            const docLang = String(lib.sopFile.language || 'English').trim();

            if (kind === 'docx') {
              docxPaths.push(lib.sopFile.filePath);
              docxLangs.push(docLang);

              if (lang === 'English' && docLang === 'Gujarati') {
                issuesList.push({
                  sopCode,
                  issue: 'ENGLISH_SOPFILE_HAS_GUJARATI_LANG',
                  details: `English library sopFile marked as Gujarati: ${lib.sopFile.filePath}`
                });
              }
            }
          }
        });

        return {
          docx: {
            exists: docxPaths.length > 0,
            count: docxPaths.length,
            paths: docxPaths,
            languages: docxLangs
          },
          pdf: {
            exists: pdfPaths.length > 0,
            count: pdfPaths.length,
            paths: pdfPaths,
            languages: pdfLangs
          }
        };
      };

      const engFiles = analyzeFiles(engLib ? [engLib] : [], 'English');
      const gujFiles = analyzeFiles(gujLib ? [gujLib] : [], 'Gujarati');

      // Check for missing English/Gujarati files
      if (!engFiles.docx.exists && (libs.length > 0 || isDualLanguage)) {
        issuesList.push({
          sopCode,
          issue: 'MISSING_ENGLISH_DOCX',
          details: `No English DOCX found for SOP ${sopCode}`
        });
      }
      if (!gujFiles.docx.exists && isDualLanguage) {
        issuesList.push({
          sopCode,
          issue: 'MISSING_GUJARATI_DOCX',
          details: `Dual-language SOP ${sopCode} missing Gujarati DOCX`
        });
      }

      // Analyze version artifacts
      const engVersions = versionsByIdentifierLang.get(`${sopCode}:English`);
      const gujVersions = versionsByIdentifierLang.get(`${sopCode}:Gujarati`);

      const analyzeVersions = (versionData: any) => {
        if (!versionData?.entries?.length) {
          return { docx: { exists: false, count: 0 }, pdf: { exists: false, count: 0 } };
        }

        const docxPaths = versionData.entries
          .filter((e: any) => e.docxPath)
          .map((e: any) => e.docxPath);
        const pdfPaths = versionData.entries
          .filter((e: any) => e.pdfPath)
          .map((e: any) => e.pdfPath);

        return {
          docx: { exists: docxPaths.length > 0, count: docxPaths.length, paths: docxPaths },
          pdf: { exists: pdfPaths.length > 0, count: pdfPaths.length, paths: pdfPaths }
        };
      };

      const engVersionFiles = analyzeVersions(engVersions);
      const gujVersionFiles = analyzeVersions(gujVersions);

      const analysis: SOPAnalysis = {
        sopCode,
        sopName: sop.sopName,
        department: sop.department,
        isDualLanguage,
        currentFileStatus: {
          englishDocx: engFiles.docx,
          gujaratiDocx: gujFiles.docx,
          englishPdf: engFiles.pdf,
          gujaratiPdf: gujFiles.pdf
        },
        versionFileStatus: {
          englishDocx: engVersionFiles.docx,
          gujaratiDocx: gujVersionFiles.docx,
          englishPdf: engVersionFiles.pdf,
          gujaratiPdf: gujVersionFiles.pdf
        },
        issues: [] // Populated below
      };

      sopAnalyses.push(analysis);
    });

    // Calculate summary statistics
    const totalSOPs = sopAnalyses.length;
    const dualLanguageSOPs = sopAnalyses.filter(a => a.isDualLanguage).length;
    const correctSOPs = sopAnalyses.filter(a => {
      const hasEng = a.currentFileStatus.englishDocx.exists;
      const hasGuj = a.isDualLanguage ? a.currentFileStatus.gujaratiDocx.exists : true;
      const hasNoIssues = issuesList.filter(i => i.sopCode === a.sopCode).length === 0;
      return hasEng && hasGuj && hasNoIssues;
    }).length;

    const missingEnglishDocx = sopAnalyses.filter(a => !a.currentFileStatus.englishDocx.exists).length;
    const missingGujaratiDocx = sopAnalyses.filter(a => a.isDualLanguage && !a.currentFileStatus.gujaratiDocx.exists).length;
    const missingEnglishPdf = sopAnalyses.filter(a => !a.currentFileStatus.englishPdf.exists).length;
    const missingGujaratiPdf = sopAnalyses.filter(a => a.isDualLanguage && !a.currentFileStatus.gujaratiPdf.exists).length;
    const wronglyMappedFiles = issuesList.filter(i =>
      i.issue.includes('HAS_GUJARATI') || i.issue.includes('HAS_ENGLISH')
    ).length;

    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        totalSOPs,
        dualLanguageSOPs,
        correctSOPs,
        incorrectSOPs: totalSOPs - correctSOPs,
        missingEnglishDocx,
        missingGujaratiDocx,
        missingEnglishPdf,
        missingGujaratiPdf,
        wronglyMappedFiles,
        totalIssues: issuesList.length
      },
      issues: issuesList,
      sopDetails: sopAnalyses
    };

    return NextResponse.json(report);
  } catch (error) {
    console.error('[ANALYZE_SOP_FILES] Error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze SOP files', details: String(error) },
      { status: 500 }
    );
  }
}
