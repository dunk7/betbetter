// Solana Manager - Secure wallet verification system
class SolanaManager {
    constructor() {
        this.connection = null;
        this.gameBalance = 0; // Will be loaded from backend
        this.apiBase = 'http://localhost:5000/api';
        this.treasuryAddress = null;
        this.userWalletAddress = null; // User's verified wallet address
        this.init();
    }

    init() {
        // Initialize Solana connection
        // Check if solanaWeb3 is available (CDN version) or use solana (alternative)
        const SolanaWeb3 = window.solanaWeb3 || window.solana;
        if (!SolanaWeb3) {
            console.error('❌ Solana Web3 library not loaded');
            return;
        }

        this.connection = new SolanaWeb3.Connection(
            SolanaWeb3.clusterApiUrl('mainnet-beta'),
            'confirmed'
        );

        // Setup UI event listeners
        this.setupEventListeners();

        // Load treasury address
        this.loadTreasuryAddress();
    }

    setupEventListeners() {
        const depositBtn = document.getElementById('deposit-btn');
        const withdrawBtn = document.getElementById('withdraw-btn');
        const copyTreasuryBtn = document.getElementById('copy-treasury-address-btn');
        const verifyDepositBtn = document.getElementById('verify-deposit-btn');

        if (depositBtn) {
            depositBtn.addEventListener('click', () => this.showDepositInstructions());
        }

        if (withdrawBtn) {
            withdrawBtn.addEventListener('click', () => this.handleWithdraw());
        }

        if (copyTreasuryBtn) {
            copyTreasuryBtn.addEventListener('click', () => this.copyTreasuryAddress());
        }

        if (verifyDepositBtn) {
            verifyDepositBtn.addEventListener('click', () => this.verifyDeposit());
        }
    }

    async loadTreasuryAddress() {
        try {
            const response = await fetch(`${this.apiBase}/treasury-address`);

            if (response.ok) {
                const data = await response.json();
                this.treasuryAddress = data.treasuryAddress;
                this.updateTreasuryAddressUI();
            }
        } catch (error) {
            console.error('Failed to load treasury address:', error);
        }
    }

    async copyTreasuryAddress() {
        if (!this.treasuryAddress) {
            this.showError('Treasury address not loaded yet.');
            return;
        }

        try {
            await navigator.clipboard.writeText(this.treasuryAddress);
            this.showSuccess('Treasury address copied to clipboard!');
        } catch (error) {
            console.error('Copy error:', error);
            this.showError('Failed to copy treasury address.');
        }
    }

    showDepositInstructions() {
        if (!this.treasuryAddress) {
            this.showError('Treasury address not loaded yet. Please try again.');
            return;
        }

        // Check if user has verified wallet
        const hasVerifiedWallet = this.userWalletAddress !== null;

        // Show deposit verification UI
        const verificationDiv = document.querySelector('.deposit-verification');
        if (verificationDiv) {
            verificationDiv.style.display = verificationDiv.style.display === 'none' ? 'block' : 'none';
        }

        let instructions;
        if (hasVerifiedWallet) {
            // Instructions for verified users
            instructions = `
🔄 AUTOMATIC DEPOSIT DETECTION 🔄

Your wallet is already verified! The system automatically scans the blockchain for your deposits.

📋 How it works:
1. Send USDC from your verified wallet to: ${this.treasuryAddress}
2. The system automatically detects your transaction (every 30 seconds)
3. Your tokens are credited instantly - no manual action needed!
4. Click "Auto Update Balance" anytime to force an immediate scan

🎯 Benefits:
• ⚡ Instant automatic processing
• 🔒 Blockchain-verified security
• 📊 Real-time balance updates
• 💰 No more waiting or manual verification

⚠️  Important:
• Send from your verified wallet address: ${this.userWalletAddress.slice(0, 8)}...${this.userWalletAddress.slice(-8)}
• 1¢ fee still applies for transaction costs
• Minimum deposit: 0.02 USDC
• Use any Solana wallet (Phantom, Solflare, etc.)

💡 The blockchain scanner runs continuously - your deposits are processed automatically!
            `;
        } else {
            // Instructions for new users
            instructions = `
🛡️ FIRST DEPOSIT - WALLET VERIFICATION 🛡️

To deposit USDC and get game tokens:

1. Copy the treasury address: ${this.treasuryAddress}
2. Send USDC from your wallet to this address
3. Use any Solana wallet (Phantom, Solflare, etc.)
4. Exchange Rate: 1 USDC = 1 token (minus 1¢ fee)

🔐 Security Features:
• Your wallet address will be verified and stored
• Future deposits use automatic updates (no more signatures!)
• Transaction signatures prevent double-processing
• Only you can withdraw to your verified address

⚠️  Important:
• Send USDC (not SOL or other tokens)
• Minimum deposit: 0.02 USDC (0.01 tokens after 1¢ fee)
• A 1¢ (0.01 USDC) fee is deducted for transaction costs
• After sending, paste the transaction signature below
• Processing may take a few seconds

💡 Tip: You can use https://solscan.io to verify your transaction

🚀 After first deposit, you'll never need to verify signatures again!
            `;
        }

        alert(instructions);
    }

