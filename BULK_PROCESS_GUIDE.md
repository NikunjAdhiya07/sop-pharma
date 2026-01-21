# 📁 Bulk Process from Files Folder - Quick Guide

## 🎯 Overview

The **Bulk Process** feature allows you to automatically generate MCQs from all SOP files stored in a dedicated `files` folder. Simply place your DOC, DOCX, or PDF files in the folder and click one button to process everything!

---

## 🚀 How to Use

### Step 1: Place Files in the Folder

1. Navigate to your project root directory:
   ```
   c:\Users\rohth\OneDrive\Desktop\sop pharma\sop pharma\
   ```

2. Open the `files` folder (it already exists)

3. Copy all your SOP files (DOC, DOCX, or PDF) into this folder

### Step 2: Access Bulk Process Page

Navigate to: **http://localhost:3000/bulk-process**

Or click the **"Bulk Process"** button from:
- SOP Upload page
- MCQ Bank page
- Files Manager page

### Step 3: Start Processing

1. Click the **"Process All Files & Generate MCQs"** button
2. Confirm the action in the dialog
3. Watch real-time progress:
   - Files processed count
   - Current file being processed
   - Success/failure counts
   - Total MCQs generated
   - Detailed error messages (if any)

### Step 4: View Results

- All generated MCQs are automatically stored in the **MCQ Bank**
- Navigate to MCQ Bank to view, filter, and export MCQs
- Each file generates approximately **100 MCQs**

---

## ✨ Features

### Automatic Detection
- **SOP Name**: Extracted from filename
- **SOP Identifier**: Auto-generated (e.g., QCMI01-00, SOP-001)
- **Department**: Detected from filename and content keywords

### Error Handling
- ✅ File type validation (DOC, DOCX, PDF only)
- ✅ Content validation (minimum 10 words)
- ✅ Detailed error messages per file
- ✅ Continues processing even if one file fails

### Real-Time Progress
- ✅ Progress bar with percentage
- ✅ Current file indicator
- ✅ Completed/failed counts
- ✅ Total MCQs generated
- ✅ Success and error lists

### Batch Processing Capability
- ✅ Automatically processes **up to 20 files per batch**
- ✅ No manual file limit configuration needed
- ✅ Processes all files in the `files` folder sequentially
- ✅ Robust error handling ensures one failed file doesn't stop the batch

---

## 📊 MCQ Generation

### Per File:
- **Target**: ~100 MCQs
- **Batch Size**: 10 MCQs per batch
- **Total Batches**: 10 batches

### Difficulty Distribution:
- **Easy**: ~30-40 MCQs
- **Medium**: ~40-50 MCQs
- **Hard**: ~20-30 MCQs

### Each MCQ Includes:
- AI-generated icon (🔬, 📋, ⚠️, etc.)
- Question with ⭐ marker
- 4 options
- Correct answer
- Detailed explanation
- SOP reference
- Difficulty stars (⭐, ⭐⭐, ⭐⭐⭐)

---

## ⏱️ Performance

### Processing Time:
- **1 file**: 60-90 seconds
- **5 files**: 5-8 minutes
- **10 files**: 10-15 minutes
- **20 files**: 20-30 minutes

### Factors Affecting Speed:
- File size and complexity
- SOP content length
- AI model response time
- Network latency

---

## 🛡️ Error Handling

### Common Errors:

#### "Files directory not found or empty"
- **Cause**: No files in the `files` folder
- **Solution**: Add DOC, DOCX, or PDF files to the folder

#### "No DOC, DOCX, or PDF files found"
- **Cause**: Only unsupported file types in folder
- **Solution**: Ensure files have .doc, .docx, or .pdf extensions

#### "Insufficient content. Only X words found"
- **Cause**: File contains minimal text
- **Solution**: Use files with at least 10 words of content

#### "Network error: Unable to connect to Gemini API"
- **Cause**: No internet or API key issue
- **Solution**: Check internet connection and GOOGLE_AI_API_KEY in .env.local

---

## 📝 Example Workflow

### Scenario: Process 10 SOP Files

1. **Preparation** (2 minutes)
   - Copy 10 SOP files to `files` folder
   - Verify files are DOC, DOCX, or PDF

2. **Processing** (10-15 minutes)
   - Navigate to http://localhost:3000/bulk-process
   - Click "Process All Files & Generate MCQs"
   - Watch progress bar

3. **Results**
   - ~1000 MCQs generated (100 per file)
   - All stored in MCQ Bank
   - Ready for test creation

---

## 🔗 Integration

### Works With:
- **MCQ Bank**: All MCQs automatically stored
- **Test Section**: Use generated MCQs for tests
- **KAPA Training**: Use for incident-based training
- **Export**: Export MCQs as JSON

### Navigation:
- Bulk Process ↔ MCQ Bank
- Bulk Process ↔ SOP Upload
- Bulk Process ↔ Files Manager

---

## 💡 Pro Tips

1. **Organize Files**: Name files with identifiers (e.g., "QC-001-Quality-Control.pdf")
2. **Batch Processing**: Process related SOPs together for better organization
3. **Monitor Progress**: Watch for errors during processing
4. **Check Results**: Review MCQ Bank after processing
5. **Clean Folder**: Remove processed files or keep for regeneration

---

## 🎯 Use Cases

### 1. Initial Setup
Place all company SOPs in the folder and generate comprehensive MCQ banks at once.

### 2. Department-Specific Training
Process all QA SOPs together, then all QC SOPs, etc.

### 3. Compliance Updates
When SOPs are updated, replace files in folder and regenerate MCQs.

### 4. Audit Preparation
Process critical SOPs to prepare staff for audits.

---

## 📂 File Structure

```
sop pharma/
├── files/                    ← Place your SOP files here
│   ├── QC-001-Quality.pdf
│   ├── QA-Manual.docx
│   └── Production-SOP.doc
├── src/
│   ├── app/
│   │   ├── bulk-process/
│   │   │   └── page.tsx      ← Bulk Process UI
│   │   └── api/
│   │       └── files/
│   │           └── process-folder/
│   │               └── route.ts  ← Processing API
│   └── lib/
│       ├── gemini.ts         ← MCQ generation
│       └── documentParser.ts ← File parsing
```

---

## ✅ Summary

The Bulk Process feature provides:

✅ **Simple**: Just place files in folder and click one button
✅ **Automated**: Auto-detection of names, identifiers, departments
✅ **Fast**: Process multiple files simultaneously
✅ **Reliable**: Comprehensive error handling
✅ **Transparent**: Real-time progress tracking
✅ **Integrated**: Seamless MCQ Bank integration

**Ready to process your SOP files in bulk!** 🚀

---

## 🆘 Support

For issues:
1. Check error messages in the progress panel
2. Verify files are in correct format (DOC, DOCX, PDF)
3. Ensure files have readable text content
4. Check `.env.local` has `GOOGLE_AI_API_KEY`
5. Review browser console for technical details
