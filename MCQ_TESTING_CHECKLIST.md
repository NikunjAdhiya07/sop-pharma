# ✅ MCQ Generation Enhancement - Testing Checklist

## Pre-Testing Verification

- [x] Batch size increased from 10 to 20 MCQs
- [x] `onBatchComplete` callback added to interface
- [x] Incremental saving implemented in bulk process API
- [x] AI model unchanged (`gemini-3-flash-preview`)
- [x] Error handling improved for partial results

---

## Test Scenarios

### 🧪 Test 1: Normal Bulk Processing
**Objective**: Verify faster generation and incremental saving

**Steps**:
1. Place 2-3 SOP files in the `files` folder
2. Navigate to `/bulk-process`
3. Click "Process All Files & Generate MCQs"
4. Monitor console logs

**Expected Results**:
- ✅ See "📝 Created empty MCQ bank for incremental saving"
- ✅ See "💾 Saved batch of 20 MCQs. Total: 20"
- ✅ See "💾 Saved batch of 20 MCQs. Total: 40"
- ✅ Each batch saves immediately (not at the end)
- ✅ Generation completes in ~2.5 minutes per SOP
- ✅ Final count shows 100 MCQs per SOP

**Database Verification**:
```javascript
// Check MCQ Bank during generation
// Count should increase after each batch:
// Batch 1: 20 MCQs
// Batch 2: 40 MCQs
// Batch 3: 60 MCQs
// Batch 4: 80 MCQs
// Batch 5: 100 MCQs
```

---

### 🧪 Test 2: Interruption Recovery (Manual Test)
**Objective**: Verify MCQs are saved even if process is interrupted

**Steps**:
1. Start bulk processing with 1 SOP file
2. Watch console logs
3. After seeing "Batch 2 saved to database", stop the server (Ctrl+C)
4. Restart server
5. Check MCQ Bank for that SOP

**Expected Results**:
- ✅ MCQ Bank exists with 40 MCQs (from batches 1 and 2)
- ✅ No data loss
- ✅ Can resume generation by running process again

---

### 🧪 Test 3: Existing MCQ Bank Regeneration
**Objective**: Verify incremental saving works with existing banks

**Steps**:
1. Process an SOP that already has MCQs
2. Run bulk process again for the same SOP
3. Monitor console logs

**Expected Results**:
- ✅ See "🔄 Regenerating MCQs for: [SOP Name]. Current count: [X]"
- ✅ New MCQs appended to existing bank
- ✅ Total count increases correctly
- ✅ No duplicate MCQs

---

### 🧪 Test 4: Batch Failure Handling
**Objective**: Verify partial results are saved when some batches fail

**Steps**:
1. Start bulk processing
2. Monitor for any batch failures (if API is overloaded)

**Expected Results**:
- ✅ Failed batches logged with warning
- ✅ Successful batches still saved
- ✅ Process continues to next batch
- ✅ Final count reflects successful batches only

---

### 🧪 Test 5: Performance Comparison
**Objective**: Verify faster generation time

**Setup**:
- Use the same SOP for comparison
- Note: Can't directly compare old vs new in same system

**Expected Timing**:
- **5 batches × 30 seconds** = ~2.5 minutes
- **Plus 4 delays × 5 seconds** = +20 seconds
- **Total**: ~3 minutes per SOP (vs ~5 minutes before)

---

## Console Log Checklist

During bulk processing, you should see:

```
✅ Step 1: Empty bank creation
📝 Created empty MCQ bank for incremental saving: [SOP Name]

✅ Step 2: Batch 1 generation
📡 Fetching Batch 1/5...
📡 Calling Gemini API for batch 1 (Attempt 1/6)...
📥 Batch 1 raw response length: [X] chars
✅ Batch 1 parsed successfully: 20 questions
✅ Batch 1 added. Total so far: 20

✅ Step 3: Batch 1 save
💾 Calling onBatchComplete callback for batch 1...
💾 Saved batch of 20 MCQs. Total: 20
✅ Batch 1 saved to database

✅ Step 4: Wait before next batch
⏳ Waiting 5 seconds before next batch to prevent rate limiting...

... (repeat for batches 2-5)

✅ Step 5: Final verification
✅ Final MCQ count for [SOP Name]: 100 questions
```

---

## Database Verification Queries

### Check MCQ Bank During Generation
```javascript
// In MongoDB or your database client
db.mcqbanks.find({ sopName: "YOUR_SOP_NAME" })
  .project({ totalQuestions: 1, mcqs: { $size: "$mcqs" } })

// Should show increasing count:
// After Batch 1: totalQuestions: 20
// After Batch 2: totalQuestions: 40
// After Batch 3: totalQuestions: 60
// After Batch 4: totalQuestions: 80
// After Batch 5: totalQuestions: 100
```

### Verify No Duplicates
```javascript
// Check for duplicate questions
db.mcqbanks.aggregate([
  { $match: { sopName: "YOUR_SOP_NAME" } },
  { $unwind: "$mcqs" },
  { $group: { 
      _id: "$mcqs.question", 
      count: { $sum: 1 } 
  }},
  { $match: { count: { $gt: 1 } } }
])

// Should return empty array (no duplicates)
```

---

## Troubleshooting

### Issue: "onBatchComplete is not a function"
**Solution**: Restart the dev server to load updated code

### Issue: MCQs not saving incrementally
**Solution**: 
1. Check console for save errors
2. Verify database connection
3. Check MongoDB is running

### Issue: Batch size still 10 instead of 20
**Solution**: 
1. Clear Next.js cache: `rm -rf .next`
2. Restart dev server

### Issue: Generation slower than expected
**Possible Causes**:
- API rate limiting (normal)
- Network latency
- Large SOP content
- Check console for retry attempts

---

## Success Criteria

✅ **Faster Generation**: 5 batches instead of 10  
✅ **Incremental Saves**: MCQs saved after each batch  
✅ **No Data Loss**: Interruption preserves partial results  
✅ **Same Quality**: AI model and prompts unchanged  
✅ **Error Handling**: Graceful degradation on failures  
✅ **Logging**: Clear progress indicators  

---

## Production Readiness

Before deploying to production:

- [ ] Test with 10+ SOPs in bulk
- [ ] Verify database performance with incremental saves
- [ ] Test interruption recovery manually
- [ ] Monitor API quota usage
- [ ] Check error logs for any issues
- [ ] Verify MCQ quality remains high
- [ ] Test with different SOP sizes (small, medium, large)

---

## Rollback Plan

If issues arise, you can rollback by:

1. **Revert `src/lib/gemini.ts`**:
   - Change `BATCH_SIZE` back to 10
   - Remove `onBatchComplete` from interface
   - Remove callback implementation

2. **Revert `src/app/api/files/process-folder/route.ts`**:
   - Remove empty bank creation
   - Remove `onBatchComplete` callback
   - Restore original save logic

3. **Restart server**

---

## Next Steps

1. ✅ Run Test 1 (Normal Bulk Processing)
2. ✅ Run Test 2 (Interruption Recovery)
3. ✅ Verify console logs match expected output
4. ✅ Check database for incremental saves
5. ✅ Monitor performance improvements
6. 🚀 Deploy to production when satisfied

**Your enhanced MCQ generation system is ready for testing!** 🎉
