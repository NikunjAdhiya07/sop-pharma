import { NextRequest, NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import SOPLibrary from '@/models/SOPLibrary';
import SOP from '@/models/SOP';
import MCQBank from '@/models/MCQBank';
import { extractDepartmentFromIdentifier } from '@/lib/sopLibraryHelper';

/**
 * Extract SOP title/objective from content
 * Looks for common patterns like "1.0 Objective", "OBJECTIVE:", "Purpose:", etc.
 */
function extractTitleFromContent(content: string): string | null {
  if (!content) return null;
  
  // Common patterns for SOP objective/purpose
  const patterns = [
    // 1.0 OBJECTIVE: To lay down the procedure...
    /(?:1\.0?\s*)?(?:OBJECTIVE|PURPOSE|SCOPE AND OBJECTIVE)[:\s]*(.+?)(?:\n|2\.0|$)/i,
    // Title: Standard Operating Procedure for...
    /(?:TITLE|SOP TITLE)[:\s]*(.+?)(?:\n|$)/i,
    // TO LAY DOWN THE PROCEDURE FOR...
    /\b(TO LAY DOWN (?:THE )?PROCEDURE FOR .+?)(?:\.|$)/i,
    // First sentence after "Standard Operating Procedure"
    /STANDARD OPERATING PROCEDURE[:\s]*(?:FOR\s*)?(.+?)(?:\.|$)/i,
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      let title = match[1].trim();
      // Clean up the title
      title = title.replace(/\s+/g, ' ').trim();
      // Limit length
      if (title.length > 150) {
        title = title.substring(0, 147) + '...';
      }
      if (title.length > 10) {
        return title;
      }
    }
  }
  
  return null;
}

// POST - Re-extract titles from SOP content
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const stats = {
      processed: 0,
      titlesExtracted: 0,
      noContentFound: 0,
      errors: 0,
    };

    // Get all SOP Library entries
    const sopLibraries = await SOPLibrary.find({}).lean();
    console.log(`🔍 Processing ${sopLibraries.length} SOP Library entries...`);

    for (const lib of sopLibraries) {
      try {
        // Get the corresponding SOP document
        const sop = await SOP.findById(lib.sopId).lean();
        
        if (!sop || !sop.content) {
          stats.noContentFound++;
          continue;
        }

        // Try to extract title from content
        const extractedTitle = extractTitleFromContent(sop.content);
        const identifier = lib.sopIdentifier;
        
        let newName: string;
        if (extractedTitle) {
          // Format: IDENTIFIER - Title
          newName = `${identifier}_${extractedTitle.toUpperCase()}`;
          stats.titlesExtracted++;
        } else {
          // Fallback: Just use identifier with a generic title
          // Try to extract something from the SOP name field
          let sopName = sop.name || '';
          
          // Clean up the sop.name if it's path-based
          if (sopName.includes('/')) {
            const parts = sopName.split('/');
            sopName = parts[parts.length - 1];
          }
          
          // Remove identifier from the name
          if (sopName.toUpperCase().startsWith(identifier.toUpperCase())) {
            sopName = sopName.substring(identifier.length).replace(/^[\s\-_:\.]+/, '').trim();
          }
          
          // Clean underscores
          sopName = sopName.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
          
          if (sopName && sopName.length > 3) {
            newName = `${identifier}_${sopName.toUpperCase()}`;
          } else {
            newName = identifier;
          }
        }

        // Update if different
        if (lib.sopName !== newName) {
          await SOPLibrary.updateOne(
            { _id: lib._id },
            { $set: { sopName: newName } }
          );
          
          // Also update MCQBank if exists
          await MCQBank.updateOne(
            { sopId: lib.sopId },
            { $set: { sopName: newName } }
          );
        }

        stats.processed++;
      } catch (err: any) {
        console.error(`Error processing ${lib.sopIdentifier}:`, err.message);
        stats.errors++;
      }
    }

    console.log('✅ Title extraction complete!');
    console.log(`📊 Stats: ${stats.titlesExtracted} titles extracted, ${stats.noContentFound} had no content`);

    return NextResponse.json({
      success: true,
      message: 'Title extraction completed',
      stats,
    });
  } catch (error: any) {
    console.error('❌ Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
