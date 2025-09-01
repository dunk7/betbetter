// Netlify Function for getting treasury address
const { Keypair } = require('@solana/web3.js');

require('dotenv').config();

// Treasury Wallet Setup - Load from TREASURY_KEYPAIR environment variable
let treasuryKeypair = null;
let treasuryAddress = null;

if (process.env.TREASURY_KEYPAIR) {
  try {
    const keypairString = process.env.TREASURY_KEYPAIR;
    const keypairData = keypairString.replace(/^\[|\]$/g, '').split(',').map(num => parseInt(num.trim()));
    treasuryKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    treasuryAddress = treasuryKeypair.publicKey.toString();
    console.log('Treasury wallet loaded:', treasuryAddress);
  } catch (error) {
    console.error('Error loading treasury keypair:', error);
  }
} else {
  console.warn('TREASURY_KEYPAIR environment variable not set');
}

exports.handler = async (event, context) => {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: ''
    };
  }

  try {
    // Check if treasury wallet is configured
    if (!treasuryAddress) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'GET, OPTIONS'
        },
        body: JSON.stringify({ error: 'Treasury wallet not configured' })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: JSON.stringify({
        treasuryAddress: treasuryAddress
      })
    };

  } catch (error) {
    console.error('Treasury address fetch error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: JSON.stringify({ error: 'Failed to fetch treasury address' })
    };
  }
};