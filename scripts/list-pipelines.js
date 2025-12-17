const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env file manually
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const API_KEY = process.env.PABAU_API_KEY || 'YOUR_API_KEY_HERE';

if (API_KEY === 'YOUR_API_KEY_HERE' || !API_KEY) {
  console.error('Error: PABAU_API_KEY not found in .env file');
  console.error('Please add your API key to the .env file');
  process.exit(1);
}

const url = `https://api.oauth.pabau.com/${API_KEY}/leads/pipelines?order=ASC`;

https.get(url, (response) => {
  let data = '';
  
  response.on('data', (chunk) => {
    data += chunk;
  });
  
  response.on('end', () => {
    try {
      const pipelines = JSON.parse(data);
      
      console.log('\n=== PABAU PIPELINES ===\n');
      
      if (Array.isArray(pipelines)) {
        pipelines.forEach((pipeline, idx) => {
          console.log(`Pipeline ${idx + 1}: ${pipeline.name || 'Unnamed'}`);
          console.log(`  ID: ${pipeline.id}`);
          
          if (pipeline.stages && Array.isArray(pipeline.stages)) {
            console.log('  Stages:');
            pipeline.stages.forEach((stage) => {
              console.log(`    - ${stage.name || 'Unnamed Stage'} (ID: ${stage.id})`);
            });
          }
          console.log('');
        });
      } else {
        console.log('Response:', JSON.stringify(pipelines, null, 2));
      }
      
    } catch (error) {
      console.error('Error parsing response:', error.message);
      console.log('Raw response:', data);
    }
  });
  
}).on('error', (error) => {
  console.error('Error fetching pipelines:', error.message);
});
