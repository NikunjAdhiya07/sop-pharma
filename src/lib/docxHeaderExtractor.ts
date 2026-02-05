import PizZip from 'pizzip';

/**
 * Extract ALL text from DOCX including headers, footers, and tables
 * by reading the raw XML structure
 */
export async function extractAllDOCXContent(buffer: Buffer): Promise<string> {
  try {
    const zip = new PizZip(buffer);
    let allText = '';

    // Extract from document.xml (main body)
    try {
      const documentXml = zip.file('word/document.xml')?.asText();
      if (documentXml) {
        allText += extractTextFromXML(documentXml) + '\n\n';
      }
    } catch (e) {
      console.log('No document.xml found');
    }

    // Extract from header files (THIS IS WHERE YOUR DATES ARE!)
    const headerFiles = ['word/header1.xml', 'word/header2.xml', 'word/header3.xml'];
    for (const headerFile of headerFiles) {
      try {
        const headerXml = zip.file(headerFile)?.asText();
        if (headerXml) {
          const headerText = extractTextFromXML(headerXml);
          if (headerText.trim()) {
            console.log(`📋 Found header content in ${headerFile}`);
            allText = headerText + '\n\n' + allText; // Put headers first
          }
        }
      } catch (e) {
        // Header file doesn't exist, skip
      }
    }

    // Extract from footer files
    const footerFiles = ['word/footer1.xml', 'word/footer2.xml', 'word/footer3.xml'];
    for (const footerFile of footerFiles) {
      try {
        const footerXml = zip.file(footerFile)?.asText();
        if (footerXml) {
          const footerText = extractTextFromXML(footerXml);
          if (footerText.trim()) {
            allText += '\n\n' + footerText;
          }
        }
      } catch (e) {
        // Footer file doesn't exist, skip
      }
    }

    return allText.trim();
  } catch (error) {
    console.error('Error extracting DOCX content:', error);
    throw new Error('Failed to extract DOCX content: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
}

/**
 * Extract text from Word XML
 */
function extractTextFromXML(xml: string): string {
  // Extract text from <w:t> tags (text runs)
  const textMatches = xml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
  const texts = textMatches.map(match => {
    const textMatch = match.match(/>([^<]*)</);
    return textMatch ? textMatch[1] : '';
  });

  // Join with spaces and clean up
  let text = texts.join(' ');
  
  // Decode XML entities
  text = text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  return text;
}