    async verifyDeposit() {
        const signatureInput = document.getElementById('deposit-signature');
        const signature = signatureInput?.value?.trim();

        console.log(`🔍 [FRONTEND] Starting deposit verification`);

        if (!window.authManager?.token) {
            console.log(`❌ [FRONTEND] No auth token available`);
            this.showError('Please login first.');
            return;
        }

        // Check if user has verified wallet for auto-update
        const hasVerifiedWallet = this.userWalletAddress !== null;
        console.log(`🔍 [FRONTEND] User has verified wallet: ${hasVerifiedWallet}`);

        try {
            let requestBody;
            let statusMessage;

            if (hasVerifiedWallet && !signature) {
                // Force manual blockchain scan for verified users
                console.log(`🔍 [FRONTEND] Triggering manual blockchain scan`);
                this.updateScanStatus('scanning');
                this.showInfo('Scanning blockchain for new deposits...');

                // Trigger manual scan
                const scanResponse = await fetch(`${this.apiBase}/admin/trigger-deposit-scan`, {
                    method: 'POST'
                });

                if (scanResponse.ok) {
                    console.log(`✅ [FRONTEND] Manual scan completed`);
                    // Now do auto-update to get latest balance
                    requestBody = { autoUpdate: true };
                    statusMessage = 'Updating balance from latest scan...';
                } else {
                    throw new Error('Blockchain scan failed');
                }
            } else if (hasVerifiedWallet) {
                // Auto-update for verified users with signature
                console.log(`🔄 [FRONTEND] Using auto-update for verified user`);
                requestBody = { autoUpdate: true };
                statusMessage = 'Automatically updating balance from transaction history...';
            } else {
                // Manual verification for new users
                if (!signature) {
                    console.log(`❌ [FRONTEND] No transaction signature provided`);
                    this.showError('Please enter the transaction signature from your USDC transfer.');
                    return;
                }
                console.log(`📤 [FRONTEND] Using manual verification with signature: ${signature}`);
                requestBody = { transactionSignature: signature };
                statusMessage = 'Verifying deposit transaction...';
            }

            console.log(`📤 [FRONTEND] Sending deposit request...`);
            this.showInfo(statusMessage);

            const response = await fetch(`${this.apiBase}/deposit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.authManager.token}`
                },
                body: JSON.stringify(requestBody)
            });

            console.log(`📥 [FRONTEND] Deposit API response status: ${response.status}`);

            const data = await response.json();
            console.log(`📥 [FRONTEND] Deposit API response data:`, data);

            if (!response.ok) {
                console.log(`❌ [FRONTEND] Deposit API error:`, data.error);
                throw new Error(data.error || 'Deposit verification failed');
            }
            console.log(`✅ [FRONTEND] Deposit API success`);

