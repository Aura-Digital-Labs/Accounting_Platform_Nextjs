const { OAuth2Client } = require('google-auth-library');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// Load env vars
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob';

if (!clientId || !clientSecret) {
    console.error('Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET in .env');
    process.exit(1);
}

const client = new OAuth2Client(clientId, clientSecret, redirectUri);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

async function run() {
    const authorizeUrl = client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent' // Force to get a refresh token
    });

    console.log('Authorize this app by visiting this url:');
    console.log(authorizeUrl);
    console.log('\n=============================================');

    rl.question('Enter the code from that page here: ', async (code) => {
        try {
            console.log('Getting tokens...');
            const { tokens } = await client.getToken(code);
            console.log('\n--- SUCCESS ---');
            console.log('Refresh Token:');
            console.log(tokens.refresh_token);
            console.log('\nPlease update your .env file with:');
            console.log(`GOOGLE_OAUTH_REFRESH_TOKEN="${tokens.refresh_token}"`);
        } catch (error) {
            console.error('Error getting tokens:', error.message);
        }
        rl.close();
    });
}

run();
