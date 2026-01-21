# 📁 Bulk MCQ Generation System - Complete Guide

## 🎯 Overview

The **Files Manager** is a powerful feature that allows you to:
- Upload multiple SOP files at once (PDF, DOC, DOCX)
- Automatically generate ~50 MCQs from each file
- Perform comprehensive error checking and validation
- Store all MCQs in the MCQ Bank for future use

---

## 🚀 Key Features

### 1. **Bulk File Upload**
- Upload multiple SOP files simultaneously
- Supported formats: PDF, DOC, DOCX
- Maximum file size: 10MB per file
- Automatic file validation and content extraction

### 2. **Smart Auto-Detection**
- **SOP Name**: Extracted from filename
- **SOP Identifier**: Auto-generated from filename patterns (e.g., QCMI01-00, SOP-001)
- **Department**: Intelligently detected from filename and content keywords

### 3. **Bulk MCQ Generation**
- Generate ~50 MCQs from each uploaded file with a single click
- Real-time progress tracking with streaming updates
- Comprehensive error handling and reporting
- Full content validation before generation

### 4. **Error Checking & Validation**
- File type validation (PDF, DOC, DOCX only)
- File size validation (max 10MB)
- Content extraction validation (minimum 10 words)
- MCQ generation error tracking per file
- Detailed error messages for troubleshooting

### 5. **MCQ Bank Integration**
- All generated MCQs are automatically stored in the MCQ Bank
- MCQs are linked to their source SOP
- Support for regeneration and appending additional MCQs
- Full difficulty distribution tracking

---

## 📋 How to Use

### Step 1: Access Files Manager
Navigate to the Files Manager page:
```
http://localhost:3001/files-manager
```

### Step 2: Upload Files
1. Click the **"Click to select multiple SOP files"** area
2. Select one or more PDF/DOC/DOCX files
3. Review the selected files list
4. Click **"Upload X File(s)"** button
5. Wait for upload confirmation

### Step 3: Generate MCQs in Bulk
1. After files are uploaded, click **"Create MCQ - Bulk"**
2. Confirm the action in the dialog
3. Watch real-time progress updates:
   - Total files being processed
   - Current file being processed
   - Completed and failed counts
   - Any errors encountered
4. Wait for completion (may take several minutes)

### Step 4: View Results
- Check the **Uploaded Files** section for status updates
- Each file shows:
  - File name and SOP details
  - Department and identifier
  - MCQ count
  - Status (uploaded, processing, completed, failed)
- Navigate to **MCQ Bank** to view all generated MCQs

---

## 🎨 User Interface

### Main Sections

#### 1. **Bulk Upload Files**
- Drag-and-drop style file selector
- Selected files preview with file size
- Remove individual files before upload
- Upload button with progress indicator

#### 2. **Bulk MCQ Generation**
- Single-click bulk generation
- Real-time progress bar
- Current file indicator
- Error summary panel

#### 3. **Uploaded Files List**
- Grid view of all uploaded files
- Status badges (color-coded)
- File metadata display
- Delete functionality

---

## 🔧 Technical Details

### API Endpoints

#### 1. **POST /api/files/bulk-upload**
Handles multiple file uploads simultaneously.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body: FormData with 'files' field (multiple files)

**Response:**
```json
{
  "success": true,
  "uploadedCount": 5,
  "failedCount": 0,
  "uploads": [
    {
      "fileName": "QC-Procedure.pdf",
      "sopId": "...",
      "sopName": "QC-Procedure",
      "sopIdentifier": "QC-PROCEDURE",
      "wordCount": 1234
    }
  ],
  "errors": []
}
```

#### 2. **POST /api/files/bulk-generate-mcqs**
Generates MCQs from all uploaded files with streaming progress.

**Request:**
- Method: POST
- Content-Type: application/json

**Response:**
- Content-Type: text/event-stream
- Streaming progress updates:
```json
data: {
  "total": 5,
  "completed": 2,
  "failed": 0,
  "current": "Processing QA Manual.pdf",
  "errors": []
}
```

#### 3. **GET /api/files/list**
Retrieves all uploaded files.

**Response:**
```json
{
  "success": true,
  "files": [...],
  "count": 10
}
```

#### 4. **DELETE /api/files/delete?id={fileId}**
Deletes a file and its associated MCQs.

---

## 📊 MCQ Generation Process

### For Each File:

1. **Validation**
   - Check file type and size
   - Extract text content
   - Validate minimum word count (10 words)

2. **Content Analysis**
   - Parse SOP content
   - Identify key sections and concepts
   - Detect department from keywords

3. **MCQ Generation**
   - Generate ~50 MCQs using Gemini AI
   - Distribute across difficulty levels:
     - Easy: ~15-20 MCQs
     - Medium: ~20-25 MCQs
     - Hard: ~10-15 MCQs
   - Each MCQ includes:
     - AI-generated icon (🔬, 📋, ⚠️, etc.)
     - Question with ⭐ marker
     - 4 options
     - Correct answer
     - Detailed explanation
     - SOP reference
     - Difficulty stars (⭐, ⭐⭐, ⭐⭐⭐)

