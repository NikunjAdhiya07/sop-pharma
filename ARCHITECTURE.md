# 📊 System Architecture - SOP MCQ Bank Generator

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Homepage   │  │  SOP Upload  │  │  MCQ Bank    │          │
│  │   (/)        │  │ (/sop-upload)│  │ (/mcq-bank)  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API LAYER (Next.js)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ POST /upload │  │POST /generate│  │ GET /mcq-bank│          │
│  │              │  │    -mcqs     │  │              │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SERVICE LAYER                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Document   │  │    Gemini    │  │   MongoDB    │          │
│  │    Parser    │  │  AI Service  │  │  Connection  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  SOP Model   │  │ MCQBank Model│  │   File       │          │
│  │  (MongoDB)   │  │  (MongoDB)   │  │  Storage     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## 🔄 Data Flow

### 1️⃣ SOP Upload Flow

```
User selects file
      │
      ▼
Frontend validates (PDF/DOCX, size)
      │
      ▼
POST /api/sop/upload
      │
      ├─► Parse document (pdf-parse/mammoth)
      │
      ├─► Extract text content
      │
      ├─► Validate content (min 100 words)
      │
      ├─► Save file to /uploads
      │
      └─► Create SOP record in MongoDB
            │
            ▼
      Return SOP ID & metadata
```

### 2️⃣ MCQ Generation Flow

```
User clicks "Generate MCQ Bank"
      │
      ▼
POST /api/sop/generate-mcqs
      │
      ├─► Fetch SOP content from MongoDB
      │
      ├─► Send to Gemini 2.5 Flash
      │     │
      │     ├─► AI analyzes SOP
      │     │
      │     ├─► Generates 40 MCQs
      │     │
      │     └─► Returns structured JSON
      │
      ├─► Validate response (40 MCQs, correct format)
      │
      ├─► Calculate difficulty distribution
      │
      └─► Save MCQ Bank to MongoDB
            │
            ▼
      Return MCQ Bank ID & stats
```

### 3️⃣ MCQ Bank Viewing Flow

```
User navigates to /mcq-bank
      │
      ▼
GET /api/mcq-bank
      │
      ├─► Query MongoDB for MCQ Banks
      │
      ├─► Apply filters (difficulty, SOP)
      │
      ├─► Paginate results
      │
      └─► Return MCQ Banks
            │
            ▼
      Display in UI with filters
```

## 🗄️ Database Schema

### SOP Collection

```typescript
{
  _id: ObjectId,
  name: string,                    // "Quality Control Procedures"
  identifier: string,              // "SOP-QC-001" (unique)
  fileUrl: string,                 // "/uploads/sops/SOP-QC-001_123456.pdf"
  fileType: "pdf" | "docx",
  content: string,                 // Extracted text
  uploadedAt: Date,
  processedAt: Date,
  status: "uploaded" | "processing" | "completed" | "failed",
  mcqCount: number,                // 40
  metadata: {
    fileSize: number,
    pageCount: number,
    wordCount: number
  }
}
```

### MCQBank Collection

```typescript
{
  _id: ObjectId,
  sopId: ObjectId,                 // Reference to SOP
  sopName: string,
  sopIdentifier: string,
  mcqs: [
    {
      question: string,
      difficulty: "Easy" | "Medium" | "Hard",
      options: string[],           // Min 4 options
      correctAnswer: string,
      explanation: string,
      sopReference: string,
      optionVariants: [
        {
          text: string,
          isCorrect: boolean
        }
      ]
    }
  ],
  generatedAt: Date,
  totalQuestions: number,          // Always 40
  difficultyDistribution: {
    easy: number,                  // 13-15
    medium: number,                // 13-15
    hard: number                   // 10-14
  }
}
```

## 🤖 AI Prompt Structure

The Gemini AI receives a structured prompt with:

1. **Context**: Role as pharmaceutical MCQ expert
2. **Input**: SOP content, name, identifier
3. **Requirements**:
   - Exactly 40 MCQs
   - 3 difficulty levels
   - 4+ options per question
   - Option variants
   - SOP references
   - Explanations
