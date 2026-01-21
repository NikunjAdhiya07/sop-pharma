# 🔧 Validation Error Fix - MCQ Generation

## Issue Identified

The bulk MCQ generation was failing with validation errors:
```
MCQBank validation failed: mcqs: MCQs must be between 1 and 500 questions
```

## Root Cause

The initial implementation tried to create an **empty MCQ bank** (0 MCQs) upfront to enable incremental saving. However, the `MCQBank` model has a validation rule that requires **at least 1 MCQ**:

```typescript
// In MCQBank.ts line 117
validate: {
  validator: (v: IMCQ[]) => v.length >= 1 && v.length <= 500,
  message: 'MCQs must be between 1 and 500 questions',
}
```

## Solution Implemented

Changed the incremental saving strategy:

### ❌ **Before (Broken)**
1. Create empty MCQ bank with 0 MCQs → **VALIDATION ERROR**
2. Generate batches and append to empty bank
3. Save after each batch

### ✅ **After (Fixed)**
1. Generate first batch (20 MCQs)
2. Create MCQ bank with first batch → **VALIDATION PASSES**
3. Generate subsequent batches
4. Append each batch to existing bank
5. Save after each batch

## Code Changes

### Updated Logic Flow

```typescript
// Check if bank exists
let existingBank = await MCQBank.findOne({ sopId: sop._id });

if (!existingBank) {
  console.log('Will create MCQ bank with first batch');
}

// In onBatchComplete callback:
const currentBank = await MCQBank.findOne({ sopId: sop._id });

if (!currentBank) {
  // First batch - create the bank with MCQs
  await MCQBank.create({
    sopId: sop._id,
    mcqs: batchMcqs,  // ✅ At least 1 MCQ
    totalQuestions: batchMcqs.length,
    // ... other fields
  });
} else {
  // Subsequent batches - append
  currentBank.mcqs = [...currentBank.mcqs, ...batchMcqs];
  await currentBank.save();
}
```

## Benefits Maintained

✅ **Incremental Saving**: Still saves after each batch  
✅ **No Data Loss**: Interruption preserves all saved batches  
✅ **Faster Generation**: Still using 20 MCQs per batch  
✅ **Validation Compliance**: Now passes all model validations  

## Testing

The fix ensures:
- First batch creates the bank with 20 MCQs ✅
- Subsequent batches append 20 MCQs each ✅
- If interrupted at batch 3, you keep 60 MCQs ✅
- All validation rules are satisfied ✅

## Files Modified

- **`src/app/api/files/process-folder/route.ts`**
  - Removed empty bank creation
  - Updated `onBatchComplete` to create bank on first batch
  - Fixed variable references (`mcqBank` → `finalBank`)

**The validation error is now resolved and bulk processing should work correctly!** ✅
