// Netlify Function for buying casino tokens
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { Connection, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, Keypair } = require('@solana/web3.js');
const { createTransferInstruction, getAssociatedTokenAddress, createAssociatedTokenAddressInstruction, getAccount } = require('@solana/spl-token');
const User = require('./user-schema.js');

require('dotenv').config();

// USDC Constants
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// Solana connection
const solanaConnection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  'confirmed'
);

// Treasury Wallet Setup
let treasuryKeypair = null;
if (process.env.TREASURY_KEYPAIR) {
  try {
    const keypairString = process.env.TREASURY_KEYPAIR;
    const keypairData = keypairString.replace(/^\[|\]$/g, '').split(',').map(num => parseInt(num.trim()));
    treasuryKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    console.log('Treasury wallet loaded for token purchases');
  } catch (error) {
    console.error('Error loading treasury keypair:', error);
  }
}

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
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' }
});

const GameTransaction = mongoose.model('Transaction', transactionSchema);

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
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
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
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
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
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
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    // Connect to database
    const dbConnected = await connectDB();
    if (dbConnected === false) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({ error: 'Database connection failed' })
      };
    }

    // Parse request body
    const { amount } = JSON.parse(event.body);

    // Validate amount
    if (!amount || typeof amount !== 'number' || amount <= 0 || amount > 10000) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({ error: 'Invalid amount. Must be between 0.01 and 10,000 USDC' })
      };
    }

    // Get user

    const user = await User.findById(decoded.userId);
    if (!user) {
      return {
        statusCode: 404,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    if (!user.solanaAddress) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({ error: 'Solana wallet not connected' })
      };
    }

    // Check treasury wallet
    if (!treasuryKeypair) {
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({ error: 'Treasury wallet not configured' })
      };
    }

    // Convert amount to lamports (USDC has 6 decimals)
    const amountLamports = Math.floor(amount * 1000000);

    const userPublicKey = new PublicKey(user.solanaAddress);
    const treasuryPublicKey = treasuryKeypair.publicKey;

    // Get associated token accounts
    const userATA = await getAssociatedTokenAddress(USDC_MINT, userPublicKey);
    const treasuryATA = await getAssociatedTokenAddress(USDC_MINT, treasuryPublicKey);

    // Check if user has enough USDC
    try {
      const userTokenAccount = await solanaConnection.getTokenAccountBalance(userATA);
      const userBalance = userTokenAccount.value.uiAmount || 0;

      if (userBalance < amount) {
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
          },
          body: JSON.stringify({ error: `Insufficient USDC balance. You have ${userBalance} USDC` })
        };
      }
    } catch (error) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({ error: 'Could not check USDC balance. Make sure you have an Associated Token Account' })
      };
    }

    // Create transaction
    const transaction = new Transaction();

    // Check if treasury ATA exists, create if not
    try {
      await getAccount(solanaConnection, treasuryATA);
    } catch (error) {
      // Treasury ATA doesn't exist, create it
      transaction.add(
        createAssociatedTokenAddressInstruction(
          treasuryPublicKey,
          treasuryATA,
          treasuryPublicKey,
          USDC_MINT
        )
      );
    }

    // Add transfer instruction
    transaction.add(
      createTransferInstruction(
        userATA,
        treasuryATA,
        userPublicKey,
        amountLamports
      )
    );

    // For demo purposes, we'll simulate the transaction since we can't actually sign with user's key
    // In production, this would require the frontend to sign and send the transaction
    console.log(`Simulating USDC transfer: ${amount} USDC from ${user.solanaAddress} to treasury`);

    // Update user balance and create transaction record
    user.gameBalance += amount;
    await user.save();

    const gameTransaction = new GameTransaction({
      userId: user._id,
      type: 'deposit',
      amount: amount,
      tokenAmount: amount,
      fromAddress: user.solanaAddress,
      toAddress: treasuryPublicKey.toString(),
      solanaTxHash: `simulated_${Date.now()}`,
      status: 'completed'
    });
    await gameTransaction.save();

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({
        success: true,
        amount: amount,
        newBalance: user.gameBalance,
        transactionId: gameTransaction._id,
        message: `Successfully purchased ${amount} casino tokens!`
      })
    };

  } catch (error) {
    console.error('Buy tokens error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({ error: 'Token purchase failed' })
    };
  }
};