# ✅ Auto-Generated SOP Identifier Feature

## 🎯 What Changed

The SOP Identifier field is now **automatically generated** from your filename!

---

## 🔄 How It Works

### **When you upload a file:**

1. **SOP Name** is auto-filled from filename
2. **SOP Identifier** is automatically extracted/generated

### **Identifier Detection Logic:**

#### **Option 1: Extract Existing Code** (Preferred)
If your filename contains a code pattern like:
- `QCMI01-00`
- `SOP-QC-001`
- `QC123`
- `MICRO-01`

The system will **automatically extract it**!

**Examples:**
- `QCMI01-00_ENTRY AND EXIT PROCEDURE.pdf` → **`QCMI01-00`**
- `SOP-QC-001 Quality Control.docx` → **`SOP-QC-001`**
- `MICRO123 Laboratory Procedures.pdf` → **`MICRO123`**

#### **Option 2: Generate from Words** (Fallback)
If no code pattern is found, it creates an identifier from the first 3 words:

**Examples:**
- `Quality Control Procedures.pdf` → **`QUALITY-CONTROL-PROCEDURES`**
- `Entry Exit Procedure.docx` → **`ENTRY-EXIT-PROCEDURE`**
- `Lab Safety Guidelines.pdf` → **`LAB-SAFETY-GUIDELINES`**

#### **Option 3: Timestamp** (Last Resort)
If the filename is too short or unclear:
- Generates: **`SOP-{timestamp}`**
- Example: `SOP-1767612075477`

---

## ✏️ Can You Edit It?

**YES!** The identifier is editable:
- Auto-generated value appears in the field
- You can modify it before uploading
- Useful if the auto-detection isn't perfect

---

## 🎨 UI Updates

### **Label:**
```
SOP Identifier (Auto-generated from filename)
```

### **Placeholder:**
```
Auto-detected or enter manually (e.g., SOP-QC-001)
```

### **Help Text:**
```
💡 Identifier is automatically extracted from your filename. You can edit if needed.
```

---

## 📝 Best Practices for Filenames

### **Recommended Naming:**
Include a clear code at the start of your filename:

✅ **Good Examples:**
- `QCMI01-00_Entry and Exit Procedure.pdf`
- `SOP-QC-001_Quality Control Testing.docx`
- `MICRO-LAB-01_Laboratory Safety.pdf`

❌ **Avoid:**
- `Document1.pdf` (no meaningful code)
- `Untitled.docx` (will generate generic identifier)
- `SOP.pdf` (too short)

---

## 🧪 Examples

| Filename | Auto-Generated Identifier |
|----------|---------------------------|
| `QCMI01-00_ENTRY AND EXIT PROCEDURE.pdf` | `QCMI01-00` |
| `SOP-QC-001 Quality Control.docx` | `SOP-QC-001` |
| `Quality Control Procedures.pdf` | `QUALITY-CONTROL-PROCEDURES` |
| `Lab Safety.docx` | `LAB-SAFETY` |
| `SOP.pdf` | `SOP-{timestamp}` |

---

## 🔍 Duplicate Detection

The system still checks for duplicate identifiers:
- If identifier already exists → Shows error
- You can edit the identifier to make it unique
- Or use a different filename

---

## ✅ Benefits

1. **No Manual Typing**: Identifier auto-fills when you select a file
2. **Smart Detection**: Extracts existing codes from filenames
3. **Editable**: You can still modify if needed
4. **Prevents Errors**: Reduces typos and mistakes
5. **Saves Time**: Upload faster without manual entry

---

## 🎯 How to Use

### **Step 1: Name Your File Properly**
```
QCMI01-00_Entry and Exit Procedure in Microbiology Laboratory.pdf
```

### **Step 2: Upload File**
- Click upload area
- Select your file

### **Step 3: Check Auto-Generated Values**
- **SOP Name**: Auto-filled ✅
- **SOP Identifier**: Auto-filled ✅

### **Step 4: Edit if Needed** (Optional)
- Modify identifier if auto-detection isn't perfect

### **Step 5: Upload**
- Click "Upload SOP"
- Generate MCQs!

---

## 💡 Pro Tips

1. **Use consistent naming**: `CODE_Description.pdf`
2. **Include version numbers**: `SOP-QC-001-v2.pdf`
3. **Separate with hyphens**: `QCMI01-00` not `QCMI0100`
4. **Use uppercase codes**: Easier to read and detect

---

## 🆘 Troubleshooting

### **Identifier not detected correctly?**
- **Solution**: Edit the field manually before uploading

### **"SOP with this identifier already exists"?**
- **Solution**: Edit the identifier to make it unique
- Or delete the existing SOP first

### **Generated identifier too long?**
- **Solution**: Edit to shorten it (e.g., `QC-PROC-MICRO` → `QCMI01`)

---

## 🎉 Ready to Use!

The auto-identifier feature is now active!

**Try it:**
1. Upload a file with a code in the name
2. Watch the identifier auto-fill
3. Upload without typing!

---

**Feature Status**: ✅ Active  
**Manual Entry**: ✅ Still Available  
**Smart Detection**: ✅ Enabled
