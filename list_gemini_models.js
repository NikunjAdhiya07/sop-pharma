const https = require('https');

const apiKey = 'AIzaSyDCVzAJeSmWpm6FpHVn2PIkPgOr7sPzUDc';

function listModels() {
  return new Promise((resolve, reject) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

    https.get(url, (res) => {
      let data = '';

      res.on('data', chunk => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          console.log('📋 Available Models:');
          console.log('='.repeat(60));

          if (response.models && Array.isArray(response.models)) {
            response.models.forEach(model => {
              console.log(`✅ ${model.name}`);
              console.log(`   Display Name: ${model.displayName}`);
              console.log(`   Supported Methods: ${model.supportedGenerationMethods?.join(', ') || 'N/A'}`);
              console.log();
            });
          } else {
            console.log('Response:', JSON.stringify(response, null, 2));
          }
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

listModels().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
