# MCQ Section Reference Cleanup

## Overview

This document explains the changes made to prevent and remove MCQs that ask questions based on section references (e.g., "In section 4.4.2, what is stated?").

## Changes Made

### 1. Updated MCQ Generation Prompt (`src/lib/gemini.ts`)

The AI prompt has been updated to explicitly forbid generating questions that reference section numbers. The new requirement states:

> ❌ **FORBIDDEN**: Do NOT create questions that ask about section references (e.g., "In section 4.4.2, what is stated?", "What does section X.Y say?"). Questions must focus on actual content, procedures, and concepts, NOT on section numbers or references.

This ensures that all **newly generated MCQs** will focus on actual content understanding rather than section navigation.

### 2. Created Cleanup Script (`scripts/cleanup-section-reference-mcqs.ts`)

A comprehensive cleanup script has been created to identify and remove existing MCQs that contain section references.

#### Detection Patterns

The script uses the following regex patterns to identify problematic questions:

- `in section X.Y` - e.g., "In section 4.4.2, what is stated?"
- `section X.Y states/says/mentions/describes` - e.g., "Section 4.4.2 states that..."
- `what does/is section X.Y` - e.g., "What does section 4.4.2 describe?"
- `according to section X.Y` - e.g., "According to section 4.4.2..."
- `as per section X.Y` - e.g., "As per section 4.4.2..."
- `refer to section X.Y` - e.g., "Refer to section 4.4.2 for..."
- `in X.Y, what` - e.g., "In 4.4.2, what is the procedure?"
- `clause X.Y states/says` - e.g., "Clause 4.4.2 states..."

## Running the Cleanup Script

### Prerequisites

Ensure you have:
1. Node.js installed
2. All dependencies installed (`npm install`)
3. `.env.local` file with `MONGODB_URI` configured

### Execution

Run the cleanup script using:

```bash
npm run cleanup:mcq-sections
```

Or directly:

```bash
npx tsx scripts/cleanup-section-reference-mcqs.ts
```

### What the Script Does

1. **Connects to MongoDB** using your configured connection string
2. **Analyzes all MCQ banks** in the database
3. **Identifies problematic MCQs** using pattern matching
4. **Removes section reference questions** from each bank
5. **Recalculates statistics**:
   - Total question count
   - Difficulty distribution (Easy/Medium/Hard)
6. **Saves updated banks** to the database
7. **Generates a detailed report** showing:
   - Total banks analyzed
   - Total banks modified
   - Total MCQs removed
   - List of removed questions for each SOP

### Example Output

```
🔌 Connecting to MongoDB...
✅ Connected to MongoDB

📊 Found 5 MCQ banks to analyze

✅ Equipment Calibration SOP (SOP-001)
   Removed: 3 MCQs
   Remaining: 47 MCQs

✅ Quality Control Procedures (SOP-002)
   Removed: 2 MCQs
   Remaining: 48 MCQs

============================================================
📋 CLEANUP SUMMARY
============================================================
Total MCQ Banks Analyzed: 5
Total MCQ Banks Modified: 2
Total MCQs Removed: 5
============================================================

📝 DETAILED REPORT

1. Equipment Calibration SOP (SOP-001)
   Removed 3 question(s):

   1. ⭐ In section 4.4.2, what is stated about calibration frequency?
   2. ⭐ What does section 5.1 say about equipment maintenance?
   3. ⭐ According to section 3.2, what is the procedure?

2. Quality Control Procedures (SOP-002)
   Removed 2 question(s):

   1. ⭐ In 6.3, what is the testing protocol?
   2. ⭐ Section 4.5 states which of the following?

🔌 Disconnected from MongoDB
✅ Cleanup completed successfully!
```

## Using API Endpoints

In addition to the command-line script, you can also use API endpoints to analyze and clean up MCQs.

### Analyze MCQs (GET)

**Endpoint**: `GET /api/mcq-bank/cleanup-section-references`

Analyzes MCQ banks for section reference questions **without removing them**.

