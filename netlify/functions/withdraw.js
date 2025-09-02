// Netlify Function for withdrawing casino tokens to USDC
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
    console.log('Treasury wallet loaded for withdrawals');
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

// Helper function to get USDC balance from treasury
async function getUSDCBalance(walletAddress) {
  try {
    if (!walletAddress) return 0;

    const walletPublicKey = new PublicKey(walletAddress);
    const associatedTokenAddress = await getAssociatedTokenAddress(USDC_MINT, walletPublicKey);

    const accountInfo = await solanaConnection.getAccountInfo(associatedTokenAddress);
    if (!accountInfo) return 0;

    const tokenBalance = await solanaConnection.getTokenAccountBalance(associatedTokenAddress);
    return tokenBalance.value.uiAmount || 0;
  } catch (error) {
    console.log(`Error getting USDC balance: ${error.message}`);
    return 0;
  }
}

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

    console.log(`💸 [WITHDRAW] Starting withdrawal for user ${decoded.userId}, amount: ${amount}`);

    // Validate amount
    if (!amount || typeof amount !== 'number' || amount <= 0 || amount > 10000) {
      console.log(`❌ [WITHDRAW] Invalid amount: ${amount}`);
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({ error: 'Invalid withdrawal amount. Must be between 0.01 and 10,000 tokens' })
      };
    }

    // Get user

    const user = await User.findById(decoded.userId);
    if (!user) {
      console.log(`❌ [WITHDRAW] User not found: ${decoded.userId}`);
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

    console.log(`👤 [WITHDRAW] Processing for user: ${user.email}, current balance: ${user.gameBalance}`);

    // Check if user has a verified wallet address
    if (!user.solanaAddress) {
      console.log(`❌ [WITHDRAW] User has no verified wallet address`);
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({ error: 'You must make a deposit first to verify your wallet address before withdrawing' })
      };
    }

    console.log(`✅ [WITHDRAW] User has verified wallet: ${user.solanaAddress}`);

    // Check treasury wallet
    if (!treasuryKeypair) {
      console.log(`❌ [WITHDRAW] Treasury wallet not configured`);
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

    // Check user balance
    if (user.gameBalance < amount) {
      console.log(`❌ [WITHDRAW] Insufficient balance: ${user.gameBalance} < ${amount}`);
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({ error: `Insufficient casino tokens. You have ${user.gameBalance} tokens` })
      };
    }

    console.log(`✅ [WITHDRAW] Sufficient balance: ${user.gameBalance} >= ${amount}`);

    // Check treasury balance
    console.log(`🔍 [WITHDRAW] Checking treasury balance...`);
    const treasuryUsdcBalance = await getUSDCBalance(treasuryKeypair.publicKey.toString());
    console.log(`💰 [WITHDRAW] Treasury USDC balance: ${treasuryUsdcBalance}, required: ${amount}`);

    if (treasuryUsdcBalance < amount) {
      console.log(`❌ [WITHDRAW] Insufficient treasury funds: ${treasuryUsdcBalance} < ${amount}`);
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({ error: 'Treasury has insufficient funds. Please try again later.' })
      };
    }

    console.log(`✅ [WITHDRAW] Treasury has sufficient funds`);

    // Validate user's Solana address
    let userPublicKey;
    try {
      userPublicKey = new PublicKey(user.solanaAddress);
      console.log(`✅ [WITHDRAW] Valid Solana address: ${userPublicKey.toString()}`);
    } catch (error) {
      console.log(`❌ [WITHDRAW] Invalid Solana address: ${user.solanaAddress}`);
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({ error: 'Invalid Solana address' })
      };
    }

    // Convert amount to lamports (USDC has 6 decimals)
    const amountLamports = Math.floor(amount * 1000000);
    console.log(`🧮 [WITHDRAW] Calculation: ${amount} tokens = ${amount} USDC (${amountLamports} lamports)`);

    // Get associated token accounts
    const treasuryATA = await getAssociatedTokenAddress(USDC_MINT, treasuryKeypair.publicKey);
    const userATA = await getAssociatedTokenAddress(USDC_MINT, userPublicKey);

    // Create transaction
    const transaction = new Transaction();

    // Check if user ATA exists, create if not
    try {
      await getAccount(solanaConnection, userATA);
    } catch (error) {
      // User ATA doesn't exist, create it
      transaction.add(
        createAssociatedTokenAddressInstruction(
          userPublicKey,
          userATA,
          userPublicKey,
          USDC_MINT
        )
      );
    }

    // Add transfer instruction from treasury to user
    transaction.add(
      createTransferInstruction(
        treasuryATA,
        userATA,
        treasuryKeypair.publicKey,
        amountLamports
      )
    );

    console.log(`🚀 [WITHDRAW] Initiating REAL USDC transfer: ${amount} USDC (${amount} tokens) to ${user.solanaAddress}`);

    // Sign and send the actual transaction
    console.log(`🚀 [WITHDRAW] Executing real Solana transaction...`);
    let signature;
    try {
      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await solanaConnection.getLatestBlockhash('confirmed');

      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
      transaction.feePayer = treasuryKeypair.publicKey;

      // Sign the transaction with treasury keypair
      transaction.sign(treasuryKeypair);

      // Send and confirm the transaction
      signature = await sendAndConfirmTransaction(
        solanaConnection,
        transaction,
        [treasuryKeypair],
        {
          skipPreflight: false,
          commitment: 'confirmed',
          preflightCommitment: 'confirmed'
        }
      );

      console.log(`✅ [WITHDRAW] REAL USDC transfer completed with signature: ${signature}`);

    } catch (error) {
      console.error(`❌ [WITHDRAW] Transaction failed: ${error.message}`);
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({ error: `Transaction failed: ${error.message}` })
      };
    }

    // Update user balance
    const oldBalance = user.gameBalance;
    user.gameBalance -= amount;
    await user.save();

    console.log(`💾 [WITHDRAW] Updated user balance: ${oldBalance} → ${user.gameBalance}`);

    // Create transaction record
    console.log(`📝 [WITHDRAW] Creating transaction record...`);
    const gameTransaction = new GameTransaction({
      userId: user._id,
      type: 'withdraw',
      amount: amount, // USDC amount
      tokenAmount: amount, // Casino tokens withdrawn
      solanaTxHash: signature,
      fromAddress: treasuryKeypair.publicKey.toString(),
      toAddress: user.solanaAddress,
      status: 'completed'
    });
    await gameTransaction.save();

    console.log(`✅ [WITHDRAW] Transaction record saved with ID: ${gameTransaction._id}`);
    console.log(`🎉 [WITHDRAW] SUCCESS: ${amount} tokens → ${amount} USDC to ${user.solanaAddress} (${signature})`);

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
        solanaTxHash: signature,
        message: `Successfully withdrew ${amount} USDC (${amount} casino tokens) to your wallet!`
      })
    };

  } catch (error) {
    console.error('Withdrawal error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({ error: error.message || 'Withdrawal failed' })
    };
  }
};