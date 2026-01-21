# MCQ Review System Documentation

## Overview
The MCQ Review System allows users to flag questions during tests that are inappropriate, poorly formatted, or need improvement. Flagged questions are stored in a dedicated Review Section where they can be edited, and once marked as "Done," the updated versions are used in future tests.

## Features

### 1. **Flag Questions During Tests**
- **Star Icon**: Each question in the test has a star icon in the top-right corner
- **Click to Flag**: Click the star to mark a question for review
- **Visual Feedback**: Flagged questions show a filled amber star with "Flagged" label
- **Auto-Save**: Questions are automatically saved to the review database when flagged

### 2. **Review Center Dashboard**
- **Access**: Navigate to `/mcq-review` or click "Review Center" button on test page
- **Filter Options**:
  - **All**: View all flagged questions
  - **Pending**: Questions awaiting review/editing
  - **Done**: Completed reviews
- **Statistics**: See counts of pending and completed reviews at a glance

### 3. **Edit Questions**
- **Edit Button**: Click the edit icon on any review item
- **Editable Fields**:
  - Question text
  - All 4 options
  - Correct answer (dropdown selection)
  - Explanation
  - Difficulty level (Easy/Medium/Hard)
  - SOP Reference
- **Save/Cancel**: Save changes or cancel to revert

### 4. **Status Management**
- **Mark as Done**: After editing, mark the review as complete
- **Reopen**: Reopen completed reviews if further changes are needed
- **Delete**: Remove reviews that are no longer needed

### 5. **Future Test Integration**
- Questions marked as "Done" with edits will use the edited version in future tests
- Original questions are preserved for reference
- Edited questions are clearly labeled with an "Edited" badge

## Database Schema

### MCQReview Model
```typescript
{
  originalMcqBankId: ObjectId,        // Reference to original MCQ bank
  originalQuestionIndex: number,       // Index in original bank
  sopId: ObjectId,                     // SOP reference
  sopName: string,
  sopIdentifier: string,
  
  originalQuestion: {                  // Original question data
    question, options, correctAnswer, 
    explanation, difficulty, etc.
  },
  
  editedQuestion: {                    // Edited version (optional)
    question, options, correctAnswer,
    explanation, difficulty, etc.
  },
  
  reviewStatus: 'pending' | 'done',
  flaggedBy: string,
  flaggedAt: Date,
  reviewNotes: string,
  editedBy: string,
  editedAt: Date,
  markedDoneBy: string,
  markedDoneAt: Date
}
```

## API Endpoints

### GET `/api/mcq-review`
Fetch all reviews or filter by status
- **Query Params**: 
  - `status`: 'pending' | 'done'
  - `sopId`: Filter by specific SOP
- **Response**: Array of review items

### POST `/api/mcq-review`
Flag a question for review
- **Body**:
  ```json
  {
    "mcqBankId": "...",
    "questionIndex": 0,
    "sopId": "...",
    "sopName": "...",
    "sopIdentifier": "...",
    "question": { ... },
    "flaggedBy": "User Name",
    "reviewNotes": "Reason for flagging"
  }
  ```

### PUT `/api/mcq-review`
Update a review (edit question or change status)
- **Body**:
  ```json
  {
    "reviewId": "...",
    "editedQuestion": { ... },  // Optional
    "reviewStatus": "done",      // Optional
    "editedBy": "User Name",
    "markedDoneBy": "User Name"
  }
  ```

### DELETE `/api/mcq-review?reviewId=...`
Delete a review item

## User Workflow

### For Test Takers
1. Start any test (Interview, Induction, Regular, etc.)
2. While answering questions, click the star icon on any question that seems inappropriate
3. The question is automatically flagged and saved
4. Continue with the test normally
5. Flagged questions don't affect test scoring

### For Administrators/Reviewers
1. Navigate to "Review Center" from the test page
2. See all flagged questions organized by status
3. Click "Edit" on any question to modify it
4. Update question text, options, correct answer, explanation, etc.
5. Click "Save Changes" to store the edited version
6. Click "Mark as Done" to complete the review
7. Done questions with edits will be used in future tests

## UI Components

### TestRunner Component
- Added `markedForReview` state (Set of question indices)
- Added `handleToggleReview()` function for flagging
- Added star button in question header
- Visual feedback with amber highlighting

### MCQReview Page
- Filter tabs (All/Pending/Done)
- Statistics cards showing counts
- Expandable review items with edit mode
- Inline editing with real-time preview
- Action buttons (Edit, Mark Done, Reopen, Delete)

## Design Highlights
- **Amber Theme**: Review features use amber/gold colors for visibility
- **Filled Star**: Flagged questions show a filled star icon
- **Status Badges**: Color-coded badges (amber=pending, emerald=done)
- **Edit Badge**: Blue "Edited" badge on modified questions
- **Smooth Transitions**: All interactions have smooth animations
- **Responsive Layout**: Works on all screen sizes

## Future Enhancements
1. **User Authentication**: Track who flagged/edited each question
2. **Bulk Operations**: Edit or approve multiple questions at once
3. **Version History**: Track all changes made to a question
4. **Analytics**: Report on most-flagged questions or SOPs
5. **Auto-Apply Edits**: Automatically update MCQ banks with approved edits
6. **Review Workflow**: Add approval process for edits before going live
7. **Comments**: Allow reviewers to add comments/discussion on questions

## Technical Notes
- Reviews are stored separately from original MCQ banks
- Original questions are never modified directly
- Edited versions are stored in the `editedQuestion` field
- Test generation logic should check for edited versions first
- Duplicate flagging is prevented (one review per question)
- All timestamps are tracked for audit purposes

## Testing Checklist
- [ ] Flag a question during a test
- [ ] Verify it appears in Review Center
- [ ] Edit the question and save changes
- [ ] Mark as done
- [ ] Verify edited version is used in next test
- [ ] Reopen a completed review
- [ ] Delete a review
- [ ] Filter by status (pending/done)
- [ ] Test with multiple SOPs
- [ ] Verify no duplicate flagging
