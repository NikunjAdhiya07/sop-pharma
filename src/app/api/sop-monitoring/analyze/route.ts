import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOPLibrary from '@/models/SOPLibrary';
import MergeSuggestion from '@/models/MergeSuggestion';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '');

export async function POST(req: NextRequest) {
  try {
    await connectDB();
    
    // Handle empty request body
    let threshold = 70;
    try {
      const body = await req.json();
      threshold = body.threshold || 70;
    } catch (e) {
      // If no body or invalid JSON, use default threshold
      threshold = 70;
    }

    // Fetch all SOPs
    const sops = await SOPLibrary.find({});
    
    if (sops.length < 2) {
      return NextResponse.json({ 
        success: true, 
        message: 'Need at least 2 SOPs to perform analysis',
        suggestions: [] 
      });
    }

    // To prevent hitting rate limits and consuming too many credits,
    // we'll group by department and analyze within each department first.
    const departments = [...new Set(sops.map(s => s.department))];
    const newSuggestions = [];

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    for (const dept of departments) {
      const deptSops = sops.filter(s => s.department === dept);
      if (deptSops.length < 2) continue;

      // Compare pairs in department
      for (let i = 0; i < deptSops.length; i++) {
        for (let j = i + 1; j < deptSops.length; j++) {
          const sopA = deptSops[i];
          const sopB = deptSops[j];

          const prompt = `
            Analyze these two Standard Operating Procedure (SOP) metadata and determine if they are duplicates or highly similar and should be merged.
            
            SOP 1:
            Name: ${sopA.sopName}
            Identifier: ${sopA.sopIdentifier}
            Department: ${sopA.department}
            
            SOP 2:
            Name: ${sopB.sopName}
            Identifier: ${sopB.sopIdentifier}
            Department: ${sopB.department}
            
            Provide a JSON response in this format:
            {
              "isSimilar": boolean,
              "similarityScore": number (0-100),
              "reason": "Clear explanation of why they are similar/different",
              "shouldMerge": boolean
            }
          `;

          const result = await model.generateContent(prompt);
          const response = await result.response;
          const text = response.text();
          
          try {
            // Extract JSON from response (sometimes Gemini adds markdown ticks)
            const cleanJson = text.replace(/```json|```/g, '').trim();
            const analysis = JSON.parse(cleanJson);

            if (analysis.shouldMerge && analysis.similarityScore >= threshold) {
              // Check if suggestion already exists
              const existing = await MergeSuggestion.findOne({
                sopIds: { $all: [sopA._id, sopB._id] }
              });

              if (!existing) {
                const suggestion = await MergeSuggestion.create({
                  sopIds: [sopA._id, sopB._id],
                  sopNames: [sopA.sopName, sopB.sopName],
                  reason: analysis.reason,
                  similarityScore: analysis.similarityScore,
                  status: 'pending'
                });
                newSuggestions.push(suggestion);
              }
            }
          } catch (e) {
            console.error('Error parsing Gemini response:', e);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Analysis complete. Found ${newSuggestions.length} new merge suggestions.`,
      suggestions: newSuggestions
    });
  } catch (error: any) {
    console.error('Error in SOP analysis API:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
