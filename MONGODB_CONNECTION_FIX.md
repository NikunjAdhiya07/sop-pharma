# MongoDB Connection Error Fix Guide

## Error
```
[MongoNetworkError: getaddrinfo ENOTFOUND ac-chyxli3-shard-00-00.rop3mr6.mongodb.net]
```

## What This Means
Your application cannot connect to MongoDB Atlas because it cannot resolve the hostname. This is a **network/database issue**, NOT an AI model issue.

## ✅ Solutions (Step-by-Step)

### Solution 1: Check MongoDB Atlas Cluster Status
**Most Common Cause**: Free tier MongoDB Atlas clusters automatically pause after 60 days of inactivity.

**Steps**:
1. Go to [MongoDB Atlas](https://cloud.mongodb.com/)
2. Log in with your credentials
3. Check if your cluster shows "PAUSED" status
4. If paused, click the **"Resume"** button
5. Wait 2-3 minutes for the cluster to start
6. Try generating MCQs again

### Solution 2: Check Your Internet Connection
**Steps**:
1. Open a web browser
2. Try accessing https://www.google.com
3. If you can't access websites, fix your internet connection first
4. Once connected, restart your dev server

### Solution 3: Verify MongoDB Connection String
**Steps**:
1. In MongoDB Atlas, click "Connect" on your cluster
2. Choose "Connect your application"
3. Copy the connection string
4. Compare it with your `.env.local` file
5. Make sure the hostname matches: `ac-chyxli3-shard-00-00.rop3mr6.mongodb.net`

### Solution 4: Check Firewall/Network Settings
**Steps**:
1. Disable VPN temporarily (if using one)
2. Check if your firewall is blocking MongoDB Atlas
3. Try connecting from a different network (e.g., mobile hotspot)

### Solution 5: Update MongoDB Atlas IP Whitelist
**Steps**:
1. In MongoDB Atlas, go to "Network Access"
2. Click "Add IP Address"
3. Choose "Allow Access from Anywhere" (0.0.0.0/0) for testing
4. Click "Confirm"
5. Wait 2-3 minutes for changes to propagate
6. Try again

## What I've Already Fixed

### ✅ Enhanced MongoDB Connection (mongodb.ts)
- Added **retry logic** (3 attempts with exponential backoff)
- Added **better error messages** for common issues
- Added **timeout configuration** (10s server selection, 45s socket)
- Connection will now automatically retry if it fails temporarily

### ✅ Enhanced Gemini AI Error Handling (gemini.ts)
- Added **retry logic** for AI generation failures
- Added **JSON cleaning** to handle malformed responses
- Added **detailed error logging**
- **Model remains unchanged**: `models/gemini-3-pro-preview`

## Quick Test

After fixing MongoDB connection, test by:
1. Refresh your browser
2. Go to the SOP upload page
3. Click "Generate MCQ Bank" on any SOP
4. Check browser console for connection logs

## Expected Console Output (When Working)
```
🔄 Attempting MongoDB connection (1/3)...
✅ MongoDB connected successfully
📡 Fetching Batch 1/5...
📥 Batch 1 raw response length: XXXX chars
✅ Batch 1 parsed successfully: 10 questions
```

## Still Having Issues?

If none of the above works:
1. Check the browser console (F12) for detailed error messages
2. Check the terminal where `npm run dev` is running
3. The enhanced error messages will tell you exactly what's wrong

---
**Note**: Your **Gemini AI model has NOT been changed**. It's still using `models/gemini-3-pro-preview` as requested.

**Last Updated**: 2026-01-10  
**Status**: MongoDB connection enhanced with retry logic
