import { GoogleGenerativeAI } from '@google/generative-ai';
import https from 'https';
import http from 'http';

console.log('🔍 Gemini API Connection Diagnostics\n');

// Check 1: Environment Variable
console.log('1️⃣ Checking GOOGLE_AI_API_KEY environment variable...');
const apiKey = process.env.GOOGLE_AI_API_KEY;
if (!apiKey) {
  console.error('❌ GOOGLE_AI_API_KEY is not set!');
  console.log('   Please set it in your environment or .env.local file');
  process.exit(1);
} else {
  console.log(`✅ API Key found (length: ${apiKey.length} chars)`);
  console.log(`   First 10 chars: ${apiKey.substring(0, 10)}...`);
}

// Check 2: Network connectivity to Google
console.log('\n2️⃣ Testing network connectivity to Google...');
try {
  const testUrl = 'https://www.google.com';
  await new Promise((resolve, reject) => {
    https.get(testUrl, (res) => {
      console.log(`✅ Successfully connected to Google (status: ${res.statusCode})`);
      resolve(true);
    }).on('error', (err) => {
      console.error('❌ Failed to connect to Google:', err.message);
      reject(err);
    });
  });
} catch (error) {
  console.error('❌ Network connectivity issue detected');
  console.error('   This might indicate firewall, proxy, or DNS issues');
}

// Check 3: Direct API endpoint test
console.log('\n3️⃣ Testing Gemini API endpoint directly...');
try {
  const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models?key=' + apiKey;
  const response = await fetch(apiUrl);
  const data = await response.json();
  
  if (response.ok) {
    console.log('✅ Successfully connected to Gemini API');
    console.log(`   Available models: ${data.models?.length || 0}`);
    
    // List available models
    if (data.models && Array.isArray(data.models)) {
      console.log('\n📋 Available models:');
      data.models.forEach((model: any) => {
        console.log(`   - ${model.name}`);
      });
      
      // Check if our target model exists
      const targetModel = 'models/gemini-3-pro-preview';
      const modelExists = data.models.some((m: any) => m.name === targetModel);
      
      if (modelExists) {
        console.log(`\n✅ Target model '${targetModel}' is available`);
      } else {
        console.log(`\n⚠️ Target model '${targetModel}' NOT found in available models`);
        console.log('   You may need to use a different model name');
        
        // Suggest alternatives
        const proModels = data.models.filter((m: any) => 
          m.name.includes('gemini') && m.name.includes('pro')
        );
        if (proModels.length > 0) {
          console.log('\n💡 Suggested alternative Pro models:');
          proModels.forEach((m: any) => {
            console.log(`   - ${m.name}`);
          });
        }
      }
    }
  } else {
    console.error('❌ API request failed with status:', response.status);
    console.error('   Response:', await response.text());
  }
} catch (error: any) {
  console.error('❌ Failed to connect to Gemini API endpoint');
  console.error('   Error:', error.message);
  
  if (error.message?.includes('fetch failed')) {
    console.error('\n🔍 Possible causes:');
    console.error('   1. Network/firewall blocking the connection');
    console.error('   2. Proxy configuration needed');
    console.error('   3. SSL/TLS certificate issues');
    console.error('   4. DNS resolution problems');
  }
}

// Check 4: Test actual content generation
console.log('\n4️⃣ Testing content generation with SDK...');
try {
  const genAI = new GoogleGenerativeAI(apiKey);
  
  // Try with the most common stable model first
  const testModels = [
    'gemini-1.5-pro',
    'gemini-1.5-flash',
    'gemini-pro',
    'models/gemini-3-pro-preview'
  ];
  
  for (const modelName of testModels) {
    console.log(`\n   Testing model: ${modelName}...`);
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent('Say "Hello" in JSON format: {"message": "Hello"}');
      const response = await result.response;
      const text = response.text();
      
      console.log(`   ✅ ${modelName} works!`);
      console.log(`   Response: ${text.substring(0, 100)}...`);
      break; // Stop after first successful model
    } catch (error: any) {
      console.error(`   ❌ ${modelName} failed: ${error.message}`);
    }
  }
} catch (error: any) {
  console.error('❌ SDK test failed:', error.message);
}

console.log('\n✅ Diagnostics complete!');
