const https = require('node:https');

// Parse the incoming x-www-form-urlencoded body into a key/value helper.
function parseFormBody(body) {
  return new URLSearchParams(body || '');
}

// Extract key Webflow fields while gracefully handling missing data.
function extractLeadFields(params) {
  const orderedFields = params.getAll('field');
  return {
    firstName: orderedFields[0] || params.get('first_name') || '',
    lastName: orderedFields[1] || params.get('last_name') || '',
    email: orderedFields[2] || params.get('email') || '',
    message: params.get('Message') || params.get('message') || '',
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

    // TESTING: API key check disabled for webhook.site testing
    // const apiKey = process.env.PABAU_API_KEY;
    // if (!apiKey) {
    //   return {
    //     statusCode: 500,
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ success: false, message: 'Missing Pabau API key' }),
    //   };
    // }

    const params = parseFormBody(event.body);
    const { firstName, lastName, email, message } = extractLeadFields(params);

    if (!firstName || !lastName || !email) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Missing required fields',
      };
    }

    const pabauPayload = {
      first_name: firstName,
      last_name: lastName,
      email,
      custom_field_12345: message || '',
    };

    // TESTING: Send to webhook.site instead of Pabau
    const pabauUrl = `https://webhook.site/9517ca4e-f574-4f33-a51f-829dab4c7153`;
    const pabauResponse = await postJson(pabauUrl, pabauPayload);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/plain' },
      body: 'OK',
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
