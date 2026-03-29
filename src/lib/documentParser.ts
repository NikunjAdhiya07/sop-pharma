import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export interface ParsedDocument {
  content: string;
  metadata: {
    pageCount?: number;
    wordCount: number;
  };
}

/** Placeholder text so bulk upload can store scanned PDFs / legacy .doc / thin annexures while still passing validation. */
export function buildStubParsedDocument(args: {
  fileName: string;
  sopIdentifier: string;
  sopName: string;
  note: string;
  pageCount?: number;
}): ParsedDocument {
  const content = [
    'Standard Operating Procedure record',
    `Title: ${args.sopName}`,
    `Identifier: ${args.sopIdentifier}`,
    `Original file: ${args.fileName}`,
    '',
    'Indexing note:',
    args.note,
    '',
    'The file was stored successfully and is available for download and preview.',
    'Full-text search, MCQs, and AI features may be limited until you upload a searchable PDF or DOCX.',
  ].join('\n');
  const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length;
  return {
    content,
    metadata: {
      wordCount,
      ...(args.pageCount != null ? { pageCount: args.pageCount } : {}),
    },
  };
}

export type ParsePDFOptions = {
  /**
   * When true (e.g. bulk upload), do not throw on empty or very thin text;
   * return empty/thin content so the caller can store a stub without a stack trace.
   */
  lenient?: boolean;
};

/**
 * Parse PDF file and extract text content
 */
