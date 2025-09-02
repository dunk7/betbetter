// Netlify Function for verifying deposit transactions
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { Connection, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');
const BN = require('bn.js');
const User = require('./user-schema.js');

require('dotenv').config();

// USDC Constants
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// Treasury address from environment
const TREASURY_ADDRESS = process.env.TREASURY_ADDRESS;

// Solana connection
const solanaConnection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  'confirmed'
);

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

// Helper function to get treasury ATA
async function getTreasuryATA() {
  if (!TREASURY_ADDRESS) return null;
  try {
    const treasuryPubkey = new PublicKey(TREASURY_ADDRESS);
    return await getAssociatedTokenAddress(USDC_MINT, treasuryPubkey);
  } catch (error) {
    console.error('Error getting treasury ATA:', error);
    return null;
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
    const { solanaTxHash } = JSON.parse(event.body);

    if (!solanaTxHash) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({ error: 'Transaction hash is required' })
      };
    }

    // Check if transaction was already processed
    const existingTx = await GameTransaction.findOne({ solanaTxHash });
    if (existingTx) {
      console.log(`⚠️ [VERIFY-DEPOSIT] Transaction already processed: ${solanaTxHash}`);
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({ error: 'Transaction already processed' })
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

    // Verify transaction on Solana blockchain
    console.log(`🔍 [VERIFY-DEPOSIT] Verifying transaction: ${solanaTxHash}`);

    let transactionDetails;
    try {
      transactionDetails = await solanaConnection.getTransaction(solanaTxHash, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });

      if (!transactionDetails) {
        console.log(`❌ [VERIFY-DEPOSIT] Transaction not found: ${solanaTxHash}`);
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
          },
          body: JSON.stringify({ error: 'Transaction not found on blockchain' })
        };
      }

      console.log(`✅ [VERIFY-DEPOSIT] Transaction found on blockchain`);

      // Extract transaction details
      const tx = transactionDetails.transaction;
      const accountKeys = tx.message.accountKeys;

      // Find the transfer instruction and amount
      let transferFound = false;
      let actualAmount = 0;
      let fromAddress = '';
      let toAddress = '';

      for (const instruction of tx.message.instructions) {
        // Check if this is a token transfer
        if (instruction.programIdIndex === accountKeys.length - 1) {
          const programId = accountKeys[instruction.programIdIndex];
          if (programId.toString() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
            const instructionData = instruction.data;
            if (instructionData && instructionData.length >= 9) {
              // Extract amount (bytes 1-8)
              const amountBytes = instructionData.slice(1, 9);
              actualAmount = Number(new BN(amountBytes, 'le').toString()) / 1000000;

              // Extract accounts (source and destination)
              const sourceAccountIndex = instruction.accounts[0];
              const destAccountIndex = instruction.accounts[1];

              fromAddress = accountKeys[sourceAccountIndex]?.toString() || '';
              toAddress = accountKeys[destAccountIndex]?.toString() || '';

              transferFound = true;
              break;
            }
          }
        }
      }

      if (!transferFound || actualAmount <= 0) {
        console.log(`❌ [VERIFY-DEPOSIT] No valid token transfer found`);
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
          },
          body: JSON.stringify({ error: 'Invalid transaction: no token transfer found' })
        };
      }

      console.log(`✅ [VERIFY-DEPOSIT] Verified transfer: ${actualAmount} USDC from ${fromAddress} to ${toAddress}`);

      // For first-time deposits, verify the user's wallet address
      if (!user.solanaAddress) {
        console.log(`🔑 [VERIFY-DEPOSIT] Setting user wallet address: ${fromAddress}`);
        user.solanaAddress = fromAddress;
      } else if (user.solanaAddress !== fromAddress) {
        console.log(`❌ [VERIFY-DEPOSIT] Wallet address mismatch: expected ${user.solanaAddress}, got ${fromAddress}`);
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
          },
          body: JSON.stringify({ error: 'Transaction must be from your verified wallet address' })
        };
      }

    } catch (error) {
      console.error(`❌ [VERIFY-DEPOSIT] Transaction verification failed:`, error);
      return {
        statusCode: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify({ error: `Transaction verification failed: ${error.message}` })
      };
    }

    // Update user balance and create transaction record
    const oldBalance = user.gameBalance;
    user.gameBalance += actualAmount;
    await user.save();

    console.log(`💰 [VERIFY-DEPOSIT] Updated user balance: ${oldBalance} → ${user.gameBalance} casino tokens`);

    const gameTransaction = new GameTransaction({
      userId: user._id,
      type: 'deposit',
      amount: actualAmount,
      tokenAmount: actualAmount,
      fromAddress: user.solanaAddress,
      toAddress: 'TREASURY',
      solanaTxHash: solanaTxHash,
      status: 'completed'
    });
    await gameTransaction.save();

    console.log(`✅ [VERIFY-DEPOSIT] Transaction record saved: ${solanaTxHash}`);

    const isFirstDeposit = !user.solanaAddress;
    const message = isFirstDeposit
      ? `🎉 First deposit successful! Your wallet has been verified and you received ${actualAmount} casino tokens!`
      : `Successfully deposited ${actualAmount} USDC and received ${actualAmount} casino tokens!`;

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({
        success: true,
        usdcReceived: actualAmount,
        gameTokensAdded: actualAmount,
        newBalance: user.gameBalance,
        transactionId: gameTransaction._id,
        isFirstDeposit: isFirstDeposit,
        message: message
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