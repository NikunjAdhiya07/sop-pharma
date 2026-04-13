const { GoogleGenerativeAI } = require('@google/generative-ai');

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

if (!apiKey) {
  console.error('❌ No API key found. Set GEMINI_API_KEY or GOOGLE_AI_API_KEY');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

// Models to test
const modelsToTest = [
  'gemini-1.5-pro',
  'gemini-2.0-flash',
  'gemini-exp-1114',
  'gemini-pro',
  'gemini-1.5-flash',
];

async function testModel(modelName) {
  try {
    console.log(`\n🧪 Testing model: ${modelName}`);
    const model = genAI.getGenerativeModel({ model: modelName });

    // Try a simple generation
    const result = await model.generateContent('Say "working" in one word');
    console.log(`✅ ${modelName} - WORKS!`);
    return true;
  } catch (error) {
    const status = error.status || 'unknown';
    const message = error.message?.substring(0, 100) || error.toString();
    console.log(`❌ ${modelName} - Status: ${status}, Error: ${message}`);
    return false;
  }
}

async function main() {
  console.log('🔍 Testing available Gemini models...\n');

  const results = {};
  for (const model of modelsToTest) {
    results[model] = await testModel(model);
  }

  console.log('\n\n📊 RESULTS:');
  console.log('='.repeat(50));
  const working = Object.entries(results)
    .filter(([_, works]) => works)
    .map(([model, _]) => model);

  if (working.length > 0) {
    console.log('✅ Working Models:');
    working.forEach(m => console.log(`   - ${m}`));
  } else {
    console.log('❌ No working models found!');
  }

  console.log('\n💡 Recommendation:');
  if (working.length > 0) {
    console.log(`Use: ${working[0]} (first working model)`);
  }
}

main().catch(console.error);
