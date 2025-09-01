// Netlify Function for getting treasury balance
const jwt = require('jsonwebtoken');

require('dotenv').config();

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

    // For now, return mock treasury balance data
    // In a real implementation, this would connect to Solana and get the actual USDC balance
    const mockBalance = 1000.50; // Mock treasury balance

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: JSON.stringify({
        usdcBalance: mockBalance,
        formattedBalance: `${mockBalance.toFixed(2)} USDC`
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