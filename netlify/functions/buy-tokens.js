// Netlify Function for buying casino tokens
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { Connection, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, Keypair } = require('@solana/web3.js');
const { createTransferInstruction, getAssociatedTokenAddress, createAssociatedTokenAddressInstruction, getAccount } = require('@solana/spl-token');
const BN = require('bn.js');
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

    // Verify the signed transaction from frontend
    console.log(`🔍 [BUY-TOKENS] Verifying real USDC transfer transaction...`);

    const { solanaTxHash } = JSON.parse(event.body);
    if (!solanaTxHash) {
      console.log(`❌ [BUY-TOKENS] No transaction hash provided`);
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

    console.log(`🔍 [BUY-TOKENS] Verifying transaction: ${solanaTxHash}`);

    // Verify transaction on Solana blockchain
    let transactionDetails;
    try {
      transactionDetails = await solanaConnection.getTransaction(solanaTxHash, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });

      if (!transactionDetails) {
        console.log(`❌ [BUY-TOKENS] Transaction not found: ${solanaTxHash}`);
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

      console.log(`✅ [BUY-TOKENS] Transaction found on blockchain`);

      // Verify transaction details
      const tx = transactionDetails.transaction;
      const accountKeys = tx.message.accountKeys;

      // Find the transfer instruction
      let transferFound = false;
      let actualAmount = 0;

      for (const instruction of tx.message.instructions) {
        // Check if this is a token transfer (program ID for SPL Token)
        if (instruction.programIdIndex === accountKeys.length - 1) { // Last account is usually the program
          const programId = accountKeys[instruction.programIdIndex];
          if (programId.toString() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') { // SPL Token program
            // This is likely a token transfer
            const instructionData = instruction.data;
            if (instructionData && instructionData.length >= 9) {
              // Extract amount from transfer instruction (bytes 1-8 are the amount)
              const amountBytes = instructionData.slice(1, 9);
              actualAmount = Number(new BN(amountBytes, 'le').toString()) / 1000000; // Convert from lamports to USDC
              transferFound = true;
              break;
            }
          }
        }
      }

      if (!transferFound) {
        console.log(`❌ [BUY-TOKENS] No token transfer found in transaction`);
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

      // Verify amount matches expected
      if (Math.abs(actualAmount - amount) > 0.000001) { // Small tolerance for floating point
        console.log(`❌ [BUY-TOKENS] Amount mismatch: expected ${amount}, got ${actualAmount}`);
        return {
          statusCode: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Methods': 'POST, OPTIONS'
          },
          body: JSON.stringify({ error: `Amount mismatch: expected ${amount} USDC, transaction shows ${actualAmount} USDC` })
        };
      }

      console.log(`✅ [BUY-TOKENS] Transaction verified: ${actualAmount} USDC transferred`);

    } catch (error) {
      console.error(`❌ [BUY-TOKENS] Transaction verification failed:`, error);
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

    // Check if transaction was already processed
    const existingTx = await GameTransaction.findOne({ solanaTxHash });
    if (existingTx) {
      console.log(`⚠️ [BUY-TOKENS] Transaction already processed: ${solanaTxHash}`);
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

    // Update user balance and create transaction record
    const oldBalance = user.gameBalance;
    user.gameBalance += amount;
    await user.save();

    console.log(`💰 [BUY-TOKENS] Updated user balance: ${oldBalance} → ${user.gameBalance} casino tokens`);

    const gameTransaction = new GameTransaction({
      userId: user._id,
      type: 'deposit',
      amount: amount, // USDC amount
      tokenAmount: amount, // Casino tokens credited
      fromAddress: user.solanaAddress,
      toAddress: treasuryPublicKey.toString(),
      solanaTxHash: solanaTxHash,
      status: 'completed'
    });
    await gameTransaction.save();

    console.log(`✅ [BUY-TOKENS] Transaction record saved: ${solanaTxHash}`);

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
        gameTokensAdded: amount,
        transactionId: gameTransaction._id,
        solanaTxHash: solanaTxHash,
        message: `Successfully purchased ${amount} casino tokens with ${amount} USDC!`
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