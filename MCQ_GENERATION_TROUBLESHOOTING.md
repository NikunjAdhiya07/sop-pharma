# 🔴 MCQ Generation Troubleshooting Guide

## Current Status

✅ **Upload Working**: SOP uploaded successfully  
✅ **Auto-Identifier**: Working perfectly (`QCMI02-00`)  
✅ **Word Count**: 763 words  
❌ **MCQ Generation**: Failed  

---

## 🔍 Possible Causes

### 1. **API Quota Exceeded** (Most Likely)

Even with `gemini-1.5-flash-latest`, you might have:
- Used up your daily quota (1,500 requests/day)
- Hit the per-minute limit (15 requests/minute)
- Exceeded token limits

**Check Your Usage:**
- Visit: https://ai.dev/usage?tab=rate-limit
- Look for "Quota Exceeded" messages
- Check when quota resets

**Solution:**
- **Wait**: Quota resets every 24 hours
- **Or**: Wait 1 minute for per-minute quota
- **Or**: Get a paid plan for higher limits

---

### 2. **API Key Issues**

Your API key might be:
- Invalid or expired
- Not activated for Gemini API
- Restricted to certain models

**Solution:**
1. Go to: https://aistudio.google.com/app/apikey
2. Check if key is active
3. Create a new key if needed
4. Update `.env.local` with new key
5. Restart server

---

### 3. **Model Name Issue**

The model `gemini-1.5-flash-latest` might not be available in your region.

**Try these alternatives:**
```typescript
// Option 1: Standard stable version
model: 'gemini-1.5-flash'

// Option 2: Pro version (slower but more capable)
model: 'gemini-1.5-pro'

// Option 3: Specific version
model: 'gemini-1.5-flash-001'
```

---

### 4. **Content Too Large**

Your SOP has 763 words, which should be fine, but the prompt + content might exceed limits.

**Current Limits:**
- Input tokens: ~32,000 per request
- Your content: ~763 words ≈ 1,000 tokens
- Prompt: ~500 tokens
- Total: ~1,500 tokens (well within limit ✅)

---

## ✅ Quick Fixes

### Fix 1: Wait for Quota Reset
```
Wait 24 hours or check: https://ai.dev/usage
```

### Fix 2: Try Different Model
Edit `src/lib/gemini.ts` line 10:
```typescript
model: 'gemini-1.5-flash'  // Remove '-latest'
```

### Fix 3: Get New API Key
1. Visit: https://aistudio.google.com/app/apikey
2. Create new key
3. Update `.env.local`
4. Restart: `npm run dev`

### Fix 4: Check Error Logs
Look at terminal for detailed error message:
```
Error generating MCQs: [detailed message]
```

---

## 🧪 Test API Key

Create a test file to verify your API key works:

**test-gemini.js:**
```javascript
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI('YOUR_API_KEY');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

async function test() {
  try {
    const result = await model.generateContent('Say hello');
    console.log('✅ API Key works!');
    console.log(result.response.text());
  } catch (error) {
    console.error('❌ API Key failed:', error.message);
  }
}

test();
```

Run: `node test-gemini.js`

---

## 📊 Check Quota Status

### Via API Console:
1. Go to: https://console.cloud.google.com/apis/dashboard
2. Select your project
3. Check "Quotas & System Limits"
4. Look for "Generative Language API"

### Via AI Studio:
1. Go to: https://ai.dev/usage?tab=rate-limit
2. Check current usage
3. See when quota resets

---

## 🔄 Alternative Solutions

### Option 1: Use Smaller Chunks
Instead of generating 40 MCQs at once, generate in batches:
- 10 MCQs per request
- Make 4 requests
- Combine results

### Option 2: Reduce MCQ Count
Temporarily generate fewer MCQs:
- Change from 40 to 20
- Test if it works
- Increase gradually

### Option 3: Use Different AI Provider
If Gemini quota is exhausted:
- OpenAI GPT-4
- Anthropic Claude
- Cohere

---

## 🛠️ Debug Steps

### Step 1: Check Terminal Logs
Look for the exact error message in terminal:
```
Error generating MCQs: [message]
```

### Step 2: Test API Key
Run the test script above

### Step 3: Check Quota
Visit usage dashboard

### Step 4: Try Different Model
Change model name in code

### Step 5: Wait and Retry
Wait 1 hour and try again

---

## 💡 Common Error Messages

### "Quota exceeded"
**Solution**: Wait for quota reset or upgrade plan

### "API key not valid"
**Solution**: Create new API key

### "Model not found"
**Solution**: Use 'gemini-1.5-flash' instead of 'gemini-1.5-flash-latest'

### "Failed to fetch"
**Solution**: Check internet connection

### "Content too large"
**Solution**: Reduce SOP size or split into chunks

---

## 🎯 Recommended Action Plan

1. **Check terminal** for exact error message
2. **Visit** https://ai.dev/usage to check quota
3. **If quota exceeded**: Wait 24 hours
4. **If API key issue**: Create new key
5. **If model issue**: Change to 'gemini-1.5-flash'
6. **Test** with a small SOP first

---

## 📞 Get Help

**Check these resources:**
- Gemini API Docs: https://ai.google.dev/docs
- Rate Limits: https://ai.google.dev/gemini-api/docs/rate-limits
- Pricing: https://ai.google.dev/pricing
- Support: https://support.google.com/

---

## ✅ What's Working

- ✅ File upload
- ✅ PDF parsing (763 words extracted)
- ✅ Auto-identifier detection
- ✅ MongoDB connection
- ✅ Server running

**Only issue**: MCQ generation (likely quota)

---

## 🚀 Next Steps

1. **Check the terminal** - What's the exact error?
2. **Check quota** - https://ai.dev/usage
3. **Share error message** - I can help debug
4. **Or wait** - Try again in 24 hours

---

**Most likely**: You've exceeded your daily quota. Wait 24 hours or upgrade your plan!
