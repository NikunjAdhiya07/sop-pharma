# MCQ JSON Error Fix Documentation

## Issue
The application was experiencing "AI returned malformed JSON in batch X" errors when generating MCQs using the **gemini-3-pro-preview** model.

## Root Cause
The Gemini AI model sometimes returns responses that:
1. Include markdown code blocks (```json ... ```)
2. Have trailing commas or extra whitespace
3. May be truncated (missing closing braces/brackets)
4. Include extra text before or after the JSON
5. Have inconsistent formatting

## Solution Implemented

### 1. **Enhanced JSON Cleaning Function** (`cleanAndExtractJSON`)
This new function handles multiple edge cases:

- **Markdown Removal**: Strips ```json and ``` markers
- **Character Cleanup**: Removes leading/trailing non-JSON characters
- **JSON Formatting Fixes**:
  - Removes trailing commas
  - Normalizes whitespace (newlines, tabs, carriage returns)
  - Consolidates multiple spaces
- **Truncation Repair**: 
  - Counts opening/closing braces and brackets
  - Automatically adds missing closing characters

### 2. **Retry Logic**
- Each batch now retries up to **2 times** if it fails
- Uses exponential backoff (1s, 2s delays)
- Helps handle temporary AI response issues

### 3. **Better Error Logging**
- Shows first 200 and last 200 characters of failed JSON
- Displays the specific parse error message
- Logs response length for debugging
- Tracks retry attempts

### 4. **Enhanced Validation**
- Checks if response starts with valid JSON character
- Validates the `mcqs` array exists and is not empty
- Ensures at least 1 question was generated

## Benefits
✅ More stable MCQ generation  
✅ Automatic recovery from common JSON issues  
✅ Better debugging information when errors occur  
✅ No change to AI model (still using gemini-3-pro-preview)  
✅ Backward compatible with existing code  

## Testing
To test the fix:
1. Navigate to MCQ Bank page
2. Click "Generate More Questions" on any SOP
3. Monitor the browser console for detailed logs
4. Check that batches complete successfully

## Technical Details

### Before
```typescript
// Simple extraction - prone to failure
let jsonText = text.trim();
if (jsonText.includes('```json')) {
  jsonText = jsonText.split('```json')[1].split('```')[0].trim();
}
```

### After
```typescript
// Robust cleaning with multiple fallbacks
const jsonText = cleanAndExtractJSON(rawText);
// + Validation
// + Retry logic
// + Detailed error messages
```

## Model Configuration (Fixed)
```typescript
model: 'models/gemini-3-pro-preview'  // ✅ Correct format with 'models/' prefix
responseMimeType: "application/json"
maxOutputTokens: 16384
temperature: 0.2
```

**Important**: The model name must include the `models/` prefix for the Gemini API to work correctly.

### Common Errors Fixed

#### 1. Fetch Failed Error
**Error**: `[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-preview:generateContent: fetch failed`

**Cause**: Model name was missing the `models/` prefix

**Fix**: Changed from `'gemini-3-pro-preview'` to `'models/gemini-3-pro-preview'`

#### 2. Enhanced API Error Handling
Now catches and reports specific errors:
- **Network errors**: Connection issues
- **Authentication errors**: Invalid or missing API key
- **Rate limit errors**: Quota exceeded
- **Model errors**: Model not available
- **Generic API errors**: Other Gemini API issues

Each error provides a clear, actionable message to help diagnose the problem.

---
**Last Updated**: 2026-01-10  
**Status**: ✅ Fixed and Deployed
