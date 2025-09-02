const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction } = require('@solana/spl-token');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// USDC Constants
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
console.log('🔧 [INIT] USDC Mint address:', USDC_MINT.toString());

// Treasury Wallet Setup (from environment variable)
let treasuryKeypair = null;
if (process.env.TREASURY_KEYPAIR) {
    try {
        // Load keypair from environment variable
        const keypairString = process.env.TREASURY_KEYPAIR;
        // Remove brackets and split by comma, then convert to numbers
        const keypairData = keypairString.replace(/^\[|\]$/g, '').split(',').map(num => parseInt(num.trim()));
        treasuryKeypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
        console.log('Treasury wallet loaded:', treasuryKeypair.publicKey.toString());

        // Check treasury SOL balance
        setTimeout(async () => {
            try {
                const solBalance = await solanaConnection.getBalance(treasuryKeypair.publicKey);
                const solBalanceInSOL = solBalance / LAMPORTS_PER_SOL;
                console.log(`💰 Treasury SOL balance: ${solBalanceInSOL} SOL`);

                if (solBalanceInSOL < 0.1) {
                    console.log(`⚠️ Treasury needs more SOL for transaction fees!`);
                    console.log(`📋 Treasury address: ${treasuryKeypair.publicKey.toString()}`);
                }

                // Check USDC balance
                const usdcBalance = await getUSDCBalance(solanaConnection, treasuryKeypair.publicKey);
                console.log(`💵 Treasury USDC balance: ${usdcBalance} USDC`);

                if (usdcBalance === 0) {
                    console.log(`⚠️ Treasury has no USDC! You need to:`);
                    console.log(`1. Go to a DEX like Jupiter or Raydium`);
                    console.log(`2. Swap some SOL to USDC`);
                    console.log(`3. Send USDC to: ${treasuryKeypair.publicKey.toString()}`);
                }
            } catch (error) {
                console.error('Error checking treasury balance:', error);
            }
        }, 2000); // Wait 2 seconds for connection to be ready

    } catch (error) {
        console.error('Error loading treasury keypair:', error);
    }
} else {
    console.warn('TREASURY_KEYPAIR environment variable not set. Real USDC transactions will not work.');
}

// Middleware
app.use(cors({
    origin: [
        'http://127.0.0.1:3000',
        'http://localhost:3000',
        'http://localhost:5000',
        'http://127.0.0.1:35161',
        'https://primimus.com',
        'https://www.primimus.com',
        'https://primimus.netlify.app',
        'https://*.netlify.app'  // Allow all Netlify subdomains
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());

// Add headers for Google OAuth and Solana wallet compatibility
app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');

    // Allow dynamic origins for Netlify deployments
    const allowedOrigins = [
        'http://127.0.0.1:3000',
        'http://localhost:3000',
        'http://localhost:5000',
        'http://127.0.0.1:35161',
        'https://primimus.com',
        'https://www.primimus.com',
        'https://primimus.netlify.app'
    ];

    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin) || origin?.endsWith('.netlify.app')) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }

    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    next();
});

// MongoDB connection
// Connect to MongoDB with proper error handling
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/betbetter', {
            // Remove deprecated options
        });
        console.log('MongoDB connected successfully');
    } catch (error) {
        console.error('MongoDB connection error:', error.message);
        // Don't exit process, let it retry
        setTimeout(connectDB, 5000);
    }
};

connectDB();

// Google OAuth client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Solana connection
const solanaConnection = new Connection(
    process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0  // Support legacy transactions
    }
);

// USDC Utility Functions
async function getOrCreateAssociatedTokenAccount(connection, mint, owner, payer) {
    const associatedTokenAddress = await getAssociatedTokenAddress(mint, owner);

    // Check if account exists
    const accountInfo = await connection.getAccountInfo(associatedTokenAddress);

    if (accountInfo === null) {
        // Create associated token account
        const transaction = new Transaction().add(
            createAssociatedTokenAccountInstruction(
                payer.publicKey,
                associatedTokenAddress,
                owner,
                mint
            )
        );

        await sendAndConfirmTransaction(connection, transaction, [payer]);
        console.log('Created associated token account:', associatedTokenAddress.toString());
    }

    return associatedTokenAddress;
}

async function getUSDCBalance(connection, owner) {
    try {
        const associatedTokenAddress = await getAssociatedTokenAddress(USDC_MINT, owner);

        // Check if token account exists first
        const accountInfo = await connection.getAccountInfo(associatedTokenAddress);
        if (!accountInfo) {
            console.log(`❌ No ATA found for ${owner.toString()}`);
            return 0;
        }

        const tokenBalance = await connection.getTokenAccountBalance(associatedTokenAddress);
        const balance = tokenBalance.value.uiAmount || 0;
        console.log(`💰 [BALANCE] ${owner.toString()} USDC balance: ${balance}`);
        return balance;
    } catch (error) {
        // Account doesn't exist or has no USDC
        console.log(`❌ Error getting USDC balance for ${owner.toString()}: ${error.message}`);
        return 0;
    }
}

async function transferUSDC(connection, from, to, amount, signer) {
    try {
        console.log(`🚀 [TRANSFER] Starting real USDC transfer...`);
        console.log(`   💸 Amount: ${amount} USDC (type: ${typeof amount})`);
        console.log(`   📤 From: ${from.toString()} (type: ${typeof from}, constructor: ${from.constructor.name})`);
        console.log(`   📥 To: ${to.toString()} (type: ${typeof to}, constructor: ${to.constructor.name})`);
        console.log(`   🔑 Signer: ${signer.publicKey.toString()} (type: ${typeof signer}, constructor: ${signer.constructor.name})`);

        // Get associated token accounts
        console.log(`   🔍 Getting associated token addresses...`);

        // Check if fromATA exists and get its balance
        const fromATA = await getAssociatedTokenAddress(USDC_MINT, from);
        console.log(`   🔍 Checking treasury ATA: ${fromATA.toString()}`);

        try {
            const treasuryBalance = await getUSDCBalance(connection, from);
            console.log(`   💰 Treasury wallet USDC balance: ${treasuryBalance}`);
        } catch (error) {
            console.log(`   ❌ Error checking treasury balance: ${error.message}`);
        }

        // Check if fromATA exists
        try {
            const fromATAInfo = await connection.getAccountInfo(fromATA);
            if (fromATAInfo) {
                console.log(`   ✅ Treasury ATA exists: ${fromATA.toString()}`);
                // Get token account balance
                const tokenBalance = await connection.getTokenAccountBalance(fromATA);
                console.log(`   💰 Treasury ATA balance: ${tokenBalance.value.uiAmount} USDC`);
            } else {
                console.log(`   ❌ Treasury ATA does not exist: ${fromATA.toString()}`);
                console.log(`   🔧 This is the problem - treasury needs an ATA with USDC!`);
            }
        } catch (error) {
            console.log(`   ❌ Error checking treasury ATA: ${error.message}`);
        }

        const toATA = await getOrCreateAssociatedTokenAccount(connection, USDC_MINT, to, signer);

        console.log(`   🔗 From ATA: ${fromATA.toString()} (type: ${typeof fromATA}, constructor: ${fromATA.constructor.name})`);
        console.log(`   🔗 To ATA: ${toATA.toString()} (type: ${typeof toATA}, constructor: ${toATA.constructor.name})`);
        console.log(`   🪙 USDC Mint: ${USDC_MINT.toString()} (type: ${typeof USDC_MINT}, constructor: ${USDC_MINT.constructor.name})`);
        console.log(`   🏛️ TOKEN_PROGRAM_ID: ${TOKEN_PROGRAM_ID.toString()} (type: ${typeof TOKEN_PROGRAM_ID}, constructor: ${TOKEN_PROGRAM_ID.constructor.name})`);

        // Calculate amount with debugging
        const rawAmount = amount * 1000000;
        const finalAmount = BigInt(Math.floor(rawAmount));
        console.log(`   💰 Amount calculation: ${amount} * 1000000 = ${rawAmount} → BigInt(${Math.floor(rawAmount)}) = ${finalAmount}`);

        // Create transfer instruction
        console.log(`   📝 Creating transfer instruction...`);
        console.log(`   🔧 Parameters (correct order):`);
        console.log(`      - source (fromATA): ${fromATA.toString()}`);
        console.log(`      - destination (toATA): ${toATA.toString()}`);
        console.log(`      - owner (from): ${from.toString()}`);
        console.log(`      - amount: ${finalAmount} (type: ${typeof finalAmount})`);
        console.log(`      - multiSigners: []`);
        console.log(`      - programId (TOKEN_PROGRAM_ID): ${TOKEN_PROGRAM_ID.toString()}`);

        // Check the correct parameter order for createTransferInstruction
        // According to Solana docs: source, destination, owner, amount, multiSigners?, programId?
        const transferInstruction = createTransferInstruction(
            fromATA,           // source token account
            toATA,             // destination token account
            from,              // owner of source account
            finalAmount,       // amount to transfer (BigInt)
            [],                // multi-signers (empty array)
            TOKEN_PROGRAM_ID   // program ID
        );

        console.log(`   ✅ Transfer instruction created successfully`);

        // Add compute budget instructions for lower fees (same as withdrawals)
        const { ComputeBudgetProgram } = require('@solana/web3.js');
        const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
            units: 200_000 // Standard limit for token transfers
        });
        const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: 1_000 // Very low priority fee (0.001 lamports per compute unit)
        });

        // Create transaction with compute budget instructions
        const transaction = new Transaction()
            .add(computeBudgetIx)
            .add(priorityFeeIx)
            .add(transferInstruction);

        // Get recent blockhash
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = from;

        console.log(`   📋 Transaction created, signing...`);

        // Sign and send transaction
        const signature = await sendAndConfirmTransaction(connection, transaction, [signer]);

        console.log(`✅ [TRANSFER] USDC transfer successful!`);
        console.log(`   🔗 Signature: ${signature}`);

        return signature;
    } catch (error) {
        console.error(`❌ [TRANSFER] USDC transfer failed:`, error);
        throw error;
    }
}

