# ✅ SETUP CHECKLIST - SOP MCQ Bank Generator

Use this checklist to ensure everything is configured correctly.

---

## 📋 Pre-Setup Checklist

### ✅ System Requirements
- [ ] Node.js 18 or higher installed
- [ ] npm or yarn package manager
- [ ] Text editor (VS Code recommended)
- [ ] Web browser (Chrome, Firefox, Edge)
- [ ] Internet connection

### ✅ Account Setup
- [ ] MongoDB Atlas account created (free tier available)
- [ ] Google account for AI Studio access
- [ ] Git installed (optional, for version control)

---

## 🔧 Configuration Checklist

### Step 1: MongoDB Setup
- [ ] Logged into MongoDB Atlas
- [ ] Created a new cluster (M0 Free tier)
- [ ] Created database user with username and password
- [ ] Whitelisted IP address (0.0.0.0/0 for development)
- [ ] Copied connection string
- [ ] Replaced `<password>` with actual password
- [ ] Replaced `<dbname>` with `sop-mcq-bank`

**MongoDB URI Format:**
```
mongodb+srv://username:password@cluster.mongodb.net/sop-mcq-bank?retryWrites=true&w=majority
```

### Step 2: Google AI Setup
- [ ] Visited https://aistudio.google.com/app/apikey
- [ ] Signed in with Google account
- [ ] Created new API key
- [ ] Copied API key (starts with `AIzaSy...`)
- [ ] Saved API key securely

### Step 3: Environment Variables
- [ ] Created `.env.local` file in project root
- [ ] Added `MONGODB_URI` with your connection string
- [ ] Added `GOOGLE_AI_API_KEY` with your API key
- [ ] Added `NEXT_PUBLIC_APP_URL=http://localhost:3000`
- [ ] Saved the file
- [ ] Verified no spaces around `=` signs

