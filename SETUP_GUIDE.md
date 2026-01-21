# 🚀 Setup Guide - SOP MCQ Bank Generator

## ✅ Step 1: Dependencies Installed
Dependencies have been successfully installed!

## 🔑 Step 2: Configure Environment Variables

You need to create a `.env.local` file in the root directory with the following variables:

### Create `.env.local` file:

```env
# MongoDB Connection String
MONGODB_URI=mongodb+srv://your_username:your_password@your_cluster.mongodb.net/sop-mcq-bank?retryWrites=true&w=majority

# Google AI API Key (Gemini)
GOOGLE_AI_API_KEY=your_google_ai_api_key_here

# Next.js
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### How to Get MongoDB URI:

1. **Go to MongoDB Atlas**: https://www.mongodb.com/cloud/atlas
2. **Sign up/Login** (Free tier available)
3. **Create a New Cluster**:
   - Click "Build a Database"
   - Choose "M0 Sandbox" (Free)
   - Select a cloud provider and region
   - Click "Create Cluster"
4. **Create Database User**:
   - Go to "Database Access"
   - Click "Add New Database User"
   - Choose "Password" authentication
   - Set username and password (save these!)
   - Add user
5. **Whitelist IP Address**:
   - Go to "Network Access"
   - Click "Add IP Address"
   - Click "Allow Access from Anywhere" (for development)
   - Confirm
6. **Get Connection String**:
   - Go to "Database" → "Connect"
   - Choose "Connect your application"
   - Copy the connection string
   - Replace `<password>` with your actual password
   - Replace `<dbname>` with `sop-mcq-bank`

**Example:**
```
mongodb+srv://admin:MyPassword123@cluster0.abc123.mongodb.net/sop-mcq-bank?retryWrites=true&w=majority
```

### How to Get Google AI API Key (Gemini):

1. **Go to Google AI Studio**: https://aistudio.google.com/app/apikey
2. **Sign in** with your Google account
3. **Create API Key**:
   - Click "Create API Key"
   - Select or create a Google Cloud project
   - Copy the generated API key
4. **Paste in `.env.local`**

**Example:**
```
GOOGLE_AI_API_KEY=AIzaSyABC123def456GHI789jkl012MNO345pqr
```

## 🏃 Step 3: Run the Development Server

Once you've configured `.env.local`, run:

```bash
npm run dev
```

The application will start at: **http://localhost:3000**

## 📱 Step 4: Access the Application

### Pages Available:

1. **Homepage**: http://localhost:3000
   - Overview of features
   - Navigation to Upload and MCQ Bank

2. **SOP Upload**: http://localhost:3000/sop-upload
   - Upload PDF or DOCX files
   - Generate MCQ banks

3. **MCQ Bank**: http://localhost:3000/mcq-bank
   - View all generated MCQ banks
   - Filter by difficulty
   - Export to JSON

## 🧪 Step 5: Test the System

### Test Workflow:

1. **Upload an SOP**:
   - Go to `/sop-upload`
   - Select a PDF or DOCX file (your SOP document)
   - Enter SOP Name (e.g., "Quality Control Procedures")
   - Enter SOP Identifier (e.g., "SOP-QC-001")
   - Click "Upload SOP"

2. **Generate MCQs**:
   - After upload, click "Generate MCQ Bank"
   - Wait for Gemini AI to process (may take 30-60 seconds)
   - 40 MCQs will be generated automatically

3. **View MCQ Bank**:
   - Go to `/mcq-bank`
   - See all your generated MCQ banks
   - Filter by difficulty (Easy/Medium/Hard)
   - Click "View" to see all questions
   - Click "Export" to download as JSON

## 📊 MCQ Structure

Each MCQ includes:
- ✅ Question text
- ✅ Difficulty level (Easy/Medium/Hard)
- ✅ 4+ options
- ✅ Correct answer
- ✅ Detailed explanation
- ✅ SOP source reference
- ✅ Option variants (alternative phrasings)

## 🎯 Difficulty Distribution

- **Easy**: 13-15 questions (basic recall, definitions)
- **Medium**: 13-15 questions (application, understanding)
- **Hard**: 10-14 questions (analysis, critical thinking)

## 🔧 Troubleshooting

### MongoDB Connection Issues:
- Verify your connection string is correct
- Check if IP address is whitelisted
- Ensure database user credentials are correct

### Gemini API Issues:
- Verify API key is valid
- Check if you have API quota remaining
- Ensure you're using the correct API key format

### File Upload Issues:
- Maximum file size: 10MB
- Supported formats: PDF, DOCX only
- Minimum content: 100 words

### Build Issues:
```bash
# Clear cache and rebuild
rm -rf .next
npm run dev
```

## 📝 Sample SOP for Testing

If you don't have an SOP document, you can create a simple test document:

**Sample SOP Content** (save as PDF or DOCX):

```
Standard Operating Procedure
Quality Control Testing

SOP ID: SOP-QC-001
Version: 1.0
Effective Date: January 2026

1. Purpose
This SOP describes the procedures for quality control testing of pharmaceutical products.

2. Scope
This procedure applies to all quality control personnel in the testing laboratory.

3. Responsibilities
- QC Manager: Oversees all testing activities
- QC Analyst: Performs testing procedures
- QA Manager: Reviews and approves test results

4. Procedure
4.1 Sample Receipt
- Verify sample identification
- Check sample integrity
- Record sample temperature
- Log sample in LIMS system

4.2 Testing
- Follow approved test methods
- Use calibrated equipment
- Record all observations
- Perform duplicate testing when required

4.3 Documentation
- Complete all test records
- Sign and date all entries
- Report results within 24 hours
- Archive records for 5 years

5. Safety
- Wear appropriate PPE
- Follow chemical handling procedures
- Report all incidents immediately

6. References
- FDA 21 CFR Part 211
- ICH Q7 Guidelines
```

## 🎉 You're All Set!

Once you've completed these steps, you'll have a fully functional SOP MCQ Bank Generator!

## 📞 Need Help?

If you encounter any issues, check:
1. Console logs in the browser (F12)
2. Terminal output for errors
3. MongoDB Atlas connection status
4. Google AI Studio API quota

Happy MCQ generating! 🚀
