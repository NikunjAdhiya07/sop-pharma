# SOP MCQ Bank Generator

A powerful AI-driven application that generates high-quality Multiple Choice Questions (MCQs) from Standard Operating Procedures (SOPs) using Google's Gemini 1.5 Flash (Gemini 2.5).

## 🎯 Features

- **SOP Upload**: Upload PDF or DOCX SOP documents
- **AI-Powered Generation**: Automatically generate 40 MCQs per SOP using Gemini 1.5 Flash
- **Difficulty Levels**: Questions distributed across Easy, Medium, and Hard levels
- **Option Variants**: Multiple phrasings for each option to prevent memorization
- **MCQ Bank**: Permanent storage of generated MCQs in MongoDB
- **Search & Filter**: Browse and filter MCQs by difficulty level
- **Export**: Export MCQ banks to JSON format
- **SOP References**: Each question includes exact SOP source reference

## 🛠 Tech Stack

- **Frontend**: Next.js 15 with TypeScript
- **Backend**: Next.js App Router (API Routes)
- **Database**: MongoDB with Mongoose
- **AI**: Google Generative AI (Gemini 2.5 Flash)
- **Styling**: Tailwind CSS
- **Document Parsing**: pdf-parse, mammoth

## 📋 Prerequisites

- Node.js 18+ 
- MongoDB Atlas account or local MongoDB instance
- Google AI API Key (for Gemini)

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd sop-pharma
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env.local` file in the root directory:

```env
MONGODB_URI=your_mongodb_connection_string
GOOGLE_AI_API_KEY=your_google_ai_api_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 4. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📁 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── sop/
│   │   │   ├── upload/route.ts       # SOP upload endpoint
│   │   │   ├── generate-mcqs/route.ts # MCQ generation endpoint
│   │   │   └── list/route.ts         # List SOPs endpoint
│   │   └── mcq-bank/route.ts         # MCQ Bank endpoint
│   ├── sop-upload/page.tsx           # SOP upload page
│   ├── mcq-bank/page.tsx             # MCQ Bank viewing page
│   └── page.tsx                      # Homepage
├── lib/
│   ├── mongodb.ts                    # MongoDB connection
│   ├── gemini.ts                     # Gemini AI service
│   └── documentParser.ts             # PDF/DOCX parser
└── models/
    ├── SOP.ts                        # SOP model
    └── MCQBank.ts                    # MCQ Bank model
```

## 🎨 MCQ Generation Process

1. **Upload SOP**: User uploads PDF/DOCX file with SOP name and identifier
2. **Parse Document**: Extract text content from the document
3. **AI Processing**: Gemini 2.5 Flash analyzes the SOP content
4. **Generate MCQs**: AI creates exactly 40 MCQs with:
   - Question text
   - 4+ options
   - Correct answer
   - Explanation
   - SOP reference
   - Option variants
   - Difficulty level (Easy/Medium/Hard)
5. **Store in Database**: MCQs are permanently saved in MongoDB
6. **Ready for Use**: MCQs can be viewed, filtered, and exported

## 📊 MCQ Quality Rules

- Questions based strictly on SOP content
- No assumptions or external knowledge
- Exactly ONE correct answer per question
- Minimum 4 options per question
- Options are grammatically different variations
- Clear explanations for correct answers
- Exact SOP references included
- Difficulty distribution:
  - Easy: 13-15 questions
  - Medium: 13-15 questions
  - Hard: 10-14 questions

## 🔒 Environment Variables

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection string |
| `GOOGLE_AI_API_KEY` | Google AI API key for Gemini |
| `NEXT_PUBLIC_APP_URL` | Application URL |

## 📝 API Endpoints

### POST `/api/sop/upload`
Upload an SOP document

**Body**: FormData with `file`, `sopName`, `sopIdentifier`

### POST `/api/sop/generate-mcqs`
Generate MCQs from an uploaded SOP

**Body**: `{ sopId: string }`

### GET `/api/sop/list`
List all uploaded SOPs

**Query**: `status`, `page`, `limit`

### GET `/api/mcq-bank`
Get MCQ banks

**Query**: `sopId`, `difficulty`, `page`, `limit`

## 🎯 Usage Example

1. Navigate to **Upload SOP** page
2. Select a PDF or DOCX file
3. Enter SOP name (e.g., "Quality Control Procedures")
4. Enter SOP identifier (e.g., "SOP-QC-001")
5. Click **Upload SOP**
6. Click **Generate MCQ Bank**
7. Wait for AI to generate 40 MCQs
8. View MCQs in the **MCQ Bank** page

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- Google Gemini AI for powerful MCQ generation
- Next.js team for the amazing framework
- MongoDB for reliable data storage
