# Quick Start - Authentication System

## 🎯 What Was Created

A complete authentication system for your SOP Pharma application with:
- **Login Page** - Beautiful UI with animated background
- **Dashboard** - Protected page with user info and stats
- **User Model** - MongoDB schema for user data
- **API Endpoints** - Login and seed endpoints

## 🔑 Demo Credentials

```
Username: demo
Password: 123456
```

## 🚀 How to Use

### Step 1: Create Test User (One-time setup)

Run this command in a **new terminal** (keep your dev server running):

```bash
npm run create-user
```

You should see:
```
✅ Test user created successfully!
📋 Login credentials:
   Username: demo
   Password: 123456
   Role: admin
```

### Step 2: Access the Application

1. Open your browser and go to: `http://localhost:3000`
2. You'll be redirected to the login page
3. Enter credentials:
   - Username: `demo`
   - Password: `123456`
4. Click "Sign In"
5. You'll be redirected to the dashboard!

## 📁 Files Created

### Models
- `src/models/User.ts` - User database model

### Pages
- `src/app/login/page.tsx` - Login page
- `src/app/dashboard/page.tsx` - Dashboard page

### API Routes
- `src/app/api/auth/login/route.ts` - Login endpoint
- `src/app/api/auth/seed/route.ts` - Seed user endpoint

### Scripts
- `scripts/create-test-user.ts` - Create test user script

### Documentation
- `AUTHENTICATION_GUIDE.md` - Complete guide

## 🔄 Application Flow

```
Visit http://localhost:3000
         ↓
    Not logged in?
         ↓
  Redirect to /login
         ↓
   Enter credentials
         ↓
    Click Sign In
         ↓
  Redirect to /dashboard
```

## 🎨 Features

### Login Page
- Animated gradient background
- Glassmorphism design
- Form validation
- Error messages
- Demo credentials display

### Dashboard
- User profile display
- Statistics cards (SOPs, MCQ Banks, Questions)
- Quick action cards
- Logout functionality
- Protected route (requires login)

## 🛠️ Commands

```bash
# Create test user (run once)
npm run create-user

# Start dev server (if not running)
npm run dev
```

## 🔒 Security Notes

⚠️ **This is for DEVELOPMENT/TESTING only!**

Current implementation:
- Passwords stored in plain text
- Session in localStorage
- No encryption

For production, you need:
- Password hashing (bcrypt)
- JWT tokens or next-auth
- HTTPS
- Secure session management

## 🐛 Troubleshooting

### "Invalid credentials" error
- Make sure you ran `npm run create-user` first
- Check MongoDB is connected
- Verify username/password are correct

### Can't access dashboard
- Clear browser localStorage
- Try logging out and in again
- Check browser console for errors

### User already exists
- This is fine! You can proceed to login
- The script won't create duplicates

## 📝 Next Steps

1. Run `npm run create-user` to create the test user
2. Navigate to `http://localhost:3000`
3. Login with demo credentials
4. Explore the dashboard!

---

**Need help?** Check `AUTHENTICATION_GUIDE.md` for detailed documentation.
