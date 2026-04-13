const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI('AIzaSyDCVzAJeSmWpm6FpHVn2PIkPgOr7sPzUDc');

async function test() {
  try {
    console.log('🧪 Testing gemini-3-flash-preview...');
    const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
    const result = await model.generateContent('Say "Model works!" in exactly one word');
    console.log('✅ SUCCESS! gemini-3-flash-preview is available and working!');
    console.log('Response:', result.response.text());
  } catch (error) {
    console.log('❌ FAILED');
    console.log('Status:', error.status);
    console.log('Error:', error.message?.substring(0, 200));
  }
}

test();
