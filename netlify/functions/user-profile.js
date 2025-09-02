// Netlify Function for getting user profile
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { Connection, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const User = require('./user-schema.js');

require('dotenv').config();

// USDC Constants
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// Solana connection
const solanaConnection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  'confirmed'
);

// MongoDB connection with better error handling
const connectDB = async () => {
  try {
    if (mongoose.connections[0]?.readyState === 1) return;
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betbetter');
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    // Don't throw error, just log it and continue with mock data
    return false;
  }
};

// User model imported from shared schema

// Helper function to get USDC balance from Solana wallet
async function getUSDCBalance(walletAddress) {
  try {
    if (!walletAddress) {
      console.log('No wallet address provided');
      return 0;
    }

    const walletPublicKey = new PublicKey(walletAddress);
    const associatedTokenAddress = await getAssociatedTokenAddress(USDC_MINT, walletPublicKey);

    // Check if token account exists first
    const accountInfo = await solanaConnection.getAccountInfo(associatedTokenAddress);
    if (!accountInfo) {
      console.log(`No USDC ATA found for wallet: ${walletAddress}`);
      return 0;
    }

    const tokenBalance = await solanaConnection.getTokenAccountBalance(associatedTokenAddress);
    const balance = tokenBalance.value.uiAmount || 0;
    console.log(`💰 [USER BALANCE] ${walletAddress}: ${balance} USDC`);
    return balance;
  } catch (error) {
    console.log(`❌ Error getting USDC balance for ${walletAddress}: ${error.message}`);
    return 0;
  }
}

exports.handler = async (event, context) => {
  // Get the origin from the request
  const origin = event.headers.origin || event.headers.Origin || '';

  // Define allowed origins
  const allowedOrigins = [
    'https://primimus.com',
    'https://www.primimus.com',
    'https://primimus.netlify.app',
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000'
  ];

  // Check if origin is allowed
  const isAllowedOrigin = allowedOrigins.includes(origin) || origin.endsWith('.netlify.app');

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: ''
    };
  }

  try {
    // Verify JWT token
    const authHeader = event.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return {
        statusCode: 401,
        headers: {
          'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'Access token required' })
      };
    }

    // Try to verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    } catch (jwtError) {
      console.error('JWT verification error:', jwtError.message);
      return {
        statusCode: 401,
        headers: {
          'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    // Try to connect to database and get user
    const dbConnected = await connectDB();
    let user = null;

    if (dbConnected !== false) {
      try {
        user = await User.findById(decoded.userId);
      } catch (dbError) {
        console.error('Database query error:', dbError.message);
      }
    }

    // If user not found in database or DB connection failed, return error instead of mock data
    if (!user) {
      console.log('User not found in database or DB connection failed');
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'User profile not found. Please try logging in again.' })
      };
    }

    // Get USDC balance from user's Solana wallet (for display purposes)
    const usdcBalance = await getUSDCBalance(user.solanaAddress);

    // Game balance is the casino-specific tokens they've purchased (stored in DB)
    const gameBalance = user.gameBalance || 0;

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({
        id: user._id,
        name: user.name,
        email: user.email,
        picture: user.picture,
        gameBalance: gameBalance,
        usdcBalance: usdcBalance,
        solanaAddress: user.solanaAddress
      })
    };

  } catch (error) {
    console.error('Profile fetch error:', error.message);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({ error: 'Failed to load user profile. Please try again.' })
    };
  }
};