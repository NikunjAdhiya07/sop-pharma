# 🚀 Quick Reference: MCQ Section Reference Cleanup

## One-Command Solution

```bash
npm run cleanup:mcq-sections
```

---

## What This Does

✅ Removes MCQs like: "In section 4.4.2, what is stated?"  
✅ Keeps MCQs like: "What is the calibration frequency?"  
✅ Updates all statistics automatically  
✅ Provides detailed report of changes  

---

## Alternative Methods

### API Analysis (Safe - No Changes)
```bash
curl http://localhost:3000/api/mcq-bank/cleanup-section-references
```

### API Cleanup (Removes MCQs)
```bash
curl -X POST http://localhost:3000/api/mcq-bank/cleanup-section-references \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Detected Patterns

| ❌ Avoid | ✅ Better |
|---------|----------|
| "In section 4.4.2, what..." | "What is the calibration frequency?" |
| "Section 5.1 states..." | "What are the maintenance steps?" |
| "What does section 3.2 say?" | "What is the testing protocol?" |

---

## Files to Know

- **AI Prompt**: `src/lib/gemini.ts` (prevents future issues)
- **Cleanup Script**: `scripts/cleanup-section-reference-mcqs.ts`
- **API Endpoint**: `src/app/api/mcq-bank/cleanup-section-references/route.ts`
- **Full Guide**: `MCQ_CLEANUP_GUIDE.md`

---

## Safety

✅ Idempotent (safe to run multiple times)  
✅ Only removes pattern-matched questions  
✅ Auto-updates statistics  
✅ Detailed logging  

---

## Need Help?

📖 Read: `MCQ_CLEANUP_GUIDE.md`  
📊 View: `IMPLEMENTATION_COMPLETE.md`  
🧪 Test: `npm run test:section-patterns`

---

**Status**: ✅ Ready to Use  
**Last Updated**: 2026-01-08
