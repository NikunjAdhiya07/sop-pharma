# 🔧 Fix: Drop Unique Index on SOP Identifier

## ❌ Current Error

You're getting this error when trying to upload the same SOP:
```
MongoServerError: E11000 duplicate key error collection
```

This is because MongoDB still has the old unique index on the `identifier` field.

---

## ✅ Solution: Drop the Unique Index

### **Option 1: Use API Route (Easiest)**

**Step 1:** Open your browser and navigate to:
```
http://localhost:3001/api/admin/drop-index
```

**Step 2:** You should see a response like:
```json
{
  "success": true,
  "message": "Unique index on identifier dropped successfully"
}
```

**Step 3:** Try uploading your SOP again - it should work now!

---

### **Option 2: Use MongoDB Compass (Manual)**

**Step 1:** Open MongoDB Compass

**Step 2:** Connect to your database:
```
mongodb+srv://nikunjadhiya32:sharpuxnik@cluster0.eqfeda5.mongodb.net/
```

**Step 3:** Navigate to:
- Database: `sop-mcq-bank`
- Collection: `sops`
- Tab: **Indexes**

**Step 4:** Find the index named `identifier_1`

**Step 5:** Click the **trash icon** next to it to drop the index

**Step 6:** Confirm deletion

**Step 7:** Try uploading your SOP again!

---

### **Option 3: Use MongoDB Shell**

**Step 1:** Connect to MongoDB:
```bash
mongosh "mongodb+srv://nikunjadhiya32:sharpuxnik@cluster0.eqfeda5.mongodb.net/sop-mcq-bank"
```

**Step 2:** Run this command:
```javascript
db.sops.dropIndex("identifier_1")
```

**Step 3:** You should see:
```json
{ "nIndexesWas": 3, "ok": 1 }
```

**Step 4:** Try uploading your SOP again!

---

## 🎯 Quick Test

After dropping the index, test it:

1. **Upload SOP**: `QCMI01-00_Entry_Exit_Procedure.pdf`
2. **Should succeed** ✅
3. **Upload SAME SOP again**
4. **Should succeed again** ✅
5. **No more duplicate errors!** 🎉

---

## 📋 Verification

To verify the index is dropped:

### **Using API:**
```
GET http://localhost:3001/api/admin/drop-index
```

### **Using MongoDB Compass:**
- Check Indexes tab
- `identifier_1` should be gone
- Only `_id_` and maybe `uploadedAt_-1` should remain

---

## ⚠️ Important Notes

1. **This is safe** - Dropping the unique index won't delete any data
2. **Existing SOPs** - All your existing SOPs will remain intact
3. **Future uploads** - You can now upload same SOP multiple times
4. **Performance** - No impact on query performance

---

## 🚀 After Fixing

Once the index is dropped, you can:
- ✅ Upload same SOP unlimited times
- ✅ Generate different MCQ sets
- ✅ Build massive question banks
- ✅ No duplicate identifier errors

---

## 🆘 If It Still Doesn't Work

1. **Restart the server**:
   ```bash
   # Stop current server (Ctrl+C)
   npm run dev
   ```

2. **Clear MongoDB cache**:
   - Disconnect and reconnect to MongoDB

3. **Check the error message**:
   - If still getting E11000 error, index wasn't dropped
   - Try Option 2 or 3 above

4. **Verify connection**:
   - Make sure MongoDB URI is correct
   - Check network access in MongoDB Atlas

---

## ✅ Success Indicators

You'll know it worked when:
- ✅ No E11000 error
- ✅ Upload succeeds
- ✅ Can upload same SOP again
- ✅ See message: "SOP uploaded successfully"

---

## 🎉 Next Steps

After fixing:
1. Upload your SOP
2. Generate MCQs
3. Upload same SOP again
4. Generate more MCQs
5. Build your question bank!

---

**Recommended: Use Option 1 (API Route) - It's the easiest!**

Just open: **http://localhost:3001/api/admin/drop-index** in your browser!
