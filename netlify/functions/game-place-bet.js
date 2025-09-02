// Netlify Function for placing bets
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('./user-schema.js');

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

// User model imported from shared schema

// Transaction Schema
const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['deposit', 'withdraw', 'bet_win', 'bet_loss'], required: true },
  amount: { type: Number, required: true },
  solAmount: Number,
  tokenAmount: Number,
  solanaTxHash: { type: String, unique: true },
  fromAddress: String,
  toAddress: String,
  timestamp: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' }
});

const GameTransaction = mongoose.model('Transaction', transactionSchema);

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

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Credentials': 'true',
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
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Credentials': 'true',
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
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'Access token required' })
      };
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Connect to database
    await connectDB();

    const user = await User.findById(decoded.userId);
    if (!user) {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    const { betAmount } = JSON.parse(event.body);

    // Validate bet amount
    if (!betAmount || typeof betAmount !== 'number' || betAmount <= 0 || betAmount > 1000000) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'Invalid bet amount. Must be between 0.01 and 1,000,000' })
      };
    }

    // Validate bet amount precision (max 2 decimal places)
    if (betAmount !== Math.round(betAmount * 100) / 100) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'Bet amount can have at most 2 decimal places' })
      };
    }

    // Check if user has enough balance
    if (user.gameBalance < betAmount) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'Insufficient balance' })
      };
    }

    // Generate cryptographically secure random outcome
    const randomBytes = crypto.randomBytes(4);
    const randomNumber = randomBytes.readUInt32LE(0) / 0xFFFFFFFF; // Convert to 0-1 range

    // Player wins if random < 0.50001 (50.001% chance to win - user advantage)
    const playerWins = randomNumber < 0.50001;

    // Calculate net amount
    const netAmount = playerWins ? betAmount : -betAmount;

    // Update user balance
    const oldBalance = user.gameBalance;
    user.gameBalance += netAmount;
    await user.save();

    // Create transaction record
    const transaction = new GameTransaction({
      userId: user._id,
      type: playerWins ? 'bet_win' : 'bet_loss',
      amount: betAmount,
      tokenAmount: betAmount,
      status: 'completed'
    });
    await transaction.save();

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({
        success: true,
        playerWins,
        betAmount,
        netAmount,
        newBalance: user.gameBalance,
        randomNumber,
        winThreshold: 0.50001,
        userAdvantage: 0.00001,
        transactionId: transaction._id,
        timestamp: new Date().toISOString(),
        serverVersion: 'netlify-function-v1'
      })
    };

  } catch (error) {
    console.error('Betting error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({ error: 'Betting failed' })
    };
  }
};