# Authentication System Setup Guide

## Overview
This SOP Pharma application now includes a complete authentication system with login and dashboard functionality.

## Features
- ✅ User authentication with username and password
- ✅ Beautiful login page with animated background
- ✅ Protected dashboard with user information
- ✅ Session management using localStorage
- ✅ Automatic redirects based on authentication status
- ✅ Logout functionality
- ✅ Demo user pre-configured

## Demo Credentials
- **Username:** demo
- **Password:** 123456

## Setup Instructions

### 1. Initialize Demo User
Before you can log in, you need to create the demo user in the database. You have two options:

#### Option A: Using Browser (Recommended)
1. Make sure your dev server is running (`npm run dev`)
2. Open your browser and navigate to:
   ```
   http://localhost:3000/api/auth/seed
   ```
3. You should see a success message indicating the demo user was created

#### Option B: Using curl/PowerShell
Run this command in PowerShell:
```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/auth/seed" -Method POST
```

### 2. Access the Application
1. Navigate to `http://localhost:3000`
2. You'll be automatically redirected to the login page
3. Enter the demo credentials:
   - Username: `demo`
   - Password: `123456`
4. Click "Sign In"
5. You'll be redirected to the dashboard

## Application Flow

### Authentication Flow
```
1. User visits http://localhost:3000
   ↓
2. Check if user is logged in (localStorage)
   ↓
3a. If logged in → Redirect to /dashboard
3b. If not logged in → Redirect to /login
   ↓
4. User enters credentials on /login
   ↓
5. API validates credentials (/api/auth/login)
   ↓
6. On success, user data stored in localStorage
   ↓
7. Redirect to /dashboard
```

### Dashboard Features
- User profile display with name and role
- Statistics cards showing:
  - Total SOPs
  - MCQ Banks
  - Total Questions
  - Last Activity
- Quick action cards for:
  - Upload SOP
  - MCQ Bank
  - Test Center
- Logout button

## File Structure

### New Files Created
```
src/
├── models/
│   └── User.ts                          # User model for MongoDB
├── app/
│   ├── api/
│   │   └── auth/
│   │       ├── login/
│   │       │   └── route.ts            # Login API endpoint
│   │       └── seed/
│   │           └── route.ts            # Seed demo user endpoint
│   ├── login/
│   │   └── page.tsx                    # Login page
│   └── dashboard/
│       └── page.tsx                    # Dashboard page
```

### Modified Files
```
src/app/page.tsx                        # Updated to redirect based on auth status
```

## API Endpoints

### POST /api/auth/login
Authenticates a user with username and password.

**Request Body:**
```json
{
  "username": "demo",
  "password": "123456"
}
```

**Success Response:**
```json
{
  "success": true,
  "user": {
    "id": "...",
    "username": "demo",
    "name": "Demo User",
    "role": "admin"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

### POST /api/auth/seed
Creates the demo user in the database. Safe to call multiple times (won't create duplicates).

**Success Response:**
```json
{
  "success": true,
  "message": "Demo user created successfully",
  "user": {
    "username": "demo",
    "name": "Demo User",
    "role": "admin"
  }
}
```

## Security Notes

### Current Implementation (Development)
- ⚠️ Passwords are stored in **plain text** (NOT SECURE)
- ⚠️ Session management uses **localStorage** (NOT SECURE for production)
- ⚠️ No JWT tokens or secure session management

### For Production Use
You should implement:
1. **Password Hashing:** Use bcrypt to hash passwords
   ```bash
   npm install bcrypt
   npm install --save-dev @types/bcrypt
   ```

2. **Secure Sessions:** Use JWT tokens or next-auth
   ```bash
   npm install jsonwebtoken
   npm install next-auth
   ```

3. **HTTPS:** Always use HTTPS in production

4. **Environment Variables:** Store secrets in .env files

5. **CSRF Protection:** Implement CSRF tokens

6. **Rate Limiting:** Add rate limiting to prevent brute force attacks

## Adding New Users

To add new users, you can create an API endpoint or use MongoDB directly:

### Using MongoDB Shell
```javascript
db.users.insertOne({
  username: "newuser",
  password: "password123",  // In production, hash this!
  name: "New User",
  role: "user",
  createdAt: new Date()
})
```

### Using API (Create this endpoint)
Create a new file: `src/app/api/auth/register/route.ts`

## Troubleshooting

### Issue: "Invalid credentials" error
- Make sure you've run the seed endpoint first
- Check that MongoDB is connected
- Verify the username and password are correct

### Issue: Stuck on "Redirecting..."
- Clear your browser's localStorage
- Check browser console for errors
- Ensure the dev server is running

### Issue: Can't access dashboard
- Make sure you're logged in
- Check localStorage for user data
- Try logging out and logging in again

### Issue: Demo user already exists
- This is normal if you've run the seed endpoint before
- You can proceed to login

## Next Steps

1. **Protect Other Routes:** Add authentication checks to other pages
2. **Add User Management:** Create admin panel to manage users
3. **Implement Proper Security:** Add bcrypt, JWT, etc.
4. **Add Password Reset:** Implement forgot password functionality
5. **Add User Registration:** Allow new users to sign up
6. **Session Timeout:** Add automatic logout after inactivity

## Support

For issues or questions, check:
- Browser console for errors
- Terminal for server errors
- MongoDB connection status
- Network tab in browser DevTools

---

**Created:** January 16, 2026
**Version:** 1.0.0
