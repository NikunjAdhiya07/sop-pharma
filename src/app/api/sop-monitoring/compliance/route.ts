import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOPLibrary from '@/models/SOPLibrary';
import SOP from '@/models/SOP';
import SOPGuideline from '@/models/SOPGuideline';
import { parseDocument } from '@/lib/documentParser';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '');

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const userId = formData.get('userId') as string;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No guideline file uploaded' }, { status: 400 });
    }

    // 1. Parse and extract text from guideline
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const fileType = fileExtension as 'pdf' | 'docx';
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const parsedGuideline = await parseDocument(buffer, fileType);
    const guidelineContent = parsedGuideline.content;

    // 2. Save guideline file
    const uploadsDir = path.join(process.cwd(), 'uploads', 'guidelines');
    await mkdir(uploadsDir, { recursive: true });
    const fileName = `guideline_${Date.now()}.${fileExtension}`;
    const filePath = path.join(uploadsDir, fileName);
    await writeFile(filePath, buffer);
    const fileUrl = `/uploads/guidelines/${fileName}`;

    // 3. Extract checklist items using Gemini
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const extractPrompt = `
      Extract a list of specific compliance requirements or quality standards from this SOP Guideline document.
      Focus on mandatory things every SOP must have or follow.
      Format the output as a clean JSON array of strings.
      
      Guideline content: ${guidelineContent.substring(0, 5000)}
    `;

    const extractResult = await model.generateContent(extractPrompt);
    const extractResponse = await extractResult.response;
    const requirementsJson = extractResponse.text().replace(/```json|```/g, '').trim();
    const requirements = JSON.parse(requirementsJson);

    // 4. Save guideline record
    const guideline = await SOPGuideline.create({
      name: file.name,
      filePath: fileUrl,
      checklistItems: requirements,
      uploadedBy: userId
    });

    // 5. Run compliance check for each SOP (limit to 5 for now to avoid timeout)
    const sops = await SOPLibrary.find({}).limit(5);
    const complianceResults = [];

    for (const sopLib of sops) {
      // Find the actual SOP content from SOP model
      const sopContent = await SOP.findOne({ identifier: sopLib.sopIdentifier });
      
      if (!sopContent || !sopContent.content) continue;

      const checkPrompt = `
        Review this SOP content against the following compliance requirements list.
        Requirements:
        ${requirements.join('\n- ')}

        SOP Content:
        ${sopContent.content.substring(0, 5000)}

        Determine the overall compliance status ('compliant', 'partial', or 'non-compliant') and provide a brief status note.
        Format response as JSON:
        {
          "status": "compliant" | "partial" | "non-compliant",
          "notes": "Brief explanation of findings",
          "checklistDetail": [
            { "item": "string", "met": boolean, "comment": "string" }
          ]
        }
      `;

      const checkResult = await model.generateContent(checkPrompt);
      const checkResponse = await checkResult.response;
      const checkJson = checkResponse.text().replace(/```json|```/g, '').trim();
      const checkData = JSON.parse(checkJson);

      // Update SOPLibrary record
      sopLib.complianceStatus = checkData.status;
      sopLib.complianceNotes = `${checkData.notes}\n\nChecklist:\n` + 
        checkData.checklistDetail.map((d: any) => `${d.met ? '✓' : '✗'} ${d.item}: ${d.comment}`).join('\n');
      
      await sopLib.save();
      complianceResults.push({
        sopId: sopLib.sopId,
        sopName: sopLib.sopName,
        status: checkData.status,
        notes: checkData.notes
      });
    }

    return NextResponse.json({
      success: true,
      message: `Guideline processed and compliance checked for ${complianceResults.length} SOPs.`,
      guidelineId: guideline._id,
      requirements,
      results: complianceResults
    });

  } catch (error: any) {
    console.error('Error in compliance checker API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