            // Update local balances
            this.gameBalance = data.newGameBalance;

            // Update game balance
            if (window.gameInstance) {
                window.gameInstance.tokens = this.gameBalance;
                window.gameInstance.updateDisplay();
            }

            // Handle different response types
            if (data.autoUpdated) {
                // Auto-update success
                this.showSuccess(`✅ Balance automatically updated! You now have ${data.newGameBalance} tokens.`);
                this.updateScanStatus('found');
                if (data.gameTokensAdded !== 0) {
                    setTimeout(() => {
                        const sign = data.gameTokensAdded > 0 ? '+' : '';
                        this.showSuccess(`${sign}${data.gameTokensAdded} tokens from recent transactions.`);
                    }, 1500);
                }
            } else if (data.walletVerified) {
                // First deposit success
                this.showSuccess(`🎉 First deposit successful! Your wallet address has been verified and stored securely.`);
                this.updateScanStatus('found');
                setTimeout(() => {
                    this.showSuccess(`Successfully deposited ${data.usdcReceived} USDC (${data.feeDeducted}¢ fee deducted) → ${data.usdcAfterFee} USDC = ${data.gameTokensAdded} tokens!`);
                }, 2000);
            } else {
                // Regular deposit success
                this.showSuccess(`Successfully deposited ${data.usdcReceived} USDC (${data.feeDeducted}¢ fee deducted) → ${data.usdcAfterFee} USDC = ${data.gameTokensAdded} tokens!`);
            }

            // Update UI
            this.updateWalletUI();
            this.loadTransactionHistory();

            // Clear input if it exists
            if (signatureInput) signatureInput.value = '';