4. **Output Format**: Structured JSON
5. **Quality Rules**: Compliance-focused, no assumptions

## 🔒 Security Considerations

- ✅ File type validation (PDF/DOCX only)
- ✅ File size limits (10MB max)
- ✅ Content validation (min/max word count)
- ✅ Environment variables for secrets
- ✅ MongoDB connection with authentication
- ✅ API key protection
- ✅ Input sanitization
- ✅ Error handling and logging

## 📈 Scalability

### Current Implementation
- Single-server deployment
- Synchronous MCQ generation
- File storage on disk

### Future Enhancements
- Background job processing (Bull/Redis)
- Cloud storage (AWS S3, Google Cloud Storage)
- Caching layer (Redis)
- Rate limiting
- User authentication
- Batch processing
- API versioning

## 🎯 Performance Metrics

| Operation | Expected Time |
|-----------|---------------|
| File upload | < 2 seconds |
| Document parsing | < 5 seconds |
| MCQ generation | 30-60 seconds |
| MCQ Bank query | < 1 second |
| Page load | < 2 seconds |

## 🔧 Technology Stack

### Frontend
- **Framework**: Next.js 15
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **State**: React Hooks

### Backend
- **Runtime**: Node.js
- **Framework**: Next.js App Router
- **API**: REST (Next.js API Routes)

### Database
- **Primary**: MongoDB Atlas
- **ODM**: Mongoose
- **Indexing**: sopId, identifier, status

### AI/ML
- **Provider**: Google AI
- **Model**: Gemini 2.5 Flash
- **SDK**: @google/generative-ai

### Document Processing
- **PDF**: pdf-parse
- **DOCX**: mammoth

## 📊 MCQ Quality Metrics

Each generated MCQ is validated for:

1. **Structure**:
   - ✅ Question text present
   - ✅ 4+ options
   - ✅ Correct answer in options
   - ✅ Explanation provided
   - ✅ SOP reference included

2. **Content Quality**:
   - ✅ Based on SOP content
   - ✅ Clear and unambiguous
   - ✅ Single correct answer
   - ✅ Diverse options
   - ✅ Appropriate difficulty

3. **Distribution**:
   - ✅ Total: 40 questions
   - ✅ Easy: 13-15 (32-37%)
   - ✅ Medium: 13-15 (32-37%)
   - ✅ Hard: 10-14 (25-35%)

## 🚀 Deployment Options

### Development
```bash
npm run dev
# Runs on http://localhost:3000
```

### Production

#### Option 1: Vercel (Recommended)
```bash
npm run build
vercel deploy
```

#### Option 2: Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

#### Option 3: Traditional Server
```bash
npm run build
npm start
# Runs on port 3000
```

## 📝 API Documentation

### Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sop/upload` | Upload SOP file |
| POST | `/api/sop/generate-mcqs` | Generate MCQs |
| GET | `/api/sop/list` | List all SOPs |
| GET | `/api/mcq-bank` | Get MCQ banks |

### Response Formats

All responses follow this structure:
```json
{
  "success": boolean,
  "message": string,
  "data": object,
  "error": string (if failed)
}
```

## 🎨 UI/UX Features

- **Responsive Design**: Works on desktop, tablet, mobile
- **Dark Theme**: Purple/pink gradient aesthetic
- **Glassmorphism**: Backdrop blur effects
- **Animations**: Smooth transitions and hover effects
- **Loading States**: Clear feedback during operations
- **Error Handling**: User-friendly error messages
- **Accessibility**: Semantic HTML, ARIA labels

## 📊 System Requirements

### Development
- Node.js 18+
- 4GB RAM minimum
- 1GB free disk space

### Production
- Node.js 18+
- 8GB RAM recommended
- 10GB free disk space
- MongoDB Atlas (M0 free tier or higher)
- Google AI API access

## 🔄 Maintenance

### Regular Tasks
- Monitor MongoDB storage
- Check API quota (Gemini)
- Review error logs
- Update dependencies
- Backup database
- Clean old uploads

### Monitoring
- API response times
- Error rates
- MCQ generation success rate
- Database query performance
- Storage usage
