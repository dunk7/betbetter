// Netlify Function for deposit verification
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { Connection, PublicKey, Transaction, SystemProgram } = require('@solana/web3.js');
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

  // Only allow POST requests
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

    const { autoUpdate, transactionSignature } = JSON.parse(event.body);

    console.log(`🔍 [DEPOSIT] Starting deposit for user ${user.email}`);

    if (autoUpdate) {
      // Auto-update for verified users
      console.log(`🔄 [DEPOSIT] Auto-updating balance for verified user ${user.email}`);

      if (!user.solanaAddress) {
        console.log(`❌ [DEPOSIT] User ${user.email} attempted auto-update but has no verified wallet`);
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Credentials': 'true'
          },
          body: JSON.stringify({
            error: 'No verified wallet found. Please complete your first deposit with a transaction signature.',
            requiresSignature: true
          })
        };
      }

      // For auto-update, we'll just return success since the real scanning happens server-side
      // The frontend should call this when they think they made a deposit
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
          message: 'Deposit scan initiated. Check back in a few minutes for balance updates.',
          autoUpdate: true
        })
      };
    }

    // Manual verification with transaction signature
    if (!transactionSignature) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'Transaction signature required' })
      };
    }

    // Check if transaction already processed
    const existingTransaction = await GameTransaction.findOne({ solanaTxHash: transactionSignature });
    if (existingTransaction) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'Transaction already processed' })
      };
    }

    console.log(`🔍 [DEPOSIT] Verifying transaction on Solana: ${transactionSignature}`);

    // Get transaction details from Solana
    const transaction = await solanaConnection.getTransaction(transactionSignature);

    if (!transaction) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'Transaction not found on Solana blockchain' })
      };
    }

    const meta = transaction.transaction.message;
    if (transaction.meta.err) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'Transaction failed on Solana blockchain' })
      };
    }

    // Analyze token balances
    const preBalances = transaction.meta.preTokenBalances;
    const postBalances = transaction.meta.postTokenBalances;

    // Find USDC transfers
    let usdcTransferred = 0;
    let senderAddress = null;

    for (let i = 0; i < preBalances.length; i++) {
      const pre = preBalances[i];
      const post = postBalances[i];

      if (pre.mint === USDC_MINT.toString() && post.mint === USDC_MINT.toString()) {
        const preAmount = parseFloat(pre.uiTokenAmount.uiAmount || 0);
        const postAmount = parseFloat(post.uiTokenAmount.uiAmount || 0);

        if (preAmount > postAmount) {
          // This account sent USDC
          usdcTransferred = preAmount - postAmount;
          senderAddress = pre.owner;
          break;
        }
      }
    }

    if (usdcTransferred === 0) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'No USDC transfer found in transaction' })
      };
    }

    // Verify sender address matches stored wallet (for non-first deposits)
    if (user.solanaAddress && user.solanaAddress !== senderAddress) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Credentials': 'true'
        },
        body: JSON.stringify({ error: 'Transaction sender does not match your verified wallet address' })
      };
    }

    // First deposit - store the sender address
    const isFirstDeposit = !user.solanaAddress;
    if (isFirstDeposit) {
      user.solanaAddress = senderAddress;
      console.log(`🆕 [DEPOSIT] First deposit - setting verified wallet address: ${senderAddress}`);
    }

    // Calculate tokens (USDC amount minus 5¢ fee)
    const DEPOSIT_FEE = 0.05;
    const usdcAfterFee = Math.max(0, usdcTransferred - DEPOSIT_FEE);
    const gameTokens = Math.floor(usdcAfterFee * 100) / 100; // Round to 2 decimal places

    console.log(`💰 [DEPOSIT] Fee calculation: ${usdcTransferred} USDC - ${DEPOSIT_FEE} fee = ${usdcAfterFee} USDC = ${gameTokens} tokens`);

    // Update user balance
    const oldBalance = user.gameBalance || 0;
    user.gameBalance = oldBalance + gameTokens;
    await user.save();

    console.log(`💾 [DEPOSIT] Updated user balance: ${oldBalance} → ${user.gameBalance}`);

    // Create transaction record
    const dbTransaction = new GameTransaction({
      userId: user._id,
      type: 'deposit',
      amount: gameTokens,
      solAmount: usdcAfterFee,
      tokenAmount: gameTokens,
      solanaTxHash: transactionSignature,
      fromAddress: senderAddress,
      toAddress: process.env.TREASURY_ADDRESS,
      timestamp: new Date(),
      status: 'completed'
    });

    await dbTransaction.save();

    console.log(`✅ [DEPOSIT] Transaction record saved with ID: ${dbTransaction._id}`);

    const message = isFirstDeposit
      ? `🎉 First deposit successful! Your wallet has been verified and you received ${gameTokens} tokens!`
      : `Successfully deposited ${usdcTransferred} USDC and received ${gameTokens} tokens!`;

    console.log(`🎉 [DEPOSIT] SUCCESS: ${usdcTransferred} USDC from ${senderAddress} → ${gameTokens} tokens (${transactionSignature})`);

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
        message: message,
        usdcReceived: usdcTransferred,
        feeDeducted: DEPOSIT_FEE,
        usdcAfterFee: usdcAfterFee,
        gameTokensAdded: gameTokens,
        newBalance: user.gameBalance,
        isFirstDeposit: isFirstDeposit,
        transactionHash: transactionSignature
      })
    };

  } catch (error) {
    console.error('Deposit error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': isAllowedOrigin ? origin : 'https://primimus.com',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Credentials': 'true'
      },
      body: JSON.stringify({ error: error.message || 'Deposit verification failed' })
    };
  }
};