            // Refresh user data to get updated wallet address
            this.loadUserData();

        } catch (error) {
            console.error('Deposit verification error:', error);
            this.showError(error.message || 'Deposit verification failed. Please try again.');
        }
    }

    updateTreasuryAddressUI() {
        const treasuryDisplay = document.getElementById('treasury-address-display');
        if (treasuryDisplay && this.treasuryAddress) {
            treasuryDisplay.textContent = `${this.treasuryAddress.slice(0, 8)}...${this.treasuryAddress.slice(-8)}`;
        }
    }

    updateWalletVerificationUI() {
        const walletStatus = document.getElementById('wallet-status');
        const verifiedAddress = document.getElementById('verified-address');

        if (this.userWalletAddress) {
            // User has verified wallet
            if (walletStatus) walletStatus.style.display = 'block';
            if (verifiedAddress) {
                verifiedAddress.textContent = `${this.userWalletAddress.slice(0, 8)}...${this.userWalletAddress.slice(-8)}`;
            }
        } else {
            // No verified wallet yet
            if (walletStatus) walletStatus.style.display = 'none';
        }
    }

    async loadTreasuryBalance() {
        if (!window.authManager?.token) return;

        try {
            const response = await fetch(`${this.apiBase}/treasury-balance`, {
                headers: {
                    'Authorization': `Bearer ${window.authManager.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                const treasuryBalanceElement = document.getElementById('treasuryBalance');
                if (treasuryBalanceElement) {
                    treasuryBalanceElement.textContent = data.formattedBalance;
                }
            } else {
                console.log('Treasury balance not available');
                const treasuryBalanceElement = document.getElementById('treasuryBalance');
                if (treasuryBalanceElement) {
                    treasuryBalanceElement.textContent = 'N/A';
                }
            }
        } catch (error) {
            console.error('Error loading treasury balance:', error);
            const treasuryBalanceElement = document.getElementById('treasuryBalance');
            if (treasuryBalanceElement) {
                treasuryBalanceElement.textContent = 'N/A';
            }
        }
    }

    // Update scan status text to show different states
    updateScanStatus(status) {
        const scanText = document.querySelector('.scan-text');
        const scanDot = document.querySelector('.scan-dot');

        if (scanText && scanDot) {
            switch (status) {
                case 'scanning':
                    scanText.textContent = 'Scanning blockchain for deposits...';
                    scanDot.textContent = '🔍';
                    break;
                case 'found':
                    scanText.textContent = 'New deposits detected and processed!';
                    scanDot.textContent = '✅';
                    setTimeout(() => this.updateScanStatus('active'), 3000);
                    break;
                case 'active':
                default:
                    scanText.textContent = 'Auto-scanning blockchain for deposits...';
                    scanDot.textContent = '🔍';
                    break;
            }
        }
    }

    updateWalletUI() {
        console.log(`🔄 [WALLET UI] Updating balances - Game: ${this.gameBalance}`);

        // Update token balance display with proper precision handling
        const tokenBalance = document.getElementById('tokenBalance');
        if (tokenBalance) {
            const fixedBalance = Math.round(this.gameBalance * 100000000) / 100000000; // 8 decimal precision
            // Format for display (avoid unnecessary decimals)
            if (fixedBalance % 1 === 0) {
                tokenBalance.textContent = fixedBalance.toString();
            } else {
                tokenBalance.textContent = fixedBalance.toFixed(Math.min(4, (fixedBalance.toString().split('.')[1] || '').length));
            }
            console.log(`✅ [TOKEN BALANCE] Updated to: ${tokenBalance.textContent}`);
        }

        // Load treasury balance
        this.loadTreasuryBalance();

        // Update wallet status
        const walletStatus = document.getElementById('walletStatus');
        if (walletStatus) {
            if (this.userWalletAddress) {
                walletStatus.textContent = `Wallet: ${this.userWalletAddress.slice(0, 8)}...${this.userWalletAddress.slice(-8)}`;
                walletStatus.style.color = '#00ff88';
            } else {
                walletStatus.textContent = 'No wallet verified';
                walletStatus.style.color = '#ff6b6b';
            }
        }

        // Show wallet section if user is logged in
        const walletSection = document.getElementById('wallet-section');
        const transactionHistory = document.getElementById('transaction-history');
        const depositBtn = document.getElementById('deposit-btn');
        const verifyBtn = document.getElementById('verify-deposit-btn');
        const signatureInput = document.getElementById('deposit-signature');
        const autoScanStatus = document.getElementById('auto-scan-status');

        if (walletSection && window.authManager?.isAuthenticated) {
            walletSection.style.display = 'block';
            if (transactionHistory) transactionHistory.style.display = 'block';

            // Update wallet verification status
            this.updateWalletVerificationUI();

            // Update deposit UI based on verification status
            if (depositBtn && verifyBtn) {
                if (this.userWalletAddress) {
                    // Verified user - show automatic deposit detection
                    depositBtn.textContent = '🔍 Auto-Detect Deposits';
                    verifyBtn.textContent = '🔄 Force Balance Update';
                    if (signatureInput) {
                        signatureInput.style.display = 'none';
                        signatureInput.placeholder = 'Blockchain scanning active - deposits detected automatically!';
                    }
                    // Show auto-scan status for verified users
                    if (autoScanStatus) {
                        autoScanStatus.style.display = 'block';
                    }
                } else {
                    // New user - show manual verification
                    depositBtn.textContent = '📥 Deposit USDC';
                    verifyBtn.textContent = '✅ Verify Deposit';
                    if (signatureInput) {
                        signatureInput.style.display = 'block';
                        signatureInput.placeholder = 'Enter transaction signature';
                    }
                    // Hide auto-scan status for new users
                    if (autoScanStatus) {
                        autoScanStatus.style.display = 'none';
                    }
                }
            }
        } else if (walletSection) {
            walletSection.style.display = 'none';
            if (transactionHistory) transactionHistory.style.display = 'none';
        }
    }

    // Deposit is now handled by showDepositInstructions() and verifyDeposit() methods

    async createUSDCTransferTransaction(fromPubkey, toAddress, amount) {
        const SolanaWeb3 = window.solanaWeb3 || window.solana;
        const connection = new SolanaWeb3.Connection(
            SolanaWeb3.clusterApiUrl('mainnet-beta'),
            'confirmed'
        );

        // Get USDC mint
        const USDC_MINT = new SolanaWeb3.PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

        // Get associated token accounts
        const fromATA = await this.getAssociatedTokenAddress(USDC_MINT, fromPubkey);
        const toPubkey = new SolanaWeb3.PublicKey(toAddress);
        const toATA = await this.getAssociatedTokenAddress(USDC_MINT, toPubkey);

        // Create transfer instruction
        const transferInstruction = SolanaWeb3.Token.createTransferInstruction(
            SolanaWeb3.TOKEN_PROGRAM_ID,
            fromATA,
            toATA,
            fromPubkey,
            [],
            amount * 1000000 // USDC has 6 decimals
        );

        // Create transaction
        const transaction = new SolanaWeb3.Transaction().add(transferInstruction);

        // Get recent blockhash
        const { blockhash } = await connection.getRecentBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = fromPubkey;

        return transaction;
    }

    async getAssociatedTokenAddress(mint, owner) {
        const SolanaWeb3 = window.solanaWeb3 || window.solana;
        const [address] = await SolanaWeb3.PublicKey.findProgramAddress(
            [
                owner.toBuffer(),
                SolanaWeb3.TOKEN_PROGRAM_ID.toBuffer(),
                mint.toBuffer(),
            ],
            SolanaWeb3.ASSOCIATED_TOKEN_PROGRAM_ID
        );
        return address;
    }

    async handleWithdraw() {
        const amountInput = document.getElementById('withdraw-amount');
        const amount = parseFloat(amountInput.value);

        console.log(`💸 [FRONTEND] Starting withdrawal: ${amount} tokens`);

        if (!amount || amount <= 0) {
            console.log(`❌ [FRONTEND] Invalid withdrawal amount: ${amount}`);
            this.showError('Please enter a valid withdrawal amount.');
            return;
        }

        if (!this.userWalletAddress) {
            console.log(`❌ [FRONTEND] No verified wallet address`);
            this.showError('You must make a deposit first to verify your wallet address before withdrawing.');
            return;
        }

        if (!window.authManager?.token) {
            console.log(`❌ [FRONTEND] No auth token available`);
            this.showError('Please login first.');
            return;
        }

        try {
            console.log(`📤 [FRONTEND] Sending withdrawal request...`);
            this.showInfo('Processing withdrawal to your verified wallet...');

            const response = await fetch(`${this.apiBase}/withdraw`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.authManager.token}`
                },
                body: JSON.stringify({
                    amount,
                    userSolanaAddress: this.userWalletAddress
                })
            });

            console.log(`📥 [FRONTEND] Withdrawal API response status: ${response.status}`);

            const data = await response.json();
            console.log(`📥 [FRONTEND] Withdrawal API response data:`, data);

            if (!response.ok) {
                console.log(`❌ [FRONTEND] Withdrawal API error:`, data.error);
                throw new Error(data.error || 'Withdrawal failed');
            }
            console.log(`✅ [FRONTEND] Withdrawal API success`);

            // Update local balances
            this.gameBalance = data.newGameBalance;

            // Update game balance
            if (window.gameInstance) {
                window.gameInstance.tokens = this.gameBalance;
                window.gameInstance.updateDisplay();
            }

            // Update UI
            this.updateWalletUI();
            this.loadTransactionHistory();

            // Clear input
            amountInput.value = '';

            this.showSuccess(`Successfully withdrew ${data.usdcReceived} USDC to your verified wallet!`);

        } catch (error) {
            console.error('Withdrawal error:', error);
            this.showError(error.message || 'Withdrawal failed. Please try again.');
        }
    }

    addTransaction(type, solAmount, tokenAmount) {
        const transactionList = document.getElementById('transaction-list');
        if (!transactionList) return;

        const timestamp = new Date().toLocaleTimeString();
        const transactionDiv = document.createElement('div');
        transactionDiv.className = 'transaction-item';

        const typeText = type === 'deposit' ? 'Deposit' : 'Withdrawal';
        const typeColor = type === 'deposit' ? '#00ff88' : '#ff6b6b';

        transactionDiv.innerHTML = `
            <div class="transaction-info">
                <span class="transaction-type" style="color: ${typeColor}">${typeText}</span>
                <span class="transaction-amount">${solAmount.toFixed(4)} SOL</span>
                <span class="transaction-tokens">(${tokenAmount} tokens)</span>
            </div>
            <div class="transaction-time">${timestamp}</div>
        `;

        // Add to top of list
        transactionList.insertBefore(transactionDiv, transactionList.firstChild);

        // Keep only last 10 transactions
        while (transactionList.children.length > 10) {
            transactionList.removeChild(transactionList.lastChild);
        }
    }

    async copyAddress() {
        if (!this.wallet) return;

        try {
            await navigator.clipboard.writeText(this.wallet.toString());
            this.showSuccess('Wallet address copied to clipboard!');
        } catch (error) {
            console.error('Copy error:', error);
            this.showError('Failed to copy address.');
        }
    }

    onUserLogin(user) {
        // User logged in, load their data from backend
        console.log('User logged in:', user.name);
        this.loadUserData();
    }

    async loadUserData() {
        if (!window.authManager?.token) return;

        try {
            const response = await fetch(`${this.apiBase}/user/profile`, {
                headers: {
                    'Authorization': `Bearer ${window.authManager.token}`
                }
            });

            if (response.ok) {
                const userData = await response.json();
                console.log(`👤 [USER DATA] Loaded profile for ${userData.email}`);
                console.log(`💰 [USER DATA] Game tokens: ${userData.gameBalance}`);
                console.log(`💵 [USER DATA] USDC balance: ${userData.usdcBalance}`);
                console.log(`🔑 [USER DATA] Wallet address: ${userData.solanaAddress}`);

                // Set balances with proper type conversion
                this.gameBalance = parseFloat(userData.gameBalance) || 0;
                this.userBalance = parseFloat(userData.usdcBalance) || 0;
                this.userWalletAddress = userData.solanaAddress; // Store verified wallet address

                console.log(`✅ [BALANCE SET] Game balance: ${this.gameBalance}, USDC balance: ${this.userBalance}`);

                // Update game instance
                if (window.gameInstance) {
                    window.gameInstance.tokens = this.gameBalance;
                    window.gameInstance.updateDisplay();
                }

                // Update wallet UI with verification status
                this.updateWalletUI();

                // Load transaction history
                this.loadTransactionHistory();

                // Load accurate user statistics
                if (window.gameInstance && window.gameInstance.loadUserStats) {
                    window.gameInstance.loadUserStats();
                }

                // Auto-reconcile balance for verified users
                if (userData.solanaAddress) {
                    console.log(`🔄 [BALANCE_RECONCILE] Auto-reconciling balance for verified user`);
                    this.reconcileBalance();
                }
            } else {
                console.log(`❌ [USER DATA] Failed to load profile: ${response.status}`);
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    async reconcileBalance() {
        if (!window.authManager?.token || !this.userWalletAddress) {
            console.log(`❌ [BALANCE_RECONCILE] Missing auth token or verified wallet`);
            return;
        }

        try {
            console.log(`🔄 [BALANCE_RECONCILE] Starting balance reconciliation...`);

            const response = await fetch(`${this.apiBase}/user/reconcile-balance`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.authManager.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                console.log(`✅ [BALANCE_RECONCILE] Balance reconciled: ${data.previousBalance} → ${data.newBalance}`);

                // Update local balance if it changed
                if (data.newBalance !== this.gameBalance) {
                    this.gameBalance = data.newBalance;

                    // Update game instance
                    if (window.gameInstance) {
                        window.gameInstance.tokens = this.gameBalance;
                        window.gameInstance.updateDisplay();
                    }

                    // Update UI
                    this.updateWalletUI();

                    // Show notification if balance changed
                    if (data.previousBalance !== data.newBalance) {
                        const difference = data.newBalance - data.previousBalance;
                        const sign = difference > 0 ? '+' : '';
                        this.showSuccess(`Balance updated: ${sign}${difference} tokens from recent transactions.`);
                    }
                }
            } else {
                console.log(`❌ [BALANCE_RECONCILE] Failed: ${response.status}`);
            }
        } catch (error) {
            console.error('Balance reconciliation error:', error);
        }
    }

    async loadTransactionHistory() {
        if (!window.authManager?.token) return;

        try {
            const response = await fetch(`${this.apiBase}/transactions`, {
                headers: {
                    'Authorization': `Bearer ${window.authManager.token}`
                }
            });

            if (response.ok) {
                const transactions = await response.json();
                this.displayTransactionHistory(transactions);
            }
        } catch (error) {
            console.error('Error loading transaction history:', error);
        }
    }

    displayTransactionHistory(transactions) {
        const transactionList = document.getElementById('transaction-list');
        if (!transactionList) return;

        transactionList.innerHTML = '';

        if (transactions.length === 0) {
            transactionList.innerHTML = '<div class="no-transactions">No transactions yet</div>';
            return;
        }

        transactions.forEach(tx => {
            const transactionDiv = document.createElement('div');
            transactionDiv.className = 'transaction-item';

            const timestamp = new Date(tx.timestamp).toLocaleTimeString();
            const typeText = tx.type.replace('_', ' ').toUpperCase();
            const typeColor = tx.type.includes('win') || tx.type === 'deposit' ? '#00ff88' : '#ff6b6b';

            transactionDiv.innerHTML = `
                <div class="transaction-info">
                    <span class="transaction-type" style="color: ${typeColor}">${typeText}</span>
                    <span class="transaction-amount">${tx.solAmount ? tx.solAmount.toFixed(4) + ' SOL' : tx.amount + ' tokens'}</span>
                </div>
                <div class="transaction-time">${timestamp}</div>
            `;

            transactionList.appendChild(transactionDiv);
        });
    }

    onUserLogout() {
        // User logged out, disconnect wallet
        if (this.isConnected && window.solana) {
            try {
                window.solana.disconnect();
            } catch (error) {
                console.error('Wallet disconnect error:', error);
            }
        }

        this.wallet = null;
        this.isConnected = false;
        this.userBalance = 0;
        this.updateWalletUI();
    }

    showError(message) {
        this.showNotification(message, '#ff4444');
    }

    showSuccess(message) {
        this.showNotification(message, '#00ff88');
    }

    showInfo(message) {
        this.showNotification(message, '#ffa500');
    }

    showNotification(message, color) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.innerHTML = message.replace(/\n/g, '<br>');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${color};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
            max-width: 400px;
            white-space: pre-wrap;
        `;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => notification.remove(), 300);
        }, color === '#ff4444' ? 8000 : 4000); // Longer timeout for errors
    }

    showWalletTroubleshooting() {
        const troubleshooting = `
🔧 WALLET TROUBLESHOOTING:

1. 📱 Open Phantom Wallet Extension
2. 🔓 Make sure wallet is unlocked
3. 🔄 Try the 🔄 reconnect button
4. 🌐 Refresh this page
5. 🔌 Restart your browser

Still not working?
• Create new wallet account in Phantom
• Check Phantom version is up to date
• Clear browser cache and cookies
        `;

        this.showInfo(troubleshooting);
    }
}

// Add notification animations to CSS dynamically
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

    // Initialize Solana manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.solanaManager = new SolanaManager();

    // Initialize scan status after a short delay to ensure UI is ready
    setTimeout(() => {
        if (window.solanaManager) {
            window.solanaManager.updateScanStatus('active');
        }
    }, 1000);
});