async function transferSOL(connection, from, to, amount, signer) {
    // Convert SOL to lamports
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: from,
            toPubkey: to,
            lamports: lamports
        })
    );

    const signature = await sendAndConfirmTransaction(connection, transaction, [signer]);
    console.log('SOL transfer successful:', signature);
    return signature;
}

// User Schema
const userSchema = new mongoose.Schema({
    googleId: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    name: String,
    picture: String,
    solanaAddress: String, // User's verified Solana address
    gameBalance: { type: Number, default: 0 }, // Starting tokens
    usdcBalance: { type: Number, default: 0 }, // USDC balance
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Transaction Schema
const transactionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['deposit', 'withdraw', 'bet_win', 'bet_loss'], required: true },
    amount: { type: Number, required: true },
    solAmount: Number, // For SOL/USDC transactions
    tokenAmount: Number, // For game token transactions
    solanaTxHash: { type: String, unique: true }, // Solana transaction hash (unique to prevent double-processing)
    fromAddress: String, // Sender's Solana address (for verification)
    toAddress: String, // Receiver's Solana address
    timestamp: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'completed' }
});

const GameTransaction = mongoose.model('Transaction', transactionSchema);

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Access token required' });

    jwt.verify(token, process.env.JWT_SECRET || 'CHANGE_THIS_JWT_SECRET_IN_PRODUCTION', (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = user;
        next();
    });
};

// Google OAuth verification
app.post('/api/auth/google', async (req, res) => {
    try {
        const { token } = req.body;

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
                gameBalance: 50, // Starting balance
            });
        }

        user.lastLogin = new Date();
        await user.save();

        // Create JWT token
        const jwtToken = jwt.sign(
            { userId: user._id, googleId: user.googleId },
            process.env.JWT_SECRET || 'CHANGE_THIS_JWT_SECRET_IN_PRODUCTION',
            { expiresIn: '7d' }
        );

        res.json({
            token: jwtToken,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                picture: user.picture,
                gameBalance: user.gameBalance,
                solanaBalance: user.solanaBalance,
                solanaAddress: user.solanaAddress
            }
        });

    } catch (error) {
        console.error('Google auth error:', error);
        res.status(401).json({ error: 'Authentication failed' });
    }
});

// Get user profile
app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Get real USDC balance if address is set
        let usdcBalance = 0;
        if (user.solanaAddress) {
            try {
                const publicKey = new PublicKey(user.solanaAddress);
                usdcBalance = await getUSDCBalance(solanaConnection, publicKey);
                console.log(`💰 [PROFILE] User ${user.email} USDC balance: ${usdcBalance}`);
            } catch (error) {
                console.log(`❌ [PROFILE] Error fetching USDC balance for ${user.email}:`, error);
            }
        }

        res.json({
            id: user._id,
            name: user.name,
            email: user.email,
            picture: user.picture,
            gameBalance: user.gameBalance,
            usdcBalance: usdcBalance,
            solanaAddress: user.solanaAddress
        });

    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update Solana address
