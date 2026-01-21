# MCQ Generation JSON Parsing Fix

## Problem
The AI was returning truncated JSON responses during MCQ generation, causing parse errors like:
```
Expected ',' or ']' after array element in JSON at position 4984
```

This happened when the AI response was cut off mid-object, leaving incomplete JSON that couldn't be parsed. **The entire batch would fail, losing all progress.**

## Root Causes
1. **Token Limit**: The previous `maxOutputTokens` of 16384 was sometimes insufficient for generating 10 MCQs with all required fields
2. **Naive JSON Repair**: The old cleanup function would blindly add closing brackets/braces, but this doesn't work when JSON is truncated in the middle of an object
3. **Insufficient Error Context**: Error messages didn't show enough context to diagnose where truncation occurred
4. **No Graceful Degradation**: A single failed batch would cause the entire generation process to fail, losing all previously generated MCQs

## Solutions Implemented

### 1. Increased Token Limit
- **Before**: `maxOutputTokens: 16384`
- **After**: `maxOutputTokens: 32768`
- **Benefit**: Reduces likelihood of truncation by doubling available space

### 2. Lower Temperature
- **Before**: `temperature: 0.2`
- **After**: `temperature: 0.1`
- **Benefit**: More deterministic output, better JSON structure consistency

### 3. Improved Smart JSON Repair Algorithm
The enhanced `cleanAndExtractJSON` function now:
- Detects when JSON is truncated (unbalanced braces/brackets)
- Parses through the JSON character by character, tracking:
  - Brace depth (to know when objects are complete)
  - String state (to avoid false positives inside strings)
  - Escape sequences (to handle escaped quotes)
- **NEW**: Finds **ALL** complete MCQ objects in the array (not just those followed by commas)
- Truncates at the last complete object and properly closes the JSON structure
- Falls back to simple bracket addition if smart repair fails
- **Enhanced logging** to show exactly what's happening during repair

**Example**:
```json
// Truncated response:
{ "mcqs": [ {...}, {...}, {"question": "incomplete", "options": [
```

**Smart repair**:
```json
// Finds last complete object and closes properly:
{ "mcqs": [ {...}, {...} ] }
```

### 4. Graceful Degradation (NEW!)
**Most Important Feature**: The system now continues processing even if individual batches fail.

- **Before**: One failed batch → entire generation fails → lose all MCQs
- **After**: Failed batches are logged and skipped → continue with remaining batches → return all successfully generated MCQs

**Behavior**:
```
Batch 1: ✅ 10 MCQs
Batch 2: ✅ 10 MCQs
Batch 3: ❌ Failed (JSON error)
Batch 4: ✅ 10 MCQs
...
Result: Returns 90 MCQs instead of failing completely
```

### 5. Enhanced Error Logging
Now logs:
- Warning if response seems suspiciously short
- Total JSON length
- Context around the exact error position (±100 chars)
- Both beginning and end of the response
- Detailed brace/bracket counting during repair
- Summary of failed batches at the end

## Testing
The fix has been deployed. To test:
1. Try processing a batch of SOPs
2. Monitor the console for:
   - `⚠️ Detected truncated JSON - attempting smart repair...`
   - `✂️ Found X complete objects, truncating to last one at position Y`
   - `❌ Batch X failed after all retries. Continuing with remaining batches...`
   - `⚠️ Generation completed with X failed batch(es): ...`
3. Verify that the process completes and saves all successfully generated MCQs

## Expected Behavior
- **Best case**: No truncation occurs (due to higher token limit) → 100 MCQs generated
- **Good case**: Truncation detected and repaired automatically → batch succeeds with fewer MCQs
- **Graceful degradation**: Some batches fail completely → system continues and returns partial results (e.g., 70-90 MCQs)
- **Only fails completely**: If the very first batch fails AND has 0 MCQs (extremely rare)

## Files Modified
- `src/lib/gemini.ts`:
  - Updated `geminiModel` configuration (lines 9-17)
  - Enhanced `cleanAndExtractJSON` function (lines 52-207)
  - Improved error logging in `generateSingleBatch` (lines 228-378)
  - **Added graceful degradation** in `generateMCQsFromSOP` (lines 380-437)

## Impact
✅ **No more complete failures** - partial results are always saved
✅ **Better JSON repair** - finds all complete objects, not just those with trailing commas
✅ **Detailed diagnostics** - easier to debug when issues occur
✅ **Higher success rate** - doubled token limit reduces truncation

## Date
2026-01-17 (Updated with graceful degradation)

