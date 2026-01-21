# ✅ Flagged Questions Feature Added!

## 🎉 **Flag Questions for Review**

Users can now flag questions they want to review later during the test!

---

## 🎯 **What Was Added**

### **1. Flagged Button** ⭐
**Location**: Next to the difficulty badge on each question

**Features:**
- **Golden/yellow styling** when flagged
- **Gray styling** when not flagged
- **Award icon** (trophy/star)
- **Text changes**: "Flag" → "Flagged"
- **Click to toggle** on/off

### **2. Visual States**

**Unflagged (Default):**
```
┌──────────────────────────────────────┐
│ Question 1/100  ⭐⭐ Medium  Flag    │
└──────────────────────────────────────┘
```
- Gray background
- Gray text
- Gray border
- Shows "Flag"

**Flagged (Active):**
```
┌──────────────────────────────────────┐
│ Question 1/100  ⭐⭐ Medium  Flagged │
└──────────────────────────────────────┘
```
- Yellow/golden background
- Yellow text
- Yellow border
- Shows "Flagged"

### **3. Question Number Grid Indicators** ⭐

**Flagged questions show a star** in the number grid:
```
┌─────────────────────────────────────┐
│  1⭐  2   3⭐  4   5   6   7⭐  8   │
└─────────────────────────────────────┘
```

- Small star (⭐) appears at top-right of number
- Easy to identify flagged questions
- Visible from any question

---

## 🚀 **How to Use**

### **Step 1: Flag a Question**
1. Read the question
2. Click the **"Flag"** button (next to difficulty)
3. Button turns **yellow** and shows "Flagged"
4. Question is marked for review

### **Step 2: Unflag a Question**
1. Click the **"Flagged"** button again
2. Button turns **gray** and shows "Flag"
3. Question is unmarked

### **Step 3: Navigate to Flagged Questions**
1. Look at the **question number grid** at bottom
2. **Stars (⭐)** indicate flagged questions
3. Click any starred number to jump to that question

### **Step 4: Review Before Submit**
1. Check the number grid for stars
2. Navigate to all flagged questions
3. Review your answers
4. Unflag when satisfied
5. Submit test

---

## 💡 **Use Cases**

### **1. Mark Difficult Questions**
- Flag questions you're unsure about
- Come back to review them later
- Make better decisions with fresh eyes

### **2. Skip and Return**
- Don't know the answer? Flag it!
- Continue with other questions
- Return to flagged ones at the end

### **3. Double-Check Strategy**
- Flag questions you want to verify
- Review all flagged questions before submit
- Ensure accuracy

### **4. Time Management**
- Flag questions that need more thought
- Answer easy questions first
- Spend remaining time on flagged ones

---

## 🎨 **Visual Design**

### **Button Styles**

**Unflagged:**
- Background: `bg-gray-500/20`
- Text: `text-gray-400`
- Border: `border-gray-500/50`
- Hover: Turns slightly yellow

**Flagged:**
- Background: `bg-yellow-600/30`
- Text: `text-yellow-300`
- Border: `border-yellow-500`
- Stands out clearly

### **Number Grid Stars**
- Position: Top-right corner of number
- Size: Small ⭐ emoji
- Color: Yellow (`text-yellow-400`)
- Always visible

---

## 🔍 **Features Summary**

✅ **Toggle flag** - Click to flag/unflag  
✅ **Visual feedback** - Yellow when flagged, gray when not  
✅ **Star indicators** - See flagged questions in grid  
✅ **Persistent state** - Flags stay during navigation  
✅ **Easy navigation** - Click starred numbers to jump  
✅ **No limit** - Flag as many questions as you want  
✅ **Quick review** - Find all flagged questions easily  

---

## 📊 **Button Location**

```
┌─────────────────────────────────────────────────┐
│  🎯 Question 1/100  ⭐⭐ Medium  [Flagged]      │
│                                                 │
│  ⭐ What is the correct answer?                │
└─────────────────────────────────────────────────┘
```

The Flagged button appears on the **same line** as:
- Question number
- Difficulty badge

---

## 🎯 **Smart Test-Taking Workflow**

1. **First Pass** - Answer all easy questions
2. **Flag Uncertain** - Flag questions you're unsure about
3. **Second Pass** - Review all flagged questions (check stars in grid)
4. **Final Check** - Verify all flagged questions
5. **Unflag Resolved** - Unflag questions you've answered
6. **Submit** - Submit when all flags are resolved (or time's up!)

---

## 💡 **Pro Tips**

1. **Flag liberally** - Better to flag too many than miss one
2. **Use stars** - Quick visual scan of number grid
3. **Review at end** - Use remaining time for flagged questions
4. **Unflag when done** - Clear flags as you resolve them
5. **Track progress** - Fewer stars = closer to completion

---

## 🔧 **Technical Details**

### **State Management:**
- Uses `Set<number>` to track flagged question indices
- Efficient add/remove operations
- Persists during navigation

### **Files Modified:**
1. ✅ `src/app/mcq-tests/[id]/page.tsx`
   - Added `flaggedQuestions` state
   - Added `toggleFlag` function
   - Added Flagged button component
   - Updated number grid with star indicators

---

## ✨ **Visual Examples**

### **Unflagged Question:**
```
Question 5 / 100    ⭐⭐ Medium    [  Flag  ]
                                   ↑ Gray
```

### **Flagged Question:**
```
Question 5 / 100    ⭐⭐ Medium    [ Flagged ]
                                   ↑ Yellow
```

### **Number Grid:**
```
Before:  1  2  3  4  5  6  7  8  9  10
After:   1⭐ 2  3⭐ 4  5  6⭐ 7  8  9  10
         ↑     ↑           ↑
      Flagged questions show stars!
```

---

**🎉 Flag questions and ace your test! ⭐**
