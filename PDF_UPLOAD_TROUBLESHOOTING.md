# PDF Upload Troubleshooting Guide

## Common Issues and Solutions

### ❌ Error: "Document content is empty. The PDF might be scanned images or password-protected."

This error occurs when the PDF parser cannot extract text from your PDF file.

#### **Causes:**

1. **Scanned PDFs**: The PDF contains images of text rather than actual selectable text
2. **Password Protection**: The PDF is encrypted or password-protected
3. **Corrupted PDF**: The PDF file is damaged or invalid
4. **Image-only PDFs**: The PDF contains only images without any text layer

#### **Solutions:**

##### For Scanned PDFs (Most Common):

**Option 1: Use OCR (Optical Character Recognition)**
- **Adobe Acrobat Pro**: 
  1. Open the PDF in Adobe Acrobat Pro
  2. Go to Tools → Enhance Scans → Recognize Text → In This File
  3. Save the file and try uploading again

- **Free Online Tools**:
  - [OCR.space](https://ocr.space/) - Free online OCR
  - [PDF24 Tools](https://tools.pdf24.org/en/ocr-pdf) - Free PDF OCR
  - [Smallpdf OCR](https://smallpdf.com/ocr-pdf) - Free with limitations

- **Desktop Software**:
  - **Windows**: Microsoft OneNote (Free)
    1. Insert the PDF as a printout
    2. Right-click → Copy Text from Picture
    3. Paste into Word and save as PDF
  
  - **Mac**: Preview + Automator
    1. Open PDF in Preview
    2. Use built-in OCR features

**Option 2: Convert to Text-based PDF**
- Re-create the PDF from the original source document (Word, Excel, etc.)
- If you have the original document, export it as PDF with text enabled

**Option 3: Manual Text Extraction**
- Copy text from the original document
- Create a new PDF with the text content

##### For Password-Protected PDFs:

**Remove Password Protection:**
- **Adobe Acrobat**: File → Properties → Security → No Security
- **Online Tools**: 
  - [iLovePDF](https://www.ilovepdf.com/unlock_pdf)
  - [Smallpdf Unlock](https://smallpdf.com/unlock-pdf)
- **Command Line** (qpdf):
  ```bash
  qpdf --password=YOUR_PASSWORD --decrypt input.pdf output.pdf
  ```

##### For Corrupted PDFs:

**Repair the PDF:**
- Try opening and re-saving in Adobe Acrobat
- Use online PDF repair tools
- Convert to another format and back to PDF

---

### ❌ Error: "Document has only X word(s). Minimum 10 words required."

This error occurs when the PDF has very little extractable text.

#### **Solutions:**

1. **Verify PDF Content**: 
   - Open the PDF and try to select text with your cursor
   - If you can't select text, it's likely a scanned image (see above)

2. **Check File Quality**:
   - Ensure the PDF is not just a cover page
   - Verify all pages contain text content

3. **Re-export the PDF**:
   - If created from Word/Excel, re-export with proper settings
   - Ensure "Embed fonts" and "Create PDF/A" are enabled

---

### ❌ Error: "Invalid or corrupted PDF file"

#### **Solutions:**

1. **Re-download the PDF** if obtained online
2. **Re-create the PDF** from the source document
3. **Use PDF repair tools**:
   - Adobe Acrobat: File → Save As → Optimized PDF
   - Online: [PDF2Go Repair](https://www.pdf2go.com/repair-pdf)

---

### ⚠️ Warning: "Buffer() is deprecated"

This is a deprecation warning from the `pdf-parse` library and does not affect functionality. It will be fixed in a future update of the library.

**What it means**: The underlying PDF parsing library uses an older Node.js API
**Impact**: None - your PDFs will still be processed correctly
**Action needed**: None - this is informational only

---

## How to Check if Your PDF is Text-Based

### Method 1: Select Text Test
1. Open the PDF in any PDF viewer
2. Try to select text with your cursor
3. If you can select and copy text → ✅ Text-based PDF
4. If you cannot select text → ❌ Scanned/Image PDF

### Method 2: Search Test
1. Open the PDF
2. Use Ctrl+F (Windows) or Cmd+F (Mac) to search
3. Try searching for a word you can see
4. If search works → ✅ Text-based PDF
5. If search doesn't find anything → ❌ Scanned/Image PDF

### Method 3: File Properties
1. Right-click the PDF → Properties
2. Check the "Producer" or "Creator" field
3. If it says "Scanner" or "Image" → ❌ Scanned PDF
4. If it says "Word", "Excel", "PDFCreator" → ✅ Likely text-based

---

## Best Practices for SOP PDFs

### ✅ Recommended:
- Export directly from Word/Excel/Google Docs
- Use "Save as PDF" or "Export to PDF" features
- Ensure text is selectable before uploading
- Keep file size under 10MB
- Use standard fonts (Arial, Times New Roman, etc.)

### ❌ Avoid:
- Scanning paper documents without OCR
- Password-protecting PDFs
- Using image-only PDFs
- Extremely large files (>10MB)
- Corrupted or damaged PDFs

---

## Quick Checklist Before Upload

- [ ] Can you select text in the PDF?
- [ ] Can you search for words in the PDF?
- [ ] Is the PDF under 10MB?
- [ ] Is the PDF not password-protected?
- [ ] Does the PDF contain at least 10 words?
- [ ] Is the file a valid PDF (not corrupted)?

If you answered **YES** to all questions, your PDF should upload successfully! ✅

---

## Still Having Issues?

If you've tried all the solutions above and still can't upload your PDF:

1. **Check the browser console** for detailed error messages
2. **Try a different PDF** to verify the system is working
3. **Convert to DOCX** format (also supported)
4. **Check server logs** for more technical details

### Alternative Format: DOCX

If PDF upload continues to fail, try uploading as DOCX instead:
1. Open your PDF in Word
2. Save as `.docx` format
3. Upload the DOCX file

---

## Technical Details

### Supported Formats:
- **PDF**: Text-based PDFs with selectable text
- **DOCX**: Microsoft Word documents

### Requirements:
- Minimum: 10 words
- Maximum: 50,000 words
- File size: Under 10MB
- Must contain extractable text

### PDF Parsing:
- Uses `pdf-parse` library
- Extracts text content only (no images)
- Requires selectable text layer
- Does not support scanned images without OCR
