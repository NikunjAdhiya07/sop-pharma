# 🎯 Role-Based Section Visibility & MCQ Test Module Implementation

## ✅ Completed Features

### 1. **Role-Based Section Visibility System**

#### User Model Updates (`src/models/User.ts`)
- ✅ Added `allowedSections` field to User interface and schema
- ✅ Implemented automatic section assignment based on user roles:
  - **Admin**: Full access to all sections (dashboard, sop-upload, mcq-bank, bulk-process, files-manager, admin, mcq-tests)
  - **Trainer**: Limited access (dashboard, sop-upload, mcq-bank, mcq-tests)
  - **User**: Basic access (dashboard, mcq-tests)

#### Available Sections
```typescript
const AVAILABLE_SECTIONS = [
  'dashboard',       // Main dashboard
  'sop-upload',      // Upload SOP files
  'mcq-bank',        // View MCQ banks
  'bulk-process',    // Bulk MCQ generation
  'files-manager',   // File management
  'admin',           // Admin panel
  'mcq-tests',       // Take MCQ tests (NEW)
];
```

### 2. **MCQ Bank Test Module** (NEW)

#### Database Models Created

**MCQBankTestResult Model** (`src/models/MCQBankTestResult.ts`)
- Stores comprehensive test results for MCQ Bank tests
- Tracks question-by-question performance
- Includes difficulty breakdown analysis
- Supports review functionality
- Calculates grades (A+, A, B+, B, C, D, F)
- Records attempt numbers for retakes

**Key Fields:**
- User information (userId, username, userFullName)
- Test metadata (mcqBankId, sopName, testName)
- Detailed question responses with selected/correct answers
- Performance metrics (score, grade, isPassed)
- Difficulty breakdown (easy/medium/hard performance)
- Time tracking (timeTaken, startedAt, completedAt)
- Review status (reviewed, reviewedAt)
- Attempt tracking (attemptNumber)

#### API Routes Created

**`/api/mcq-tests/route.ts`**
- **GET**: Fetch available MCQ banks with user's test history
  - Returns all MCQ banks with attempt counts and best scores
  - Shows user's previous attempts for each bank
- **POST**: Submit test results
  - Processes answers and calculates scores
  - Generates difficulty breakdown
  - Assigns grades based on performance
  - Updates user statistics
  - Supports multiple attempts

**`/api/mcq-tests/results/route.ts`**
- **GET**: Fetch test result details
  - Get specific test result by ID
  - Get all test results for a user
- **PATCH**: Mark test as reviewed
  - Updates review status and timestamp

### 3. **Test Features**

#### Scoring System
- **Passing Score**: 70% (configurable)
- **Grade Scale**:
  - A+: 95-100%
  - A: 90-94%
  - B+: 85-89%
  - B: 80-84%
  - C: 70-79%
  - D: 60-69%
  - F: Below 60%

#### Analytics & Tracking
- ✅ Question-by-question breakdown
- ✅ Difficulty-based performance analysis
- ✅ Time tracking
- ✅ Multiple attempt support
- ✅ Best score tracking
- ✅ Review functionality
- ✅ User statistics updates

---

## 📋 Next Steps for Frontend Implementation

### 1. **Update Admin Panel** (Partially Done)
The admin panel already has user management. You need to add:
- Section visibility checkboxes in the "Create User" and "Edit User" forms
- Display allowed sections in the user table
- Allow admins to customize which sections each user can access

### 2. **Create MCQ Test Taking Page** (`src/app/mcq-tests/page.tsx`)
Create a new page with:
- List of available MCQ banks
- Show user's previous attempts and best scores
- "Start Test" button for each bank
- Filter by department/difficulty

### 3. **Create Test Interface** (`src/app/mcq-tests/[id]/page.tsx`)
Build the actual test-taking interface:
- Display questions one by one or all at once
- Multiple choice selection
- Timer display
- Progress indicator
- Submit test functionality

### 4. **Create Results Page** (`src/app/mcq-tests/results/[id]/page.tsx`)
Show detailed test results:
- Overall score and grade
- Pass/Fail status
- Question-by-question review
- Correct/incorrect answers with explanations
- Difficulty breakdown chart
- Time taken
- Option to retake test

