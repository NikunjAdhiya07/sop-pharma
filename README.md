# SOP Pharma - MCQ Bank Generator

AI-powered MCQ generation system for pharmaceutical SOPs.

## Features

- 📤 SOP Upload (PDF/DOCX)
- 🤖 AI-powered MCQ Generation
- 📚 MCQ Bank Management
- ✅ MCQ Testing Module
- 👥 User Management
- 🎯 Role-based Access Control

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` file:
```env
MONGODB_URI=your_mongodb_connection_string
GEMINI_API_KEY=your_google_gemini_api_key
```

3. Run development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Default Login

- Username: `demo`
- Password: `123456`

## Tech Stack

- Next.js 14
- MongoDB
- Google Gemini AI
- TypeScript
- Tailwind CSS
