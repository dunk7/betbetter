// Netlify Function for getting user profile
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

require('dotenv').config();

// MongoDB connection
const connectDB = async () => {
  if (mongoose.connections[0].readyState) return;
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
};

// User Schema
const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  name: String,
  picture: String,
  solanaAddress: String,
  gameBalance: { type: Number, default: 0 },
  usdcBalance: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Helper function to get USDC balance
async function getUSDCBalance(connection, owner) {
  try {
    const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    const associatedTokenAddress = await getAssociatedTokenAddress(USDC_MINT, owner);

    const tokenBalance = await connection.getTokenAccountBalance(associatedTokenAddress);
    const balance = tokenBalance.value.uiAmount || 0;
    return balance;
  } catch (error) {
    console.log(`Error getting USDC balance: ${error.message}`);
    return 0;
  }
}

// Import required Solana functions
const { getAssociatedTokenAddress } = require('@solana/spl-token');

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
    // Verify JWT token
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

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET, OPTIONS'
        },
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    // Get USDC balance if address is set
    let usdcBalance = 0;
    if (user.solanaAddress) {
      try {
        const solanaConnection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
        const publicKey = new PublicKey(user.solanaAddress);
        usdcBalance = await getUSDCBalance(solanaConnection, publicKey);
      } catch (error) {
        console.log(`Error fetching USDC balance:`, error);
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: JSON.stringify({
        id: user._id,
        name: user.name,
        email: user.email,
        picture: user.picture,
        gameBalance: user.gameBalance,
        usdcBalance: usdcBalance,
        solanaAddress: user.solanaAddress
      })
    };

  } catch (error) {
    console.error('Profile fetch error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: JSON.stringify({ error: 'Server error' })
    };
  }
};