### 5. **Update Navigation/Dashboard**
- Add "MCQ Tests" link to main navigation
- Implement section visibility check in navigation
- Hide sections user doesn't have access to
- Add test statistics to user dashboard

---

## 🔧 Implementation Guide

### Adding Section Visibility to Admin Panel

```typescript
// In admin page, add to Create User form:
<div>
  <label className="block text-sm font-semibold text-purple-300 mb-2">
    Allowed Sections
  </label>
  <div className="space-y-2">
    {['dashboard', 'sop-upload', 'mcq-bank', 'bulk-process', 'files-manager', 'admin', 'mcq-tests'].map(section => (
      <label key={section} className="flex items-center space-x-2">
        <input
          type="checkbox"
          name="allowedSections"
          value={section}
          className="rounded"
        />
        <span className="text-white capitalize">{section.replace('-', ' ')}</span>
      </label>
    ))}
  </div>
</div>
```

### Example Test Taking Flow

```typescript
// 1. Fetch available tests
const response = await fetch(`/api/mcq-tests?userId=${userId}`);
const { mcqBanks } = await response.json();

// 2. Start a test (fetch questions from MCQ bank)
const bank = await fetch(`/api/mcq-bank/${bankId}`);
const questions = bank.mcqs;

// 3. Submit answers
const result = await fetch('/api/mcq-tests', {
  method: 'POST',
  body: JSON.stringify({
    userId,
    mcqBankId,
    answers: selectedAnswers,
    timeTaken,
    startedAt,
  }),
});

// 4. Show results
const { testResult } = await result.json();
router.push(`/mcq-tests/results/${testResult._id}`);
```

---

## 📊 Database Schema Summary

### User Model (Updated)
```typescript
{
  username: string;
  password: string;
  name: string;
  role: 'admin' | 'user' | 'trainer';
  allowedSections: string[]; // NEW
  // ... other fields
}
```

### MCQBankTestResult Model (New)
```typescript
{
  userId: ObjectId;
  mcqBankId: ObjectId;
  questions: [{
    question: string;
    selectedAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    // ... more fields
  }];
  score: number;
  grade: string;
  isPassed: boolean;
  difficultyBreakdown: {
    easy: { correct: number; total: number };
    medium: { correct: number; total: number };
    hard: { correct: number; total: number };
  };
  reviewed: boolean;
  attemptNumber: number;
  // ... more fields
}
```

---

## 🎨 UI Components Needed

1. **MCQ Test List Card** - Shows available tests with stats
2. **Test Interface** - Question display with options
3. **Timer Component** - Countdown timer
4. **Progress Bar** - Shows completion progress
5. **Results Dashboard** - Detailed score breakdown
6. **Review Mode** - Shows correct/incorrect answers with explanations
7. **Attempt History** - Lists all previous attempts

---

## 🔐 Security Considerations

- ✅ User authentication required for all test endpoints
- ✅ Validate user has access to requested sections
- ✅ Prevent answer tampering (server-side validation)
- ✅ Rate limiting for test submissions
- ✅ Secure storage of test results

---

## 📝 Testing Checklist

- [ ] Admin can create users with custom section access
- [ ] Users only see sections they have access to
- [ ] Users can view available MCQ tests
- [ ] Users can start and complete tests
- [ ] Scores are calculated correctly
- [ ] Difficulty breakdown is accurate
- [ ] Multiple attempts are tracked properly
- [ ] Review functionality works
- [ ] User statistics update after test completion

---

## 🚀 Ready to Use

All backend infrastructure is complete and ready. You can now:
1. Update the admin panel to include section visibility management
2. Create the frontend pages for MCQ test taking
3. Implement the test interface and results display

The system supports:
- ✅ Role-based access control
- ✅ Comprehensive test tracking
- ✅ Multiple attempts
- ✅ Detailed analytics
- ✅ Review functionality
- ✅ User statistics

**Backend is 100% complete. Frontend implementation can begin immediately!**