app.post('/api/user/solana-address', authenticateToken, async (req, res) => {
    try {
        const { solanaAddress } = req.body;

        // Validate Solana address
        try {
            new PublicKey(solanaAddress);
        } catch (error) {
            return res.status(400).json({ error: 'Invalid Solana address' });
        }

        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.solanaAddress = solanaAddress;

        // Get initial balance
        try {
            const publicKey = new PublicKey(solanaAddress);
            const balance = await solanaConnection.getBalance(publicKey);
            user.solanaBalance = balance / LAMPORTS_PER_SOL;
        } catch (error) {
            console.log('Error fetching initial balance:', error);
        }

        await user.save();

        res.json({ message: 'Solana address updated successfully' });

    } catch (error) {
        console.error('Solana address update error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Deposit USDC (User pays transaction fee)
app.post('/api/deposit', authenticateToken, async (req, res) => {
    try {
        const { transactionSignature, autoUpdate } = req.body;
        console.log(`🔍 [DEPOSIT] Starting deposit for user ${req.user.userId}`);

        const user = await User.findById(req.user.userId);
        if (!user) {
            console.log(`❌ [DEPOSIT] User not found: ${req.user.userId}`);
            return res.status(404).json({ error: 'User not found' });
        }

        // If user has verified wallet and requests auto-update, reconcile balance
        if (autoUpdate && user.solanaAddress) {
            console.log(`🔄 [DEPOSIT] Auto-updating balance for verified user ${user.email}`);

            const calculatedBalance = await calculateBalanceFromHistory(req.user.userId);
            const previousBalance = user.gameBalance;

            user.gameBalance = calculatedBalance;
            await user.save();

            console.log(`✅ [AUTO_DEPOSIT] Balance updated: ${previousBalance} → ${calculatedBalance}`);

            return res.json({
                message: 'Balance automatically updated from transaction history',
                gameTokensAdded: calculatedBalance - previousBalance,
                newGameBalance: calculatedBalance,
                autoUpdated: true,
                walletVerified: true
            });
        }

        // Manual verification required for new users or when autoUpdate is false
        if (!transactionSignature) {
            console.log(`❌ [DEPOSIT] Missing transaction signature`);
            return res.status(400).json({ error: 'Transaction signature required' });
        }
        console.log(`👤 [DEPOSIT] Processing for user: ${user.email}, current balance: ${user.gameBalance}`);

        // Check if transaction was already processed
        const existingTransaction = await GameTransaction.findOne({ solanaTxHash: transactionSignature });
        if (existingTransaction) {
            console.log(`❌ [DEPOSIT] Transaction already processed: ${transactionSignature}`);
            return res.status(400).json({ error: 'This transaction has already been processed' });
        }
        console.log(`✅ [DEPOSIT] Transaction signature is unique: ${transactionSignature}`);

        // Verify the transaction on Solana
        console.log(`🔍 [DEPOSIT] Verifying transaction on Solana: ${transactionSignature}`);

        // Get transaction details from Solana
        const transaction = await solanaConnection.getParsedTransaction(transactionSignature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
        });

        if (!transaction) {
            console.log(`❌ [DEPOSIT] Transaction not found on Solana: ${transactionSignature}`);
            return res.status(400).json({ error: 'Transaction not found on Solana' });
        }
        console.log(`✅ [DEPOSIT] Transaction found on Solana`);

        // Verify transaction details
        const { meta, transaction: txData } = transaction;
        console.log(`🔍 [DEPOSIT] Transaction meta:`, {
            err: meta.err,
            fee: meta.fee,
            preBalances: meta.preBalances?.length,
            postBalances: meta.postBalances?.length,
            preTokenBalances: meta.preTokenBalances?.length,
            postTokenBalances: meta.postTokenBalances?.length
        });

        // Check if transaction was successful
        if (meta.err) {
            console.log(`❌ [DEPOSIT] Transaction failed on Solana:`, meta.err);
            return res.status(400).json({ error: 'Transaction failed on Solana' });
        }
        console.log(`✅ [DEPOSIT] Transaction successful on Solana`);

        // Check if user sent to treasury
        const accountKeys = txData.message.accountKeys;
        const treasuryAddress = treasuryKeypair.publicKey.toString();

        // Find USDC transfers in the transaction
        let usdcTransferred = 0;
        let senderAddress = null;

        console.log(`🔍 [DEPOSIT] Analyzing token balances for USDC mint: ${USDC_MINT.toString()}`);

        if (meta.preTokenBalances && meta.postTokenBalances) {
            console.log(`📊 [DEPOSIT] Token balance changes:`);
            for (let i = 0; i < meta.preTokenBalances.length; i++) {
                const preBalance = meta.preTokenBalances[i];
                const postBalance = meta.postTokenBalances[i];

                if (preBalance.mint === USDC_MINT.toString()) {
                    const preAmount = preBalance.uiTokenAmount.uiAmount || 0;
                    const postAmount = postBalance.uiTokenAmount.uiAmount || 0;
                    const change = postAmount - preAmount;

                    console.log(`   ${preBalance.owner}: ${preAmount} → ${postAmount} (${change > 0 ? '+' : ''}${change})`);

                    // Find the sender who lost USDC
                    if (preAmount > postAmount) {
                        senderAddress = preBalance.owner;
                        usdcTransferred = preAmount - postAmount;
                    }
                }
            }
        }

        console.log(`💰 [DEPOSIT] USDC transferred: ${usdcTransferred}, sender: ${senderAddress}`);

        if (usdcTransferred <= 0) {
            console.log(`❌ [DEPOSIT] No USDC transfer found in this transaction`);
            return res.status(400).json({ error: 'No USDC transfer found in this transaction' });
        }

        if (!senderAddress) {
            console.log(`❌ [DEPOSIT] Could not identify sender address`);
            return res.status(400).json({ error: 'Could not identify sender address' });
        }

        // Verify sender address
        if (user.solanaAddress) {
            // User has a verified address - must match
            console.log(`🔍 [DEPOSIT] Verifying sender address: ${senderAddress} vs stored: ${user.solanaAddress}`);
            if (user.solanaAddress !== senderAddress) {
                console.log(`❌ [DEPOSIT] Address mismatch! Transaction sender does not match verified wallet`);
                return res.status(400).json({ error: 'Transaction sender does not match your verified wallet address' });
            }
            console.log(`✅ [DEPOSIT] Address verified - matches stored wallet`);
        } else {
            // First deposit - store the sender address
            user.solanaAddress = senderAddress;
            console.log(`🆕 [DEPOSIT] First deposit - setting verified wallet address for user ${user.email}: ${senderAddress}`);
        }

        // Apply 5 cent (0.05 USDC) fee for transaction costs
        const DEPOSIT_FEE = 0.05;
        const usdcAfterFee = Math.max(0, usdcTransferred - DEPOSIT_FEE);
        const feeAmount = usdcTransferred - usdcAfterFee;
        console.log(`💰 [DEPOSIT] Fee calculation: ${usdcTransferred} USDC - ${DEPOSIT_FEE} fee = ${usdcAfterFee} USDC usable`);

        // Calculate game tokens from USDC after fee (1 USDC = 1 token - 1:1 ratio)
        const gameTokens = usdcAfterFee;
        console.log(`🧮 [DEPOSIT] Calculation: ${usdcAfterFee} USDC = ${gameTokens} tokens`);

        // Update database
        const oldBalance = user.gameBalance;
        user.gameBalance += gameTokens;
        await user.save();
        console.log(`💾 [DEPOSIT] Updated user balance: ${oldBalance} → ${user.gameBalance}`);

        // Create transaction record
        console.log(`📝 [DEPOSIT] Creating transaction record...`);
        const dbTransaction = new GameTransaction({
            userId: user._id,
            type: 'deposit',
            amount: gameTokens,
            solAmount: usdcTransferred,
            tokenAmount: gameTokens,
            solanaTxHash: transactionSignature,
            fromAddress: senderAddress,
            toAddress: treasuryAddress,
            status: 'completed'
        });
        await dbTransaction.save();
        console.log(`✅ [DEPOSIT] Transaction record saved with ID: ${dbTransaction._id}`);

        console.log(`🎉 [DEPOSIT] SUCCESS: ${usdcTransferred} USDC from ${senderAddress} → ${gameTokens} tokens (${transactionSignature})`);

        const response = {
            message: user.solanaAddress === senderAddress ? 'Deposit successful' : 'First deposit successful! Your wallet address has been verified.',
            gameTokensAdded: gameTokens,
            newGameBalance: user.gameBalance,
            transactionSignature: transactionSignature,
            usdcReceived: usdcTransferred,
            usdcAfterFee: usdcAfterFee,
            feeDeducted: feeAmount,
            walletVerified: !user.solanaAddress
        };

        console.log(`📤 [DEPOSIT] Sending response:`, response);
        res.json(response);

    } catch (error) {
        console.error('Deposit error:', error);
        res.status(500).json({ error: error.message || 'Deposit failed' });
    }
});

// Withdraw USDC (REAL TRANSACTIONS)
app.post('/api/withdraw', authenticateToken, async (req, res) => {
    try {
        const { amount, userSolanaAddress } = req.body;
        console.log(`💸 [WITHDRAW] Starting withdrawal for user ${req.user.userId}, amount: ${amount}`);

        if (!amount || amount <= 0) {
            console.log(`❌ [WITHDRAW] Invalid amount: ${amount}`);
            return res.status(400).json({ error: 'Invalid amount' });
        }

        if (!userSolanaAddress) {
            console.log(`❌ [WITHDRAW] Missing Solana address`);
            return res.status(400).json({ error: 'Solana address required for withdrawal' });
        }

        if (!treasuryKeypair) {
            console.log(`❌ [WITHDRAW] Treasury wallet not configured`);
            return res.status(500).json({ error: 'Treasury wallet not configured' });
        }

        const user = await User.findById(req.user.userId);
        if (!user) {
            console.log(`❌ [WITHDRAW] User not found: ${req.user.userId}`);
            return res.status(404).json({ error: 'User not found' });
        }
        console.log(`👤 [WITHDRAW] Processing for user: ${user.email}, current balance: ${user.gameBalance}`);

        // Verify user's Solana address is registered
        if (!user.solanaAddress) {
            console.log(`❌ [WITHDRAW] User has no verified wallet address`);
            return res.status(400).json({ error: 'You must make a deposit first to verify your wallet address before withdrawing' });
        }
        console.log(`✅ [WITHDRAW] User has verified wallet: ${user.solanaAddress}`);

        // Verify the provided address matches the registered one
        console.log(`🔍 [WITHDRAW] Verifying address: ${userSolanaAddress} vs stored: ${user.solanaAddress}`);
        if (user.solanaAddress !== userSolanaAddress) {
            console.log(`❌ [WITHDRAW] Address mismatch!`);
            return res.status(400).json({ error: 'Provided address does not match your verified wallet address' });
        }
        console.log(`✅ [WITHDRAW] Address verified`);

        // Calculate USDC amount (1 token = 1 USDC - 1:1 ratio)
        const usdcAmount = amount;
        console.log(`🧮 [WITHDRAW] Calculation: ${amount} tokens = ${usdcAmount} USDC`);

        if (user.gameBalance < amount) {
            console.log(`❌ [WITHDRAW] Insufficient balance: ${user.gameBalance} < ${amount}`);
            return res.status(400).json({ error: 'Insufficient game balance' });
        }
        console.log(`✅ [WITHDRAW] Sufficient balance: ${user.gameBalance} >= ${amount}`);

        // Check treasury has enough USDC
        console.log(`🔍 [WITHDRAW] Checking treasury balance...`);
        const treasuryUsdcBalance = await getUSDCBalance(solanaConnection, treasuryKeypair.publicKey);
        console.log(`💰 [WITHDRAW] Treasury USDC balance: ${treasuryUsdcBalance}, required: ${usdcAmount}`);

        if (treasuryUsdcBalance < usdcAmount) {
            console.log(`❌ [WITHDRAW] Insufficient treasury funds: ${treasuryUsdcBalance} < ${usdcAmount}`);
            return res.status(500).json({ error: 'Casino treasury has insufficient funds. Please try again later.' });
        }
        console.log(`✅ [WITHDRAW] Treasury has sufficient funds`);

        let userPublicKey;
        try {
            userPublicKey = new PublicKey(userSolanaAddress);
            console.log(`✅ [WITHDRAW] Valid Solana address: ${userPublicKey.toString()}`);
        } catch (error) {
            console.log(`❌ [WITHDRAW] Invalid Solana address: ${userSolanaAddress}`);
            return res.status(400).json({ error: 'Invalid Solana address' });
        }

        console.log(`🚀 [WITHDRAW] Initiating transfer: ${usdcAmount} USDC (${amount} tokens)`);
        console.log(`   📤 FROM (Treasury): ${treasuryKeypair.publicKey.toString()}`);
        console.log(`   📥 TO (Your Wallet): ${userPublicKey.toString()}`);

        // Real USDC transfer
        console.log(`🚀 [WITHDRAW] Using real USDC transfer`);
        const signature = await transferUSDC(
            solanaConnection,
            treasuryKeypair.publicKey,
            userPublicKey,
            usdcAmount,
            treasuryKeypair
        );
        console.log(`✅ [WITHDRAW] Transfer completed with signature: ${signature}`);

        // Update database
        const oldBalance = user.gameBalance;
        user.gameBalance -= amount;
        await user.save();
        console.log(`💾 [WITHDRAW] Updated user balance: ${oldBalance} → ${user.gameBalance}`);

        // Create transaction record
        console.log(`📝 [WITHDRAW] Creating transaction record...`);
        const transaction = new GameTransaction({
            userId: user._id,
            type: 'withdraw',
            amount: amount,
            solAmount: usdcAmount,
            tokenAmount: amount,
            solanaTxHash: signature,
            fromAddress: treasuryKeypair.publicKey.toString(),
            toAddress: userSolanaAddress,
            status: 'completed'
        });
        await transaction.save();
        console.log(`✅ [WITHDRAW] Transaction record saved with ID: ${transaction._id}`);

        console.log(`🎉 [WITHDRAW] SUCCESS: ${amount} tokens → ${usdcAmount} USDC to ${userSolanaAddress} (${signature})`);

        const response = {
            message: 'Withdrawal successful',
            usdcReceived: usdcAmount,
            newGameBalance: user.gameBalance,
            transactionSignature: signature
        };

        console.log(`📤 [WITHDRAW] Sending response:`, response);
        res.json(response);

    } catch (error) {
        console.error('Withdrawal error:', error);
        res.status(500).json({ error: error.message || 'Withdrawal failed' });
    }
});

// Get treasury address (no auth required for deposits)
app.get('/api/treasury-address', async (req, res) => {
    try {
        if (!treasuryKeypair) {
            return res.status(500).json({ error: 'Treasury wallet not configured' });
        }

        res.json({
            treasuryAddress: treasuryKeypair.publicKey.toString()
        });

    } catch (error) {
        console.error('Treasury address fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch treasury address' });
    }
});

// Get treasury balance (authenticated users only)
app.get('/api/treasury-balance', authenticateToken, async (req, res) => {
    try {
        if (!treasuryKeypair) {
            return res.status(500).json({ error: 'Treasury wallet not configured' });
        }

        const treasuryUsdcBalance = await getUSDCBalance(solanaConnection, treasuryKeypair.publicKey);

        res.json({
            usdcBalance: treasuryUsdcBalance,
            formattedBalance: `${treasuryUsdcBalance.toFixed(2)} USDC`
        });

    } catch (error) {
        console.error('Treasury balance fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch treasury balance' });
    }
});



// Auto-scan for deposits every 2 minutes (balance speed vs rate limits)
setInterval(scanForNewDeposits, 120000);

// Manual trigger for deposit scanning (for frontend)
app.post('/api/admin/trigger-deposit-scan', async (req, res) => {
    try {
        console.log('🔍 [MANUAL SCAN] Manual deposit scan triggered');
        const result = await scanForNewDeposits();
        res.json({
            message: 'Deposit scan completed',
            success: true,
            scannedTransactions: result?.processedCount || 0
        });
    } catch (error) {
        console.error('Manual scan error:', error);
        res.status(500).json({
            error: 'Scan failed',
            details: error.message
        });
    }
});

// Check for very recent deposits (last 5 minutes)
app.post('/api/admin/check-recent-deposits', async (req, res) => {
    try {
        console.log('🔍 [RECENT SCAN] Checking for deposits in last 5 minutes...');

        if (!treasuryKeypair) {
            return res.status(500).json({ error: 'Treasury not configured' });
        }

        const treasuryAddress = treasuryKeypair.publicKey.toString();

        // Get the treasury's USDC token account address
        const treasuryUsdcAccount = await solanaConnection.getTokenAccountsByOwner(
            treasuryKeypair.publicKey,
            { mint: USDC_MINT }
        );

        if (!treasuryUsdcAccount.value || treasuryUsdcAccount.value.length === 0) {
            console.log('⚠️ [RECENT SCAN] No USDC token account found for treasury');
            return res.status(500).json({ error: 'No USDC token account' });
        }

        const usdcTokenAccount = treasuryUsdcAccount.value[0].pubkey;
        console.log(`🔍 [RECENT SCAN] Treasury USDC token account: ${usdcTokenAccount.toString()}`);

        // Get more recent transactions for the USDC token account
        const signatures = await solanaConnection.getSignaturesForAddress(
            usdcTokenAccount,
            {
                limit: 20 // Check last 20 transactions to catch very recent ones
            }
        );

        console.log(`📊 [RECENT SCAN] Found ${signatures.length} transactions to check`);

        const fiveMinutesAgo = Date.now() - (30 * 60 * 1000); // 30 minutes ago (increased time window)
        let recentDeposits = [];
        let processedCount = 0;

        // Check each transaction
        for (let i = 0; i < Math.min(signatures.length, 10); i++) { // Check first 10 most recent
            const sigInfo = signatures[i];

            try {
                // Skip if already processed
                const existingTransaction = await GameTransaction.findOne({
                    solanaTxHash: sigInfo.signature
                });

                if (existingTransaction) {
                    continue;
                }

                // Check if transaction is recent (within last 5 minutes)
                const txTime = sigInfo.blockTime * 1000; // Convert to milliseconds
                if (txTime < fiveMinutesAgo) {
                    console.log(`⏰ [RECENT SCAN] Transaction ${sigInfo.signature} is too old (${new Date(txTime).toISOString()})`);
                    continue;
                }

                console.log(`🔍 [RECENT SCAN] Analyzing recent transaction: ${sigInfo.signature} (${new Date(txTime).toISOString()})`);

                // Add delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 500));

                // Get transaction details
                const transaction = await solanaConnection.getParsedTransaction(
                    sigInfo.signature,
                    {
                        commitment: 'confirmed',
                        maxSupportedTransactionVersion: 0
                    }
                );

                if (!transaction) {
                    console.log(`❌ [RECENT SCAN] Could not fetch transaction details: ${sigInfo.signature}`);
                    continue;
                }

                // Analyze token balances
                if (transaction.meta?.preTokenBalances && transaction.meta?.postTokenBalances) {
                    let usdcTransferred = 0;
                    let senderAddress = null;

                    for (let j = 0; j < transaction.meta.preTokenBalances.length; j++) {
                        const preBalance = transaction.meta.preTokenBalances[j];
                        const postBalance = transaction.meta.postTokenBalances[j];

                        if (preBalance.mint === USDC_MINT.toString()) {
                            const preAmount = preBalance.uiTokenAmount.uiAmount || 0;
                            const postAmount = postBalance.uiTokenAmount.uiAmount || 0;
                            const change = postAmount - preAmount;

                            if (preAmount > postAmount) {
                                senderAddress = preBalance.owner;
                                usdcTransferred = preAmount - postAmount;
                                break;
                            }
                        }
                    }

                    if (usdcTransferred > 0 && senderAddress) {
                        console.log(`💰 [RECENT SCAN] Found recent USDC deposit: ${usdcTransferred} USDC from ${senderAddress}`);

                        // Check if this sender has a verified account
                        console.log(`🔍 [RECENT SCAN] Checking if sender ${senderAddress} has verified account`);
                        const user = await User.findOne({ solanaAddress: senderAddress });

                        if (user) {
                            console.log(`✅ [RECENT SCAN] Found verified user: ${user.email}`);

                            // Apply 1 cent fee
                            const DEPOSIT_FEE = 0.05;
                            const usdcAfterFee = Math.max(0, usdcTransferred - DEPOSIT_FEE);
                            const gameTokens = usdcAfterFee;

                            // Update user balance
                            const oldBalance = user.gameBalance;
                            user.gameBalance += gameTokens;
                            await user.save();

                            // Create transaction record
                            const dbTransaction = new GameTransaction({
                                userId: user._id,
                                type: 'deposit',
                                amount: gameTokens,
                                solAmount: usdcTransferred,
                                tokenAmount: gameTokens,
                                solanaTxHash: sigInfo.signature,
                                fromAddress: senderAddress,
                                toAddress: treasuryAddress,
                                status: 'completed'
                            });
                            await dbTransaction.save();

                            console.log(`🎉 [RECENT SCAN] Auto-processed recent deposit: ${usdcTransferred} USDC → ${gameTokens} tokens for ${user.email}`);

                            recentDeposits.push({
                                signature: sigInfo.signature,
                                amount: usdcTransferred,
                                tokens: gameTokens,
                                user: user.email,
                                time: new Date(txTime).toISOString()
                            });

                            processedCount++;
                        }
                    }
                }

            } catch (error) {
                console.error(`❌ [RECENT SCAN] Error processing transaction ${sigInfo.signature}:`, error.message);
            }
        }

        console.log(`✅ [RECENT SCAN] Recent scan complete. Processed ${processedCount} deposits.`);

        res.json({
            message: 'Recent deposit scan completed',
            success: true,
            scannedTransactions: Math.min(signatures.length, 10),
            processedDeposits: processedCount,
            recentDeposits: recentDeposits
        });

    } catch (error) {
        console.error('❌ [RECENT SCAN] Error:', error);
        res.status(500).json({
            error: 'Recent scan failed',
            details: error.message
        });
    }
});

// Return scan result
async function scanForNewDeposits() {
    try {
        console.log('🔍 [DEPOSIT SCAN] Starting blockchain scan for new deposits...');

        if (!treasuryKeypair) {
            console.log('❌ [DEPOSIT SCAN] Treasury wallet not configured');
            console.log('Available env vars:', Object.keys(process.env));
            return { processedCount: 0, error: 'Treasury not configured' };
        }

        const treasuryAddress = treasuryKeypair.publicKey.toString();
        console.log(`🔍 [DEPOSIT SCAN] Treasury address: ${treasuryAddress}`);
        console.log(`🔍 [DEPOSIT SCAN] USDC Mint: ${USDC_MINT.toString()}`);

        // Get the treasury's USDC token account address
        const treasuryUsdcAccount = await solanaConnection.getTokenAccountsByOwner(
            treasuryKeypair.publicKey,
            { mint: USDC_MINT }
        );

        if (!treasuryUsdcAccount.value || treasuryUsdcAccount.value.length === 0) {
            console.log('⚠️ [DEPOSIT SCAN] No USDC token account found for treasury');
            return { processedCount: 0, error: 'No USDC token account' };
        }

        const usdcTokenAccount = treasuryUsdcAccount.value[0].pubkey;
        console.log(`🔍 [DEPOSIT SCAN] Treasury USDC token account: ${usdcTokenAccount.toString()}`);

        // Get recent confirmed signatures for the USDC token account (not the owner)
        const signatures = await solanaConnection.getSignaturesForAddress(
            usdcTokenAccount,
            {
                limit: 10 // Check last 10 transactions
            }
        );

        console.log(`📊 [DEPOSIT SCAN] Found ${signatures.length} recent transactions`);

        if (signatures.length === 0) {
            console.log('⚠️ [DEPOSIT SCAN] No recent transactions found for treasury address');
            console.log('💡 [DEPOSIT SCAN] This might mean the treasury address has no recent activity');
            return { processedCount: 0, error: 'No transactions found' };
        }

        // Log some transaction details for debugging
        console.log('📋 [DEPOSIT SCAN] Recent transaction signatures:');
        signatures.slice(0, 3).forEach((sig, index) => {
            console.log(`  ${index + 1}. ${sig.signature} (slot: ${sig.slot}, err: ${sig.err ? 'YES' : 'NO'})`);
        });

        let processedCount = 0;

        // Process transactions one at a time with delays to avoid rate limits
        for (let i = 0; i < Math.min(signatures.length, 5); i++) { // Process max 5 at a time
            const sigInfo = signatures[i];

            // Add delay between requests to avoid rate limits
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
            }
            try {
                // Check if this transaction was already processed
                const existingTransaction = await GameTransaction.findOne({
                    solanaTxHash: sigInfo.signature
                });

                if (existingTransaction) {
                    continue; // Skip already processed transactions
                }

                console.log(`🔍 [DEPOSIT SCAN] Analyzing new transaction: ${sigInfo.signature}`);

                // Add small delay before fetching transaction details
                await new Promise(resolve => setTimeout(resolve, 500));

                // Get transaction details
                const transaction = await solanaConnection.getParsedTransaction(
                    sigInfo.signature,
                    {
                        commitment: 'confirmed',
                        maxSupportedTransactionVersion: 0
                    }
                );

                if (!transaction) {
                    console.log(`❌ [DEPOSIT SCAN] Could not fetch transaction details: ${sigInfo.signature}`);
                    continue;
                }

                // Analyze token balances to find USDC transfers
                if (transaction.meta?.preTokenBalances && transaction.meta?.postTokenBalances) {
                    let usdcTransferred = 0;
                    let senderAddress = null;

                    for (let i = 0; i < transaction.meta.preTokenBalances.length; i++) {
                        const preBalance = transaction.meta.preTokenBalances[i];
                        const postBalance = transaction.meta.postTokenBalances[i];

                        if (preBalance.mint === USDC_MINT.toString()) {
                            const preAmount = preBalance.uiTokenAmount.uiAmount || 0;
                            const postAmount = postBalance.uiTokenAmount.uiAmount || 0;
                            const change = postAmount - preAmount;

                            // Find the sender who lost USDC
                            if (preAmount > postAmount) {
                                senderAddress = preBalance.owner;
                                usdcTransferred = preAmount - postAmount;
                                break;
                            }
                        }
                    }

                    if (usdcTransferred > 0 && senderAddress) {
                        console.log(`💰 [DEPOSIT SCAN] Found USDC deposit: ${usdcTransferred} USDC from ${senderAddress}`);

                        // Check if this sender has a verified account
                        const user = await User.findOne({ solanaAddress: senderAddress });

                        if (user) {
                            console.log(`✅ [DEPOSIT SCAN] Processing auto-deposit for user: ${user.email}`);

                            // Apply 1 cent fee
                            const DEPOSIT_FEE = 0.05;
                            const usdcAfterFee = Math.max(0, usdcTransferred - DEPOSIT_FEE);
                            const gameTokens = usdcAfterFee;

                            // Update user balance
                            const oldBalance = user.gameBalance;
                            user.gameBalance += gameTokens;
                            await user.save();

                            // Create transaction record
                            const dbTransaction = new GameTransaction({
                                userId: user._id,
                                type: 'deposit',
                                amount: gameTokens,
                                solAmount: usdcTransferred,
                                tokenAmount: gameTokens,
                                solanaTxHash: sigInfo.signature,
                                fromAddress: senderAddress,
                                toAddress: treasuryAddress,
                                status: 'completed'
                            });
                            await dbTransaction.save();

                            console.log(`🎉 [DEPOSIT SCAN] Auto-processed deposit: ${usdcTransferred} USDC → ${gameTokens} tokens for ${user.email}`);
                            processedCount++;
                        } else {
                            console.log(`❌ [DEPOSIT SCAN] No verified user found for address: ${senderAddress}`);
                        }
                    }
                }

            } catch (error) {
                console.error(`❌ [DEPOSIT SCAN] Error processing transaction ${sigInfo.signature}:`, error.message);
            }
        }

        console.log(`✅ [DEPOSIT SCAN] Scan complete. Processed ${processedCount} new deposits.`);

        return { processedCount, success: true };

    } catch (error) {
        console.error('❌ [DEPOSIT SCAN] Blockchain scan error:', error);
        return { processedCount: 0, error: error.message };
    }
}

