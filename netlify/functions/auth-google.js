// Netlify Function for Google OAuth
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const User = require('./user-schema.js');

require('dotenv').config();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

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
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
        'Access-Control-Allow-Credentials': 'true'
      },
      body: ''
    };
  }

  try {
    // Connect to database
    await connectDB();

    const { token } = JSON.parse(event.body);

    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Find or create user
    let user = await User.findOne({ googleId });

    if (!user) {
      user = new User({
        googleId,
        email,
        name,
        picture,
        gameBalance: 0, // Users must buy tokens - balance reflects USDC holdings
      });
    }

    user.lastLogin = new Date();
    await user.save();

    // Create JWT token
    const jwtToken = jwt.sign(
      { userId: user._id, googleId: user.googleId },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({
        token: jwtToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          picture: user.picture,
          gameBalance: user.gameBalance,
          solanaAddress: user.solanaAddress
        }
      })
    };

  } catch (error) {
    console.error('Auth error:', error);
    return {
      statusCode: 401,
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({ error: 'Authentication failed' })
    };
  }
};