export async function parsePDF(buffer: Buffer, opts?: ParsePDFOptions): Promise<ParsedDocument> {
  const lenient = opts?.lenient === true;
  try {
    console.log('🔍 Starting PDF parsing...');
    console.log('📊 Buffer size:', buffer.length, 'bytes');

    const data = await pdfParse(buffer);

    console.log('📄 PDF Info:', {
      pages: data.numpages,
      info: data.info,
      metadata: data.metadata,
    });

    const content = data.text.trim();
    const wordCount = content.split(/\s+/).filter((word) => word.length > 0).length;

    console.log('📝 Extracted text length:', content.length, 'characters');
    console.log('📊 Word count:', wordCount);
    console.log('📋 First 200 chars:', content.substring(0, 200));

    if (!content || content.length === 0) {
      if (lenient) {
        console.warn(
          `[parsePDF] No selectable text (${data.numpages} page(s)) — lenient mode; caller should stub for indexing.`,
        );
        return {
          content: '',
          metadata: { pageCount: data.numpages, wordCount: 0 },
        };
      }
      console.error('❌ No text extracted from PDF');
      throw new Error(
        'PDF text extraction failed. This PDF might contain only scanned images. Please use a PDF with selectable text or convert scanned images to text using OCR.',
      );
    }

    if (wordCount < 5) {
      if (lenient) {
        return {
          content,
          metadata: { pageCount: data.numpages, wordCount },
        };
      }
      console.error('❌ Very low word count:', wordCount);
      throw new Error(
        `PDF contains only ${wordCount} word(s). This suggests the PDF might be scanned images or have text extraction issues. Please ensure the PDF has selectable text.`,
      );
    }
    
    return {
      content,
      metadata: {
        pageCount: data.numpages,
        wordCount,
      },
    };
  } catch (error) {
    console.error('💥 Error parsing PDF:', error);
    
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('password')) {
        throw new Error('PDF is password-protected. Please remove the password and try again.');
      }
      if (error.message.includes('Invalid PDF')) {
        throw new Error('Invalid or corrupted PDF file. Please ensure the file is a valid PDF.');
      }
      // Re-throw our custom errors
      if (error.message.includes('scanned images') || error.message.includes('selectable text')) {
        throw error;
      }
    }
    
    throw new Error(`Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse DOCX file and extract text content including headers and tables
 */
export async function parseDOCX(buffer: Buffer): Promise<ParsedDocument> {
  try {
    // First, try to extract using raw XML (includes headers!)
    let content = '';
    let xmlSuccess = false;

    try {
      const { extractAllDOCXContent } = await import('./docxHeaderExtractor');
      const xmlContent = await extractAllDOCXContent(buffer);
      console.log('✅ Extracted content using XML parser (includes headers)');
      
      // Safety check: If content is very short (likely only headers), try to append Mammoth content
      // A typical empty SOP with just headers might be very small, but a real SOP > 2KB should have body text.
      const wordCount = xmlContent.split(/\s+/).filter(w => w.length > 0).length;
      
      // If we found very few words but the file is reasonably large, something is wrong
      if (wordCount < 20 && buffer.length > 2000) {
         console.warn(`⚠️ XML extraction yielded only ${wordCount} words from a ${buffer.length} byte file. Attempting Mammoth fallback for body text.`);
         content = xmlContent; // Keep headers
         xmlSuccess = false;   // Trigger fallback
      } else {
         content = xmlContent;
         xmlSuccess = true;
      }
    } catch (xmlError) {
      console.log('⚠️ XML extraction failed completely, falling back to Mammoth');
      xmlSuccess = false;
    }

    if (!xmlSuccess) {
      try {
        console.log('🐘 Starting Mammoth fallback extraction...');
        // Fallback to mammoth
        const htmlResult = await mammoth.convertToHtml({ buffer });
        let htmlText = htmlResult.value
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<\/tr>/gi, '\n')
          .replace(/<\/td>/gi, ' ')
          .replace(/<[^>]*>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .replace(/ \n /g, '\n')
          .trim();
        
        const rawResult = await mammoth.extractRawText({ buffer });
        const mammothContent = htmlText + '\n\n' + rawResult.value;
        
        // Append Mammoth content to any XML content (headers) we already found
        content = (content + '\n\n' + mammothContent).trim();
        console.log('✅ Mammoth extraction complete');
      } catch (mammothError) {
        console.error('❌ Mammoth extraction also failed:', mammothError);
        // If we have at least some content from XML (headers), let's proceed with that rather than failing completely
        if (!content) {
            throw mammothError;
        }
      }
    }
    
    content = content.trim();
    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
    
    console.log('📄 DOCX extraction complete:');
    console.log('  - Total length:', content.length);
    console.log('  - Word count:', wordCount);
    console.log('  - First 500 chars:', content.substring(0, 500));
    
    return {
      content,
      metadata: {
        wordCount,
      },
    };
  } catch (error) {
    console.error('Error parsing DOCX:', error);
    throw new Error(`Failed to parse DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse document based on file type
 */
export async function parseDocument(
  buffer: Buffer,
  fileType: 'pdf' | 'docx',
  pdfOpts?: ParsePDFOptions,
): Promise<ParsedDocument> {
  if (fileType === 'pdf') {
    return parsePDF(buffer, pdfOpts);
  } else if (fileType === 'docx') {
    return parseDOCX(buffer);
  } else {
    throw new Error(`Unsupported file type: ${fileType}`);
  }
}

/**
 * Validate document content
 */
export function validateDocumentContent(content: string): {
  isValid: boolean;
  error?: string;
} {
  console.log('✔️ Validating document content...');
  console.log('📏 Content length:', content.length, 'characters');
  
  if (!content || content.trim().length === 0) {
    console.error('❌ Content is empty');
    return {
      isValid: false,
      error: 'Document content is empty. The PDF might be scanned images or password-protected.',
    };
  }
  
  const wordCount = content.split(/\s+/).filter(word => word.length > 0).length;
  console.log('📊 Word count:', wordCount);
  
  // Reduced from 100 to 10 to handle PDFs with limited text extraction
  if (wordCount < 10) {
    console.error('❌ Word count too low:', wordCount);
    return {
      isValid: false,
      error: `Document has only ${wordCount} word(s). Minimum 10 words required. The PDF might be scanned images or have text extraction issues.`,
    };
  }
  
  if (wordCount > 50000) {
    console.error('❌ Word count too high:', wordCount);
    return {
      isValid: false,
      error: 'Document is too long (maximum 50,000 words allowed)',
    };
  }
  
  console.log('✅ Content validation passed');
  return { isValid: true };
}
