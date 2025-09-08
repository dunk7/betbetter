// Netlify Function for updating user settings (withdraw address)
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { PublicKey } = require('@solana/web3.js');
const User = require('./user-schema.js');

require('dotenv').config();

// MongoDB connection
const connectDB = async () => {
  try {
    if (mongoose.connections[0]?.readyState === 1) return;
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betbetter');
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    return false;
  }
};

exports.handler = async (event) => {
  const origin = event.headers.origin || event.headers.Origin || '';
  const allowedOrigins = [
    'https://primimus.com',
    'https://www.primimus.com',
    'https://primimus.netlify.app',
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5000'
  ];
  const isAllowedOrigin = allowedOrigins.includes(origin) || origin.endsWith('.netlify.app');

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
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

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    } catch (jwtError) {
      return {
        statusCode: 401,
        headers: {
          'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    const dbConnected = await connectDB();
    if (dbConnected === false) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'Database connection failed' })
      };
    }

    const { withdrawAddress } = JSON.parse(event.body || '{}');

    if (!withdrawAddress) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'withdrawAddress is required' })
      };
    }

    // Validate Solana address
    try {
      // Ensure it's a valid base58 public key
      // eslint-disable-next-line no-new
      new PublicKey(withdrawAddress);
    } catch (e) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'Invalid Solana address' })
      };
    }

    // Prevent sending to treasury by mistake
    if (process.env.TREASURY_ADDRESS && withdrawAddress === process.env.TREASURY_ADDRESS) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'Withdrawal address cannot be the treasury address' })
      };
    }

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

    user.withdrawAddress = withdrawAddress;
    await user.save();

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({ success: true, withdrawAddress })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({ error: error.message || 'Failed to update settings' })
    };
  }
};