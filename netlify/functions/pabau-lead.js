const https = require('node:https');
const crypto = require('node:crypto');

// Verify Webflow webhook signature to ensure request authenticity
function verifyWebflowSignature(secretKey, timestamp, requestBody, providedSignature) {
  try {
    const requestTimestamp = parseInt(timestamp, 10);
    
    // Generate HMAC hash using timestamp and body
    const data = `${requestTimestamp}:${requestBody}`;
    const hash = crypto.createHmac('sha256', secretKey)
                      .update(data)
                      .digest('hex');
    
    // Compare generated hash with provided signature
    if (!crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(providedSignature, 'hex'))) {
      throw new Error('Invalid signature');
    }
    
    // Validate timestamp (within 5 minutes to prevent replay attacks)
    const currentTime = Date.now();
    if (currentTime - requestTimestamp > 300000) {
      throw new Error('Request is older than 5 minutes');
    }
    
    return true;
  } catch (err) {
    console.error(`Signature verification failed: ${err.message}`);
    return false;
  }
}

// Extract lead fields from Webflow webhook payload
function extractLeadFields(payload) {
  const data = payload.data || {};
  return {
    firstName: data['First Name'] || data['first_name'] || data.firstName || '',
    lastName: data['Last Name'] || data['last_name'] || data.lastName || '',
    email: data.email || data.Email || data.Field || '', // Added 'Field' as fallback
    message: data.Message || data.message || '',
  };
}

// Minimal HTTPS JSON client using Node's built-in https module.
function postJson(urlString, payload) {
  const data = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const request = https.request(
      urlString,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => {
          const statusCode = response.statusCode || 500;
          let parsedBody = null;
          try {
            parsedBody = raw ? JSON.parse(raw) : null;
          } catch (error) {
            return reject(
              Object.assign(new Error('Failed to parse Pabau response as JSON'), {
                statusCode,
                responseBody: raw,
              })
            );
          }

          if (statusCode < 200 || statusCode >= 300) {
            return reject(
              Object.assign(new Error('Pabau API returned an error'), {
                statusCode,
                responseBody: parsedBody,
              })
            );
          }

          resolve(parsedBody);
        });
      }
    );

    request.on('error', (error) => reject(error));
    request.write(data);
    request.end();
  });
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Method Not Allowed',
      };
    }

    // Verify Webflow webhook signature
    const secretKey = process.env.WEBFLOW_SECRET_KEY;
    const timestamp = event.headers['x-webflow-timestamp'];
    const providedSignature = event.headers['x-webflow-signature'];
    
    if (!secretKey) {
      console.error('WEBFLOW_SECRET_KEY not configured');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Server configuration error',
      };
    }
    
    if (!verifyWebflowSignature(secretKey, timestamp, event.body, providedSignature)) {
      console.error('Invalid webhook signature');
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Unauthorized',
      };
    }

    // Parse Webflow webhook JSON payload
    const webhookData = JSON.parse(event.body);
    
    // DEBUG: Log incoming webhook data
    console.log('Webhook received:', JSON.stringify(webhookData, null, 2));
    
    // Verify this is a form submission event
    if (webhookData.triggerType !== 'form_submission') {
      console.log('Invalid trigger type:', webhookData.triggerType);
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Invalid trigger type',
      };
    }

    const { firstName, lastName, email, message } = extractLeadFields(webhookData.payload);
    
    // DEBUG: Log extracted fields
    console.log('Extracted fields:', { firstName, lastName, email, message });

    if (!email) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Missing required email field',
      };
    }

    const pabauPayload = {
      first_name: firstName,
      last_name: lastName,
      email,
      owner: process.env.PABAU_LEAD_OWNER || 'Webflow Form',
      description: message || '',
    };

    // Send to Pabau API
    const apiKey = process.env.PABAU_API_KEY;
    if (!apiKey) {
      console.error('PABAU_API_KEY not configured');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Server configuration error',
      };
    }
    
    const pabauUrl = `https://api.oauth.pabau.com/${apiKey}/leads/create`;
    const pabauResponse = await postJson(pabauUrl, pabauPayload);

    return {
      statusCode: 204,
      headers: {},
      body: '',
    };
  } catch (error) {
    console.error('Pabau lead creation failed', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/plain' },
      body: 'Error',
    };
  }
};
