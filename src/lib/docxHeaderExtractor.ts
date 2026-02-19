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
    // CRITICAL: Do not swallow errors here! If body extraction fails, we must throw
    // so that the caller (parseDOCX) falls back to Mammoth.
    try {
      const documentXml = zip.file('word/document.xml')?.asText();
      if (documentXml) {
        const bodyText = extractTextFromXML(documentXml);
        if (!bodyText.trim()) {
           console.warn('⚠️ document.xml extracted but yielded empty text');
        } else {
           console.log(`✅ Extracted ${bodyText.length} chars from document.xml`);
        }
        allText += bodyText + '\n\n';
      } else {
        throw new Error('word/document.xml not found in ZIP');
      }
    } catch (e) {
      console.error('❌ Error reading document.xml:', e);
      throw e; // Re-throw to trigger fallback
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
        // Header file ignores are fine
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
        // Footer file ignores are fine
      }
    }

    return allText.trim();
  } catch (error) {
    console.error('Error extracting DOCX content:', error);
    throw new Error('Failed to extract DOCX content: ' + (error instanceof Error ? error.message : 'Unknown error'));
  }
} css

/**
 * Extract text from Word XML
 * Handles complex scripts (Gujarati, etc.) by parsing at paragraph level.
 * Runs within a paragraph are concatenated directly (no spaces added between runs),
 * and paragraphs are separated by newlines. This prevents Gujarati words from being
 * split with spaces when a single word spans multiple <w:t> elements.
 */
function extractTextFromXML(xml: string): string {
  // Process paragraph by paragraph to avoid inserting spaces inside words
  // A paragraph in Word XML is wrapped in <w:p>...</w:p>
  const paragraphRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
  const paragraphs: string[] = [];

  let match: RegExpExecArray | null;
  while ((match = paragraphRegex.exec(xml)) !== null) {
    const paraXml = match[0];
    let paraText = '';

    // Within a paragraph, extract all <w:t> runs and concatenate them directly
    // (no spaces between runs — spaces in the document are explicit space characters
    // already present in the text content of <w:t> tags)
    // First, replace <w:br/> (line breaks) with a space marker in the raw XML
    const paraXmlWithBreaks = paraXml.replace(/<w:br[^/]*\/>/g, '<w:t> </w:t>');
    const runRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
    let runMatch: RegExpExecArray | null;
    while ((runMatch = runRegex.exec(paraXmlWithBreaks)) !== null) {
      paraText += runMatch[1];
    }

    if (paraText.trim()) {
      paragraphs.push(paraText);
    }
  }

  // If no paragraphs found (e.g., header/footer with different structure),
  // fall back to simple run extraction
  if (paragraphs.length === 0) {
    const runRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
    const runs: string[] = [];
    let runMatch: RegExpExecArray | null;
    while ((runMatch = runRegex.exec(xml)) !== null) {
      if (runMatch[1].trim()) {
        runs.push(runMatch[1]);
      }
    }
    // For fallback, join with space (old behavior)
    let text = runs.join(' ');
    text = decodeXMLEntities(text);
    return text;
  }

  let text = paragraphs.join('\n');
  text = decodeXMLEntities(text);
  return text;
}

/**
 * Decode common XML entities in extracted text
 */
function decodeXMLEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
