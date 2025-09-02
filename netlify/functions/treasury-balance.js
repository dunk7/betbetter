// Netlify Function for getting treasury balance
const jwt = require('jsonwebtoken');
const { Connection, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const { Keypair } = require('@solana/web3.js');

require('dotenv').config();

// USDC Constants
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// Treasury Wallet Setup
let treasuryKeypair = null;
if (process.env.TREASURY_KEYPAIR) {
  try {
    const keypairString = process.env.TREASURY_KEYPAIR;
    const keypairData = keypairString.replace(/^\[|\]$/g, '').split(',').map(num => parseInt(num.trim()));
    treasuryKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    console.log('Treasury wallet loaded for balance check');
  } catch (error) {
    console.error('Error loading treasury keypair:', error);
  }
}

// Solana connection
const solanaConnection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0  // Support legacy transactions
  }
);

// Helper function to get USDC balance
async function getUSDCBalance(connection, owner) {
  try {
    const associatedTokenAddress = await getAssociatedTokenAddress(USDC_MINT, owner);

    // Check if token account exists first
    const accountInfo = await connection.getAccountInfo(associatedTokenAddress);
    if (!accountInfo) {
      console.log(`❌ No ATA found for treasury wallet`);
      return 0;
    }

    const tokenBalance = await connection.getTokenAccountBalance(associatedTokenAddress);
    const balance = tokenBalance.value.uiAmount || 0;
    console.log(`💰 [TREASURY BALANCE] USDC balance: ${balance}`);
    return balance;
  } catch (error) {
    console.log(`❌ Error getting treasury USDC balance: ${error.message}`);
    return 0;
  }
}

exports.handler = async (event, context) => {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: ''
    };
  }

  try {
    // Verify JWT token (as per original server.js implementation)
    const authHeader = event.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return {
        statusCode: 401,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET, OPTIONS'
        },
        body: JSON.stringify({ error: 'Access token required' })
      };
    }

    // Try to verify JWT token
    try {
      jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    } catch (jwtError) {
      console.error('JWT verification error:', jwtError.message);
      return {
        statusCode: 401,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET, OPTIONS'
        },
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    // Check if treasury wallet is configured
    if (!treasuryKeypair) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET, OPTIONS'
        },
        body: JSON.stringify({ error: 'Treasury wallet not configured' })
      };
    }

    // Get actual treasury USDC balance from Solana
    const treasuryUsdcBalance = await getUSDCBalance(solanaConnection, treasuryKeypair.publicKey);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: JSON.stringify({
        usdcBalance: treasuryUsdcBalance,
        formattedBalance: `${treasuryUsdcBalance.toFixed(2)} USDC`
      })
    };

  } catch (error) {
    console.error('Treasury balance fetch error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: JSON.stringify({ error: 'Failed to fetch treasury balance' })
    };
  }
};