**Query Parameters**:
- `sopId` (optional): Analyze only a specific SOP's MCQ bank

**Example**:
```bash
# Analyze all MCQ banks
curl http://localhost:3000/api/mcq-bank/cleanup-section-references

# Analyze specific SOP
curl http://localhost:3000/api/mcq-bank/cleanup-section-references?sopId=507f1f77bcf86cd799439011
```

**Response**:
```json
{
  "success": true,
  "message": "Found 5 section reference MCQs across 2 bank(s)",
  "stats": {
    "banksAnalyzed": 5,
    "totalMCQs": 250,
    "sectionReferenceMCQs": 5,
    "percentageAffected": "2.00%"
  },
  "analysis": [
    {
      "sopName": "Equipment Calibration SOP",
      "sopIdentifier": "SOP-001",
      "totalQuestions": 50,
      "sectionReferenceCount": 3,
      "sectionReferenceQuestions": [
        "⭐ In section 4.4.2, what is stated about calibration frequency?",
        "⭐ What does section 5.1 say about equipment maintenance?",
        "⭐ According to section 3.2, what is the procedure?"
      ]
    }
  ]
}
```

### Clean Up MCQs (POST)

**Endpoint**: `POST /api/mcq-bank/cleanup-section-references`

Removes section reference questions from MCQ banks.

**Request Body**:
```json
{
  "sopId": "507f1f77bcf86cd799439011"  // Optional: clean up specific SOP only
}
```

**Example**:
```bash
# Clean up all MCQ banks
curl -X POST http://localhost:3000/api/mcq-bank/cleanup-section-references \
  -H "Content-Type: application/json" \
  -d '{}'

# Clean up specific SOP
curl -X POST http://localhost:3000/api/mcq-bank/cleanup-section-references \
  -H "Content-Type: application/json" \
  -d '{"sopId": "507f1f77bcf86cd799439011"}'
```

**Response**:
```json
{
  "success": true,
  "message": "Successfully removed 5 section reference MCQs from 2 bank(s)",
  "stats": {
    "banksAnalyzed": 5,
    "banksModified": 2,
    "mcqsRemoved": 5
  },
  "detailedReport": [
    {
      "sopName": "Equipment Calibration SOP",
      "sopIdentifier": "SOP-001",
      "removedCount": 3,
      "removedQuestions": [
        "⭐ In section 4.4.2, what is stated about calibration frequency?",
        "⭐ What does section 5.1 say about equipment maintenance?",
        "⭐ According to section 3.2, what is the procedure?"
      ]
    }
  ]
}
```

## Impact on Existing Data

- **MCQ Banks**: Banks with removed questions will have their `totalQuestions` and `difficultyDistribution` automatically recalculated
- **SOPs**: The associated SOP's `mcqCount` field may become out of sync and should be updated if needed
- **User Progress**: Existing test results and user progress are not affected

## Future MCQ Generation

All future MCQ generation will automatically exclude section reference questions due to the updated prompt in `src/lib/gemini.ts`.

## Verification

After running the cleanup script, you can verify the changes by:

1. Checking the script output for the detailed report
2. Reviewing MCQ banks in the UI to ensure no section reference questions remain
3. Generating new MCQs to confirm they follow the new guidelines

## Rollback

If you need to rollback these changes:

1. The cleanup script does **not** create backups automatically
2. Consider creating a MongoDB backup before running the script:
   ```bash
   mongodump --uri="your-mongodb-uri" --out=backup-before-cleanup
   ```
3. To restore:
   ```bash
   mongorestore --uri="your-mongodb-uri" backup-before-cleanup
   ```

## Support

If you encounter any issues:

1. Check that your `.env.local` file has the correct `MONGODB_URI`
2. Ensure all npm dependencies are installed
3. Review the script output for specific error messages
4. Check MongoDB connection and permissions

## Additional Notes

- The script is **idempotent** - running it multiple times is safe
- No questions are removed if they don't match the section reference patterns
- The script provides detailed logging for transparency
- All database operations are performed with proper error handling