**Example `.env.local`:**
```env
MONGODB_URI=mongodb+srv://myuser:mypass@cluster0.abc123.mongodb.net/sop-mcq-bank?retryWrites=true&w=majority
GOOGLE_AI_API_KEY=AIzaSyABC123def456GHI789jkl012MNO345pqr
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Step 4: Dependencies
- [ ] Opened terminal in project directory
- [ ] Ran `npm install`
- [ ] Waited for installation to complete
- [ ] No errors in installation output

---

## 🚀 Launch Checklist

### Step 5: Start Development Server
- [ ] Opened terminal in project directory
- [ ] Ran `npm run dev` (or `start.bat` on Windows)
- [ ] Saw "Ready" message in terminal
- [ ] Server running on http://localhost:3000

### Step 6: Verify Application
- [ ] Opened http://localhost:3000 in browser
- [ ] Homepage loads successfully
- [ ] No console errors (press F12 to check)
- [ ] Navigation links work

---

## 🧪 Testing Checklist

### Step 7: Test SOP Upload
- [ ] Navigated to http://localhost:3000/sop-upload
- [ ] Page loads without errors
- [ ] File upload area visible
- [ ] Form fields (SOP Name, Identifier) visible

### Step 8: Upload Test SOP
- [ ] Prepared test SOP (use `sample-sop.txt` or create PDF/DOCX)
- [ ] Clicked file upload area
- [ ] Selected SOP file
- [ ] File name appears in upload area
- [ ] Entered SOP Name (e.g., "Quality Control Procedures")
- [ ] Entered SOP Identifier (e.g., "SOP-QC-001")
- [ ] Clicked "Upload SOP" button
- [ ] Upload successful message appears
- [ ] No errors in console

### Step 9: Generate MCQs
- [ ] "Generate MCQ Bank" button appears after upload
- [ ] Clicked "Generate MCQ Bank" button
- [ ] Loading indicator appears
- [ ] Waited 30-60 seconds for generation
- [ ] Success message appears
- [ ] Message shows "40 questions created"

### Step 10: View MCQ Bank
- [ ] Navigated to http://localhost:3000/mcq-bank
- [ ] MCQ Bank page loads
- [ ] Your generated MCQ bank appears in grid
- [ ] SOP name and identifier displayed correctly
- [ ] Difficulty distribution shown (Easy/Medium/Hard)
- [ ] Total questions shows "40"

### Step 11: View MCQ Details
- [ ] Clicked "View" button on MCQ bank card
- [ ] Modal opens with all questions
- [ ] Questions numbered 1-40
- [ ] Each question shows difficulty badge
- [ ] Options displayed for each question
- [ ] Correct answer highlighted in green

### Step 12: Test Filtering
- [ ] Clicked "Easy" filter button
- [ ] Only Easy questions displayed
- [ ] Clicked "Medium" filter button
- [ ] Only Medium questions displayed
- [ ] Clicked "Hard" filter button
- [ ] Only Hard questions displayed
- [ ] Clicked "All" to see all questions

### Step 13: Test Export
- [ ] Clicked "Export" button (download icon)
- [ ] JSON file downloaded
- [ ] Opened JSON file
- [ ] File contains all MCQ data
- [ ] Data structure is correct

---

## 🔍 Troubleshooting Checklist

### If Upload Fails
- [ ] Check file format (PDF or DOCX only)
- [ ] Check file size (max 10MB)
- [ ] Check file has content (min 100 words)
- [ ] Check console for error messages
- [ ] Verify MongoDB connection in terminal

### If MCQ Generation Fails
- [ ] Check Google AI API key is correct
- [ ] Check API quota in Google AI Studio
- [ ] Check console for error messages
- [ ] Check terminal for backend errors
- [ ] Verify SOP content is sufficient (100+ words)

### If Database Errors
- [ ] Verify MongoDB URI format
- [ ] Check username and password are correct
- [ ] Verify IP address is whitelisted
- [ ] Check MongoDB cluster is running
- [ ] Test connection string in MongoDB Compass

### If Page Won't Load
- [ ] Check development server is running
- [ ] Verify port 3000 is not in use
- [ ] Clear browser cache (Ctrl+Shift+Delete)
- [ ] Try incognito/private window
- [ ] Check for JavaScript errors in console

---

## ✅ Final Verification

### All Systems Go!
- [ ] Homepage loads ✓
- [ ] SOP upload works ✓
- [ ] MCQ generation works ✓
- [ ] MCQ Bank displays ✓
- [ ] Filtering works ✓
- [ ] Export works ✓
- [ ] No console errors ✓
- [ ] No terminal errors ✓

---

## 📊 Quality Check

### Generated MCQs Should Have:
- [ ] Exactly 40 questions
- [ ] Mix of Easy, Medium, Hard (roughly 13-15, 13-15, 10-14)
- [ ] Each question has 4+ options
- [ ] Each question has exactly 1 correct answer
- [ ] Each question has an explanation
- [ ] Each question has SOP reference
- [ ] Options are diverse and not repetitive
- [ ] Questions are based on SOP content

---

## 🎯 Performance Check

### Expected Performance:
- [ ] Homepage loads in < 2 seconds
- [ ] File upload completes in < 2 seconds
- [ ] Document parsing in < 5 seconds
- [ ] MCQ generation in 30-60 seconds
- [ ] MCQ Bank query in < 1 second
- [ ] No memory leaks
- [ ] No excessive CPU usage

---

## 📝 Documentation Check

### Have You Read:
- [ ] README.md - Project overview
- [ ] SETUP_GUIDE.md - Detailed setup
- [ ] QUICK_REFERENCE.md - Quick commands
- [ ] ARCHITECTURE.md - System design
- [ ] PROJECT_COMPLETE.md - Completion summary

---

## 🚀 Ready for Production?

### Before Deploying:
- [ ] All tests passing
- [ ] Environment variables configured
- [ ] MongoDB production cluster ready
- [ ] API keys secured
- [ ] Error handling tested
- [ ] Performance optimized
- [ ] Security reviewed
- [ ] Backup strategy in place

---

## 🎉 Congratulations!

If all items are checked, your SOP MCQ Bank Generator is fully operational!

### Next Steps:
1. Start uploading your real SOPs
2. Generate MCQ banks
3. Review question quality
4. Export for use in tests
5. Share with your team

---

## 📞 Need Help?

If any checklist item fails:
1. Check the error message
2. Review relevant documentation
3. Check console/terminal logs
4. Verify environment variables
5. Restart development server

---

**Last Updated**: January 5, 2026  
**Version**: 1.0  
**Status**: Production Ready ✅