4. **Storage**
   - Save to MCQ Bank
   - Link to source SOP
   - Update SOP status and MCQ count

5. **Error Handling**
   - Catch and log any errors
   - Continue with next file
   - Report errors in final summary

---

## ⚡ Performance Considerations

### Generation Time Estimates:
- **1 file**: ~30-60 seconds
- **5 files**: ~3-5 minutes
- **10 files**: ~6-10 minutes
- **20 files**: ~12-20 minutes

### Factors Affecting Speed:
- File size and complexity
- SOP content length
- AI model response time
- Network latency

### Optimization Tips:
- Upload files in batches if you have many
- Ensure stable internet connection
- Use files with clear, extractable text
- Avoid password-protected PDFs

---

## 🛡️ Error Handling

### Common Errors and Solutions:

#### 1. **"Invalid file type"**
- **Cause**: File is not PDF, DOC, or DOCX
- **Solution**: Convert file to supported format

#### 2. **"File size exceeds 10MB limit"**
- **Cause**: File is too large
- **Solution**: Compress PDF or split into multiple files

#### 3. **"Insufficient content. Only X words found"**
- **Cause**: PDF contains scanned images or minimal text
- **Solution**: Use OCR to convert scanned PDF to text

#### 4. **"MCQ generation failed"**
- **Cause**: AI model error or network issue
- **Solution**: Check internet connection and retry

#### 5. **"Network error: Unable to connect to Gemini API"**
- **Cause**: No internet or API key issue
- **Solution**: Check GOOGLE_AI_API_KEY in .env.local

---

## 📈 Best Practices

### For Optimal Results:

1. **File Preparation**
   - Use PDFs with selectable text (not scanned images)
   - Ensure files are not password-protected
   - Keep file sizes reasonable (< 5MB recommended)

2. **Naming Conventions**
   - Include SOP identifier in filename (e.g., "QC-001-Quality-Control.pdf")
   - Use descriptive names
   - Avoid special characters

3. **Content Quality**
   - Ensure SOPs have clear structure
   - Include section headings
   - Minimum 100 words recommended for quality MCQs

4. **Batch Processing**
   - Upload related SOPs together
   - Process by department for organization
   - Monitor progress for large batches

---

## 🔍 Monitoring and Tracking

### File Status Indicators:

- **🔵 Uploaded**: File uploaded, ready for MCQ generation
- **🟡 Processing**: Currently generating MCQs
- **🟢 Completed**: MCQs generated successfully
- **🔴 Failed**: MCQ generation failed (check errors)

### Progress Tracking:

The bulk generation provides real-time updates:
- Total files to process
- Files completed
- Files failed
- Current file being processed
- Detailed error messages

---

## 🎯 Use Cases

### 1. **Initial Setup**
Upload all company SOPs at once and generate comprehensive MCQ banks.

### 2. **Department-Specific Training**
Upload all QA SOPs, generate MCQs, and create department-specific tests.

### 3. **Compliance Updates**
When SOPs are updated, re-upload and regenerate MCQs to keep training current.

### 4. **Audit Preparation**
Generate MCQs from critical SOPs to prepare staff for audits.

---

## 🔗 Integration with Other Features

### MCQ Bank
- All generated MCQs appear in the MCQ Bank
- Filter by SOP, department, or difficulty
- Export MCQs for external use

### Test Section
- Use generated MCQs to create tests
- Select from multiple SOPs
- Randomize questions

### KAPA Training
- Use MCQs for incident-based training
- Reinforcement learning with repeated questions

---

## 📝 File Structure

```
src/
├── app/
│   ├── files-manager/
│   │   └── page.tsx              # Main Files Manager UI
│   └── api/
│       └── files/
│           ├── bulk-upload/
│           │   └── route.ts      # Bulk upload handler
│           ├── bulk-generate-mcqs/
│           │   └── route.ts      # Bulk MCQ generation
│           ├── list/
│           │   └── route.ts      # List all files
│           └── delete/
│               └── route.ts      # Delete file
├── lib/
│   ├── pdfExtractor.ts           # PDF text extraction
│   ├── docxExtractor.ts          # DOCX text extraction
│   ├── documentParser.ts         # Core parsing logic
│   └── gemini.ts                 # AI MCQ generation
└── models/
    ├── SOP.ts                    # SOP database model
    └── MCQBank.ts                # MCQ Bank model
```

---

## 🎉 Summary

The Bulk MCQ Generation System provides:

✅ **Efficient**: Upload and process multiple files at once
✅ **Automated**: Auto-detection of names, identifiers, and departments
✅ **Intelligent**: AI-powered MCQ generation with ~50 questions per file
✅ **Robust**: Comprehensive error checking and validation
✅ **Transparent**: Real-time progress tracking and error reporting
✅ **Integrated**: Seamless integration with MCQ Bank and Test features

**Ready to streamline your SOP training with bulk MCQ generation!** 🚀