// Debug endpoint to check treasury status
app.get('/api/debug/treasury', (req, res) => {
    const status = {
        treasuryLoaded: treasuryKeypair !== null,
        treasuryAddress: treasuryKeypair ? treasuryKeypair.publicKey.toString() : null,
        usdcMint: USDC_MINT.toString(),
        serverTime: new Date().toISOString()
    };
    console.log('🔧 [DEBUG] Treasury status:', status);
    res.json(status);
});

// Test credit endpoint (no auth for testing)
app.post('/api/test/credit-deposit', async (req, res) => {
    try {
        const walletAddress = 'Eya7P6FAqibqRFA9weBkNX1DRWVyv89XeQxDuWwEu3Ex';
        const amount = 10;
        const transactionSignature = '4dQMHT2qPVsbSqd2cwHcAHYXMg5g7phKcCkJ2dZJZuUYYkq83FhveW4tSwa4rL2dwsecpDZ7946VYza2GYMcBmsC';

        console.log(`💰 [TEST CREDIT] Crediting ${amount} USDC for wallet: ${walletAddress}`);

        // Check if user exists, create if not
        let user = await User.findOne({ solanaAddress: walletAddress });

        if (!user) {
            console.log(`🆕 [TEST CREDIT] Creating new user for wallet: ${walletAddress}`);
            user = new User({
                googleId: `test_${Date.now()}`,
                email: `test_wallet_${walletAddress.slice(0, 8)}@betbetter.test`,
                name: `Test User ${walletAddress.slice(0, 8)}`,
                solanaAddress: walletAddress,
                gameBalance: 0
            });
            await user.save();
        }

        // Apply 1 cent fee
        const DEPOSIT_FEE = 0.05;
        const usdcAfterFee = Math.max(0, amount - DEPOSIT_FEE);
        const gameTokens = usdcAfterFee;

        // Update user balance
        const oldBalance = user.gameBalance;
        user.gameBalance += gameTokens;
        await user.save();

        // Create transaction record
        const dbTransaction = new GameTransaction({
            userId: user._id,
            type: 'deposit',
            amount: gameTokens,
            solAmount: amount,
            tokenAmount: gameTokens,
            solanaTxHash: transactionSignature,
            fromAddress: walletAddress,
            toAddress: treasuryKeypair.publicKey.toString(),
            status: 'completed'
        });
        await dbTransaction.save();

        console.log(`✅ [TEST CREDIT] Credited ${gameTokens} tokens to user ${user.email} (${oldBalance} → ${user.gameBalance})`);

        res.json({
            success: true,
            message: `Credited ${gameTokens} tokens to ${user.email}`,
            userId: user._id,
            oldBalance,
            newBalance: user.gameBalance,
            tokensCredited: gameTokens,
            walletAddress,
            transactionSignature
        });

    } catch (error) {
        console.error('Test credit error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Manual credit endpoint for found deposits (temporary - no auth for testing)
app.post('/api/admin/credit-deposit', async (req, res) => {
    try {
        const { walletAddress, amount, transactionSignature } = req.body;

        if (!walletAddress || !amount || amount <= 0) {
            return res.status(400).json({ error: 'Wallet address and amount required' });
        }

        console.log(`💰 [MANUAL CREDIT] Crediting ${amount} USDC for wallet: ${walletAddress}`);

        // Check if user exists, create if not
        let user = await User.findOne({ solanaAddress: walletAddress });

        if (!user) {
            console.log(`🆕 [MANUAL CREDIT] Creating new user for wallet: ${walletAddress}`);
            user = new User({
                googleId: `manual_${Date.now()}`, // Temporary ID
                email: `wallet_${walletAddress.slice(0, 8)}@temp.betbetter`,
                name: `Wallet User ${walletAddress.slice(0, 8)}`,
                solanaAddress: walletAddress,
                gameBalance: 0
            });
            await user.save();
        }

        // Apply 1 cent fee
        const DEPOSIT_FEE = 0.05;
        const usdcAfterFee = Math.max(0, amount - DEPOSIT_FEE);
        const gameTokens = usdcAfterFee;

        // Update user balance
        const oldBalance = user.gameBalance;
        user.gameBalance += gameTokens;
        await user.save();

        // Create transaction record
        const dbTransaction = new GameTransaction({
            userId: user._id,
            type: 'deposit',
            amount: gameTokens,
            solAmount: amount,
            tokenAmount: gameTokens,
            solanaTxHash: transactionSignature || 'manual_credit',
            fromAddress: walletAddress,
            toAddress: treasuryKeypair.publicKey.toString(),
            status: 'completed'
        });
        await dbTransaction.save();

        console.log(`✅ [MANUAL CREDIT] Credited ${gameTokens} tokens to user ${user.email} (${oldBalance} → ${user.gameBalance})`);

        res.json({
            success: true,
            message: `Credited ${gameTokens} tokens to ${user.email}`,
            userId: user._id,
            oldBalance,
            newBalance: user.gameBalance,
            tokensCredited: gameTokens
        });

    } catch (error) {
        console.error('Manual credit error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Debug endpoint to test transaction analysis
app.post('/api/debug/analyze-transaction', async (req, res) => {
    try {
        const { signature } = req.body;

        if (!signature) {
            return res.status(400).json({ error: 'Transaction signature required' });
        }

        console.log(`🔍 [DEBUG] Analyzing transaction: ${signature}`);

        // Get transaction details
        const transaction = await solanaConnection.getParsedTransaction(
            signature,
            {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
            }
        );

        if (!transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        const analysis = {
            signature,
            slot: transaction.slot,
            success: !transaction.meta?.err,
            fee: transaction.meta?.fee,
            hasTokenBalances: !!(transaction.meta?.preTokenBalances && transaction.meta?.postTokenBalances)
        };

        if (analysis.hasTokenBalances) {
            analysis.tokenChanges = [];
            for (let i = 0; i < transaction.meta.preTokenBalances.length; i++) {
                const preBalance = transaction.meta.preTokenBalances[i];
                const postBalance = transaction.meta.postTokenBalances[i];

                if (preBalance.mint === USDC_MINT.toString()) {
                    const preAmount = preBalance.uiTokenAmount.uiAmount || 0;
                    const postAmount = postBalance.uiTokenAmount.uiAmount || 0;
                    const change = postAmount - preAmount;

                    analysis.tokenChanges.push({
                        owner: preBalance.owner,
                        change,
                        isDeposit: change > 0,
                        amount: Math.abs(change)
                    });
                }
            }
        }

        console.log(`✅ [DEBUG] Transaction analysis:`, analysis);
        res.json(analysis);

    } catch (error) {
        console.error('Debug transaction analysis error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Manual deposit endpoint (for fallback)
app.post('/api/deposit', authenticateToken, async (req, res) => {
    try {
        const { transactionSignature, autoUpdate } = req.body;
        console.log(`🔍 [DEPOSIT] Starting deposit for user ${req.user.userId}`);

        const user = await User.findById(req.user.userId);
        if (!user) {
            console.log(`❌ [DEPOSIT] User not found: ${req.user.userId}`);
            return res.status(404).json({ error: 'User not found' });
        }

        // If user has verified wallet and requests auto-update, reconcile balance
        if (autoUpdate && user.solanaAddress) {
            console.log(`🔄 [DEPOSIT] Auto-updating balance for verified user ${user.email}`);

            const calculatedBalance = await calculateBalanceFromHistory(req.user.userId);
            const previousBalance = user.gameBalance;

            user.gameBalance = calculatedBalance;
            await user.save();

            console.log(`✅ [AUTO_DEPOSIT] Balance updated: ${previousBalance} → ${calculatedBalance}`);

            return res.json({
                message: 'Balance automatically updated from transaction history',
                gameTokensAdded: calculatedBalance - previousBalance,
                newGameBalance: calculatedBalance,
                autoUpdated: true,
                walletVerified: true
            });
        }

        // Manual verification required for new users or when autoUpdate is false
        if (!transactionSignature) {
            console.log(`❌ [DEPOSIT] Missing transaction signature`);
            return res.status(400).json({ error: 'Transaction signature required' });
        }

        console.log(`👤 [DEPOSIT] Processing manual deposit for user: ${user.email}, current balance: ${user.gameBalance}`);

        // Check if transaction was already processed
        const existingTransaction = await GameTransaction.findOne({ solanaTxHash: transactionSignature });
        if (existingTransaction) {
            console.log(`❌ [DEPOSIT] Transaction already processed: ${transactionSignature}`);
            return res.status(400).json({ error: 'This transaction has already been processed' });
        }
        console.log(`✅ [DEPOSIT] Transaction signature is unique: ${transactionSignature}`);

        // Verify the transaction on Solana
        console.log(`🔍 [DEPOSIT] Verifying transaction on Solana: ${transactionSignature}`);

        // Get transaction details from Solana
        const transaction = await solanaConnection.getParsedTransaction(transactionSignature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
        });

        if (!transaction) {
            console.log(`❌ [DEPOSIT] Transaction not found on Solana: ${transactionSignature}`);
            return res.status(400).json({ error: 'Transaction not found on Solana' });
        }
        console.log(`✅ [DEPOSIT] Transaction found on Solana`);

        // Verify transaction details
        const { meta, transaction: txData } = transaction;
        console.log(`🔍 [DEPOSIT] Transaction meta:`, {
            err: meta.err,
            fee: meta.fee,
            preBalances: meta.preBalances?.length,
            postBalances: meta.postBalances?.length,
            preTokenBalances: meta.preTokenBalances?.length,
            postTokenBalances: meta.postTokenBalances?.length
        });

        // Check if transaction was successful
        if (meta.err) {
            console.log(`❌ [DEPOSIT] Transaction failed on Solana:`, meta.err);
            return res.status(400).json({ error: 'Transaction failed on Solana' });
        }
        console.log(`✅ [DEPOSIT] Transaction successful on Solana`);

        // Check if user sent to treasury
        const accountKeys = txData.message.accountKeys;
        const treasuryAddress = treasuryKeypair.publicKey.toString();

        // Find USDC transfers in the transaction
        let usdcTransferred = 0;
        let senderAddress = null;

        console.log(`🔍 [DEPOSIT] Analyzing token balances for USDC mint: ${USDC_MINT.toString()}`);

        if (meta.preTokenBalances && meta.postTokenBalances) {
            console.log(`📊 [DEPOSIT] Token balance changes:`);
            for (let i = 0; i < meta.preTokenBalances.length; i++) {
                const preBalance = meta.preTokenBalances[i];
                const postBalance = meta.postTokenBalances[i];

                if (preBalance.mint === USDC_MINT.toString()) {
                    const preAmount = preBalance.uiTokenAmount.uiAmount || 0;
                    const postAmount = postBalance.uiTokenAmount.uiAmount || 0;
                    const change = postAmount - preAmount;

                    console.log(`   ${preBalance.owner}: ${preAmount} → ${postAmount} (${change > 0 ? '+' : ''}${change})`);

                    // Find the sender who lost USDC
                    if (preAmount > postAmount) {
                        senderAddress = preBalance.owner;
                        usdcTransferred = preAmount - postAmount;
                    }
                }
            }
        }

        console.log(`💰 [DEPOSIT] USDC transferred: ${usdcTransferred}, sender: ${senderAddress}`);

        if (usdcTransferred <= 0) {
            console.log(`❌ [DEPOSIT] No USDC transfer found in this transaction`);
            return res.status(400).json({ error: 'No USDC transfer found in this transaction' });
        }

        if (!senderAddress) {
            console.log(`❌ [DEPOSIT] Could not identify sender address`);
            return res.status(400).json({ error: 'Could not identify sender address' });
        }

        // Verify sender address
        if (user.solanaAddress) {
            // User has a verified address - must match
            console.log(`🔍 [DEPOSIT] Verifying sender address: ${senderAddress} vs stored: ${user.solanaAddress}`);
            if (user.solanaAddress !== senderAddress) {
                console.log(`❌ [DEPOSIT] Address mismatch! Transaction sender does not match verified wallet`);
                return res.status(400).json({ error: 'Transaction sender does not match your verified wallet address' });
            }
            console.log(`✅ [DEPOSIT] Address verified - matches stored wallet`);
        } else {
            // First deposit - store the sender address
            user.solanaAddress = senderAddress;
            console.log(`🆕 [DEPOSIT] First deposit - setting verified wallet address for user ${user.email}: ${senderAddress}`);
        }

        // Apply 5 cent (0.05 USDC) fee for transaction costs
        const DEPOSIT_FEE = 0.05;
        const usdcAfterFee = Math.max(0, usdcTransferred - DEPOSIT_FEE);
        const feeAmount = usdcTransferred - usdcAfterFee;
        console.log(`💰 [DEPOSIT] Fee calculation: ${usdcTransferred} USDC - ${DEPOSIT_FEE} fee = ${usdcAfterFee} USDC usable`);

        // Calculate game tokens from USDC after fee (1 USDC = 1 token - 1:1 ratio)
        const gameTokens = usdcAfterFee;
        console.log(`🧮 [DEPOSIT] Calculation: ${usdcAfterFee} USDC = ${gameTokens} tokens`);

        // Update database
        const oldBalance = user.gameBalance;
        user.gameBalance += gameTokens;
        await user.save();
        console.log(`💾 [DEPOSIT] Updated user balance: ${oldBalance} → ${user.gameBalance}`);

        // Create transaction record
        console.log(`📝 [DEPOSIT] Creating transaction record...`);
        const dbTransaction = new GameTransaction({
            userId: user._id,
            type: 'deposit',
            amount: gameTokens,
            solAmount: usdcTransferred,
            tokenAmount: gameTokens,
            solanaTxHash: transactionSignature,
            fromAddress: senderAddress,
            toAddress: treasuryAddress,
            status: 'completed'
        });
        await dbTransaction.save();
        console.log(`✅ [DEPOSIT] Transaction record saved with ID: ${dbTransaction._id}`);

        console.log(`🎉 [DEPOSIT] SUCCESS: ${usdcTransferred} USDC from ${senderAddress} → ${gameTokens} tokens (${transactionSignature})`);

        const response = {
            message: user.solanaAddress === senderAddress ? 'Deposit successful' : 'First deposit successful! Your wallet address has been verified.',
            gameTokensAdded: gameTokens,
            newGameBalance: user.gameBalance,
            transactionSignature: transactionSignature,
            usdcReceived: usdcTransferred,
            usdcAfterFee: usdcAfterFee,
            feeDeducted: feeAmount,
            walletVerified: !user.solanaAddress
        };

        console.log(`📤 [DEPOSIT] Sending response:`, response);
        res.json(response);

    } catch (error) {
        console.error('Deposit error:', error);
        res.status(500).json({ error: error.message || 'Deposit failed' });
    }
});

// Get transaction history
app.get('/api/transactions', authenticateToken, async (req, res) => {
    try {
        const transactions = await GameTransaction.find({ userId: req.user.userId })
            .sort({ timestamp: -1 })
            .limit(20);

        const formattedTransactions = transactions.map(tx => ({
            id: tx._id,
            type: tx.type,
            amount: tx.amount,
            solAmount: tx.solAmount,
            tokenAmount: tx.tokenAmount,
            timestamp: tx.timestamp,
            status: tx.status
        }));

        res.json(formattedTransactions);

    } catch (error) {
        console.error('Transaction fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
});

// Get user statistics from transaction history
app.get('/api/user/stats', authenticateToken, async (req, res) => {
    try {
        const transactions = await GameTransaction.find({
            userId: req.user.userId,
            type: { $in: ['bet_win', 'bet_loss'] }
        });

        let gamesPlayed = 0;
        let wins = 0;

        transactions.forEach(tx => {
            gamesPlayed++;
            if (tx.type === 'bet_win') {
                wins++;
            }
        });

        const winRate = gamesPlayed > 0 ? (wins / gamesPlayed * 100) : 0;

        res.json({
            gamesPlayed,
            wins,
            winRate: parseFloat(winRate.toFixed(2)),
            totalTransactions: transactions.length
        });

    } catch (error) {
        console.error('Stats fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

// Calculate balance from verified transaction history
async function calculateBalanceFromHistory(userId) {
    try {
        const transactions = await GameTransaction.find({
            userId: userId,
            status: 'completed'
        }).sort({ timestamp: 1 }); // Sort by timestamp to process in order

        let calculatedBalance = 0;

        for (const tx of transactions) {
            switch (tx.type) {
                case 'deposit':
                    // Deposits add tokens
                    calculatedBalance += tx.tokenAmount || 0;
                    console.log(`[BALANCE_CALC] +${tx.tokenAmount} from deposit: ${calculatedBalance}`);
                    break;
                case 'withdraw':
                    // Withdrawals subtract tokens
                    calculatedBalance -= tx.tokenAmount || 0;
                    console.log(`[BALANCE_CALC] -${tx.tokenAmount} from withdrawal: ${calculatedBalance}`);
                    break;
                case 'bet_win':
                    // Wins add tokens
                    calculatedBalance += tx.tokenAmount || 0;
                    console.log(`[BALANCE_CALC] +${tx.tokenAmount} from win: ${calculatedBalance}`);
                    break;
                case 'bet_loss':
                    // Losses subtract tokens
                    calculatedBalance -= tx.tokenAmount || 0;
                    console.log(`[BALANCE_CALC] -${tx.tokenAmount} from loss: ${calculatedBalance}`);
                    break;
            }
        }

        console.log(`[BALANCE_CALC] Final calculated balance for user ${userId}: ${calculatedBalance}`);
        return calculatedBalance;

    } catch (error) {
        console.error('Error calculating balance from history:', error);
        return 0;
    }
}

// Reconcile user balance with transaction history
app.post('/api/user/reconcile-balance', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Only reconcile if user has a verified wallet
        if (!user.solanaAddress) {
            return res.status(400).json({ error: 'No verified wallet address found' });
        }

        const calculatedBalance = await calculateBalanceFromHistory(req.user.userId);
        const previousBalance = user.gameBalance;

        // Update user balance to match calculated amount
        user.gameBalance = calculatedBalance;
        await user.save();

        console.log(`[BALANCE_RECONCILE] User ${req.user.userId}: ${previousBalance} → ${calculatedBalance}`);

        res.json({
            previousBalance,
            newBalance: calculatedBalance,
            reconciled: true
        });

    } catch (error) {
        console.error('Balance reconciliation error:', error);
        res.status(500).json({ error: 'Balance reconciliation failed' });
    }
});

// Secure server-side betting endpoint
app.post('/api/game/place-bet', authenticateToken, async (req, res) => {
    try {
        const { betAmount } = req.body;

        console.log(`🎲 [SERVER_BET] User ${req.user.userId} placing bet: ${betAmount}`);

        // Validate bet amount
        if (!betAmount || typeof betAmount !== 'number' || betAmount <= 0 || betAmount > 1000000) {
            console.log(`❌ [SERVER_BET] Invalid bet amount: ${betAmount}`);
            return res.status(400).json({ error: 'Invalid bet amount. Must be between 0.01 and 1,000,000' });
        }

        // Validate bet amount precision (max 2 decimal places)
        if (betAmount !== Math.round(betAmount * 100) / 100) {
            console.log(`❌ [SERVER_BET] Invalid bet precision: ${betAmount}`);
            return res.status(400).json({ error: 'Bet amount can have at most 2 decimal places' });
        }

        const user = await User.findById(req.user.userId);
        if (!user) {
            console.log(`❌ [SERVER_BET] User not found: ${req.user.userId}`);
            return res.status(404).json({ error: 'User not found' });
        }

        // Check if user has enough balance
        if (user.gameBalance < betAmount) {
            console.log(`❌ [SERVER_BET] Insufficient balance: ${user.gameBalance} < ${betAmount}`);
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        // Rate limiting: Check recent bets to prevent spam
        const recentBets = await GameTransaction.find({
            userId: req.user.userId,
            type: { $in: ['bet_win', 'bet_loss'] },
            timestamp: { $gte: new Date(Date.now() - 1000) } // Last second
        });

        if (recentBets.length >= 5) {
            console.log(`❌ [SERVER_BET] Rate limit exceeded for user ${req.user.userId}`);
            return res.status(429).json({ error: 'Too many bets. Please wait a moment.' });
        }

        // Generate cryptographically secure random outcome
        // Use 50.001% USER advantage (player wins if random < 0.50001)
        const randomBytes = crypto.randomBytes(4);
        const randomNumber = randomBytes.readUInt32LE(0) / 0xFFFFFFFF; // Convert to 0-1 range

        console.log(`🎲 [SERVER_BET] Generated random number: ${randomNumber}`);

        // Player wins if random < 0.50001 (50.001% chance to win - user advantage)
        const playerWins = randomNumber < 0.50001;

        console.log(`🎲 [SERVER_BET] Player ${playerWins ? 'WINS' : 'LOSES'} (threshold: 0.50001)`);

        // Calculate net amount
        const netAmount = playerWins ? betAmount : -betAmount;

        // Update user balance
        const oldBalance = user.gameBalance;
        user.gameBalance += netAmount;
        await user.save();

        console.log(`💰 [SERVER_BET] Balance update: ${oldBalance} → ${user.gameBalance}`);

        // Create transaction record
        const transaction = new GameTransaction({
            userId: user._id,
            type: playerWins ? 'bet_win' : 'bet_loss',
            amount: betAmount,
            tokenAmount: betAmount,
            status: 'completed'
        });
        await transaction.save();

        console.log(`✅ [SERVER_BET] Bet completed. User ${playerWins ? 'won' : 'lost'} ${betAmount} tokens`);

        // Return result to client with full transparency data
        res.json({
            success: true,
            playerWins,
            betAmount,
            netAmount,
            newBalance: user.gameBalance,
            randomNumber, // Cryptographically secure random number (0-1)
            winThreshold: 0.50001, // User advantage threshold
            userAdvantage: 0.00001, // 0.001% user advantage
            transactionId: transaction._id,
            timestamp: new Date().toISOString(),
            serverVersion: 'secure-v1' // For version tracking
        });

    } catch (error) {
        console.error('Server betting error:', error);
        res.status(500).json({ error: 'Betting failed' });
    }
});

// Legacy balance update endpoint (for backward compatibility)
app.post('/api/game/update-balance', authenticateToken, async (req, res) => {
    try {
        const { amount, type } = req.body; // amount can be positive (win) or negative (loss)

        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Check if user has enough balance for bet loss
        if (amount < 0 && user.gameBalance < Math.abs(amount)) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        user.gameBalance += amount;
        await user.save();

        // Create transaction record
        const transaction = new GameTransaction({
            userId: user._id,
            type: type === 'win' ? 'bet_win' : 'bet_loss',
            amount: Math.abs(amount),
            tokenAmount: Math.abs(amount),
            status: 'completed'
        });
        await transaction.save();

        res.json({
            newBalance: user.gameBalance,
            transactionId: transaction._id
        });

    } catch (error) {
        console.error('Balance update error:', error);
        res.status(500).json({ error: 'Balance update failed' });
    }
});



// Get betting configuration (for transparency)
app.get('/api/game/config', (req, res) => {
    res.json({
        winThreshold: 0.50001, // 50.001% chance to win
        userAdvantage: 0.00001, // 0.001% user advantage
        maxBetAmount: 1000000,
        minBetAmount: 0.01,
        serverVersion: 'secure-v1',
        randomness: 'cryptographically_secure',
        rateLimitPerSecond: 5,
        description: 'Server-side secure betting with slight user advantage'
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`MongoDB: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
});