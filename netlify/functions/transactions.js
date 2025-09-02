// Netlify Function for getting user transactions
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
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
    // Connect to database
    await connectDB();

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

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    // Get user's transactions, sorted by most recent first
    const transactions = await GameTransaction.find({ userId: user._id })
      .sort({ timestamp: -1 })
      .limit(50); // Limit to last 50 transactions

    // Format transactions for frontend
    const formattedTransactions = transactions.map(tx => ({
      id: tx._id,
      type: tx.type,
      amount: tx.amount,
      solAmount: tx.solAmount,
      tokenAmount: tx.tokenAmount,
      solanaTxHash: tx.solanaTxHash,
      fromAddress: tx.fromAddress,
      toAddress: tx.toAddress,
      timestamp: tx.timestamp,
      status: tx.status
    }));

    console.log(`📊 [TRANSACTIONS] Retrieved ${formattedTransactions.length} transactions for user ${user.email}`);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify(formattedTransactions)
    };

  } catch (error) {
    console.error('Transactions error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({ error: error.message || 'Failed to load transactions' })
    };
  }
};