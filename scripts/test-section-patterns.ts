/**
 * Test Script: Verify Section Reference Detection Patterns
 * 
 * This script tests the regex patterns used to detect section reference questions
 * to ensure they correctly identify problematic MCQs.
 * 
 * Usage: npx tsx scripts/test-section-patterns.ts
 */

const SECTION_REFERENCE_PATTERNS = [
  /in\s+section\s+\d+(\.\d+)*/i,           // "In section 4.4.2"
  /section\s+\d+(\.\d+)*\s+(states?|says?|mentions?|describes?)/i, // "Section 4.4.2 states"
  /what\s+(does|is)\s+section\s+\d+(\.\d+)*/i, // "What does section 4.4.2"
  /according\s+to\s+section\s+\d+(\.\d+)*/i,   // "According to section 4.4.2"
  /as\s+per\s+section\s+\d+(\.\d+)*/i,         // "As per section 4.4.2"
  /refer\s+to\s+section\s+\d+(\.\d+)*/i,       // "Refer to section 4.4.2"
  /in\s+\d+(\.\d+)+,?\s+what/i,                // "In 4.4.2, what"
  /clause\s+\d+(\.\d+)*\s+(states?|says?)/i,   // "Clause 4.4.2 states"
];

function isSectionReferenceQuestion(question: string): boolean {
  return SECTION_REFERENCE_PATTERNS.some(pattern => pattern.test(question));
}

// Test cases
const testCases = [
  // Should be detected (TRUE)
  {
    question: "⭐ In section 4.4.2, what is stated about calibration frequency?",
    expected: true,
    description: "Direct section reference with 'In section X.Y'"
  },
  {
    question: "⭐ What does section 5.1 say about equipment maintenance?",
    expected: true,
    description: "Question about what section says"
  },
  {
    question: "⭐ According to section 3.2, what is the procedure?",
    expected: true,
    description: "According to section reference"
  },
  {
    question: "⭐ In 4.4.2, what is the testing protocol?",
    expected: true,
    description: "Shortened section reference (In X.Y)"
  },
  {
    question: "⭐ Section 6.3 states which of the following?",
    expected: true,
    description: "Section X.Y states pattern"
  },
  {
    question: "⭐ As per section 2.1, what should be done?",
    expected: true,
    description: "As per section reference"
  },
  {
    question: "⭐ Refer to section 7.4 for the answer to which question?",
    expected: true,
    description: "Refer to section pattern"
  },
  {
    question: "⭐ Clause 3.5 states what about quality control?",
    expected: true,
    description: "Clause reference"
  },
  
  // Should NOT be detected (FALSE)
  {
    question: "⭐ What is the recommended calibration frequency for equipment?",
    expected: false,
    description: "Content-based question about calibration"
  },
  {
    question: "⭐ Which procedure should be followed for equipment maintenance?",
    expected: false,
    description: "Content-based question about procedures"
  },
  {
    question: "⭐ What are the key steps in the quality control process?",
    expected: false,
    description: "Content-based question about process"
  },
  {
    question: "⭐ How should temperature be monitored during storage?",
    expected: false,
    description: "Content-based question about monitoring"
  },
  {
    question: "⭐ What is the purpose of the validation protocol?",
    expected: false,
    description: "Content-based question about purpose"
  },
  {
    question: "⭐ Which safety measures must be implemented?",
    expected: false,
    description: "Content-based question about safety"
  },
];

// Run tests
console.log('🧪 Testing Section Reference Detection Patterns\n');
console.log('='.repeat(80));

let passed = 0;
let failed = 0;

testCases.forEach((testCase, index) => {
  const result = isSectionReferenceQuestion(testCase.question);
  const isCorrect = result === testCase.expected;
  
  if (isCorrect) {
    passed++;
    console.log(`✅ Test ${index + 1}: PASS`);
  } else {
    failed++;
    console.log(`❌ Test ${index + 1}: FAIL`);
  }
  
  console.log(`   Description: ${testCase.description}`);
  console.log(`   Question: ${testCase.question}`);
  console.log(`   Expected: ${testCase.expected ? 'DETECT' : 'IGNORE'}`);
  console.log(`   Got: ${result ? 'DETECT' : 'IGNORE'}`);
  console.log('');
});

console.log('='.repeat(80));
console.log(`\n📊 Results: ${passed}/${testCases.length} tests passed`);

if (failed > 0) {
  console.log(`❌ ${failed} test(s) failed`);
  process.exit(1);
} else {
  console.log('✅ All tests passed!');
  process.exit(0);
}
