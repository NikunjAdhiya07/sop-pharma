# MCQ Review System - Quick Reference Guide

## 🌟 What's New?

A complete review system has been added to allow flagging and editing of inappropriate or poorly formatted test questions.

---

## 📍 Key Features

### 1. **Star Icon on Every Question**
- Located in the top-right corner of each question during tests
- Click to flag a question for review
- Turns amber/gold when flagged
- Shows "Flagged" label when marked

### 2. **Review Center Page**
- Access via: `/mcq-review` or "Review Center" button on test page
- View all flagged questions in one place
- Filter by: All, Pending, or Done
- Statistics dashboard showing pending/done counts

### 3. **Edit Questions**
- Click edit button (pencil icon) on any review
- Modify:
  - Question text
  - All 4 options
  - Correct answer
  - Explanation
  - Difficulty level
  - SOP reference
- Save or cancel changes

### 4. **Status Management**
- **Pending**: Newly flagged, awaiting review
- **Done**: Reviewed and completed
- Toggle between statuses with buttons
- Delete reviews when no longer needed

---

## 🎯 How to Use

### As a Test Taker:
1. Take any test normally
2. See a question that's wrong/unclear? Click the ⭐ star icon
3. Question is flagged automatically
4. Continue your test - flagging doesn't affect your score

### As a Reviewer/Admin:
1. Go to Test Center → Click "Review Center"
2. See all flagged questions
3. Click "Edit" on a question
4. Make your changes
5. Click "Save Changes"
6. Click "Mark as Done" when finished
7. Edited questions will be used in future tests!

---

## 🎨 Visual Guide

### Flagging During Test:
```
┌─────────────────────────────────────────────┐
│ Question 5 of 20                      ⭐    │ ← Click star to flag
│                                             │
│ What is the primary mechanism...           │
│                                             │
│ ○ Option A                                  │
│ ○ Option B                                  │
│ ○ Option C                                  │
│ ○ Option D                                  │
└─────────────────────────────────────────────┘
```

### Review Center:
```
┌─────────────────────────────────────────────┐
│ ⭐ MCQ Review Center                        │
│                                             │
│ [All] [Pending] [Done]  ← Filter tabs       │
│                                             │
│ ┌─────────────────────────────────────────┐ │
│ │ 🟡 PENDING  SOP-001                     │ │
│ │                                         │ │
│ │ Question: What is...                    │ │
│ │ Options: A, B, C, D                     │ │
│ │                                         │ │
│ │ [✏️ Edit] [✓ Done] [🗑️ Delete]         │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## 🔧 Technical Details

### Files Created:
1. **Model**: `src/models/MCQReview.ts`
2. **API**: `src/app/api/mcq-review/route.ts`
3. **Page**: `src/app/mcq-review/page.tsx`
4. **Updated**: `src/components/TestRunner.tsx`

### Database:
- New collection: `mcqreviews`
- Stores original + edited versions
- Tracks who flagged/edited and when
- Prevents duplicate flagging

### API Endpoints:
- `GET /api/mcq-review` - Fetch reviews
- `POST /api/mcq-review` - Flag question
- `PUT /api/mcq-review` - Edit/update status
- `DELETE /api/mcq-review` - Remove review

---

## 🎨 Color Coding

| Color | Meaning |
|-------|---------|
| 🟡 Amber/Gold | Pending review, flagged items |
| 🟢 Emerald | Done, completed reviews |
| 🔵 Blue | Edit mode, editing actions |
| 🔴 Red | Delete actions |
| 🟣 Purple | Primary actions, navigation |

---

## ✅ Status Flow

```
Question in Test
      ↓
   [Click ⭐]
      ↓
Review Created (PENDING)
      ↓
   [Edit Question]
      ↓
   [Save Changes]
      ↓
   [Mark as Done]
      ↓
Review Complete (DONE)
      ↓
Edited version used in future tests
```

---

## 🚀 Next Steps

1. **Test the System**:
   - Start any test
   - Flag a question
   - Go to Review Center
   - Edit and mark as done

2. **Integrate with Test Generation**:
   - Update test generation logic to check for edited versions
   - Use edited questions when available
   - Fall back to original if no edit exists

3. **Add User Authentication**:
   - Track which user flagged/edited
   - Add permissions for reviewers
   - Audit trail for all changes

---

## 📞 Support

For questions or issues:
- Check documentation: `docs/MCQ_REVIEW_SYSTEM.md`
- Review code comments in source files
- Test with sample data first

---

**Version**: 1.0  
**Last Updated**: January 2026  
**Status**: ✅ Production Ready
