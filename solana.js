// Solana Manager - Secure wallet verification system
class SolanaManager {
    constructor() {
        this.connection = null;
        this.gameBalance = 0; // Will be loaded from backend
        this.apiBase = this.getApiBaseUrl();
        this.treasuryAddress = null;
        this.userWalletAddress = null; // User's verified wallet address (deposit verification)
        this.userWithdrawAddress = null; // User's explicit personal withdrawal address
        this.init();
    }

    getApiBaseUrl() {
        const host = window.location.hostname;
        const isLocal = host === 'localhost' || host === '127.0.0.1';
        if (isLocal) return 'http://localhost:5000/api';
        return '/.netlify/functions';
    }

    // Map function-style endpoints to Express routes when running locally
    resolveApi(path) {
        const base = this.apiBase;
        if (base.includes('localhost:5000')) {
            const mapping = {
                'treasury-address': 'treasury-address',
                'treasury-balance': 'treasury-balance',
                'transactions': 'transactions',
                'user-profile': 'user/profile',
                'user-reconcile-balance': 'user/reconcile-balance',
                'user-stats': 'user/stats',
                'deposit': 'deposit',
                'withdraw': 'withdraw',
                'auth-google': 'auth/google',
                'user-update-settings': 'user/update-settings'
            };
            const mapped = mapping[path] || path;
            return `${base}/${mapped}`;
        }
        return `${base}/${path}`;
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
            {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0  // Support legacy transactions
            }
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
        const settingsBtn = document.getElementById('settings-btn');
        const settingsModal = document.getElementById('settings-modal');
        const settingsCancel = document.getElementById('settings-cancel-btn');
        const settingsSave = document.getElementById('settings-save-btn');
        const withdrawAddressInput = document.getElementById('withdraw-address-input');

        if (depositBtn) {
            depositBtn.addEventListener('click', () => this.showDepositInstructions());
        }

        if (withdrawBtn) {
            withdrawBtn.addEventListener('click', () => this.handleWithdraw());
        }

        if (settingsBtn && settingsModal) {
            settingsBtn.addEventListener('click', () => {
                if (!window.authManager?.isAuthenticated) {
                    this.showError('Please login first.');
                    return;
                }
                // Pre-fill input with current setting if available
                if (withdrawAddressInput) {
                    withdrawAddressInput.value = this.userWithdrawAddress || '';
                }
                settingsModal.style.display = 'flex';
            });
        }
        if (settingsCancel && settingsModal) {
            settingsCancel.addEventListener('click', () => {
                settingsModal.style.display = 'none';
            });
        }
        if (settingsModal) {
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) {
                    settingsModal.style.display = 'none';
                }
            });
        }
        if (settingsSave && withdrawAddressInput && settingsModal) {
            settingsSave.addEventListener('click', async () => {
                const addr = (withdrawAddressInput.value || '').trim();
                if (!addr) {
                    this.showError('Please enter a Solana address.');
                    return;
                }
                if (!window.authManager?.token) {
                    this.showError('Please login first.');
                    return;
                }
                try {
                    const res = await fetch(this.resolveApi('user-update-settings'), {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${window.authManager.token}`
                        },
                        body: JSON.stringify({ withdrawAddress: addr })
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        throw new Error(data.error || 'Failed to save settings');
                    }
                    this.userWithdrawAddress = data.withdrawAddress;
                    this.showSuccess('Withdrawal address saved. Withdrawals will go to this wallet.');
                    this.updateHeaderWalletDisplay();
                    settingsModal.style.display = 'none';
                } catch (err) {
                    this.showError(err.message || 'Failed to save settings');
                }
            });
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
            const response = await fetch(this.resolveApi('treasury-address'));

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
🎯 QUICK DEPOSIT PROCESS

Your wallet is verified! Send USDC and we'll handle the rest automatically.

📋 How to deposit:
1. Send USDC to: ${this.treasuryAddress}
2. Click "Update Balance" to refresh your tokens
3. Done! Your tokens appear instantly

⚠️  Important:
• Send from your verified wallet: ${this.userWalletAddress ? `${this.userWalletAddress.slice(0, 8)}...${this.userWalletAddress.slice(-8)}` : 'your verified wallet'}
• 5¢ fee applies to all deposits
• Minimum deposit: 0.06 USDC
• Use any Solana wallet (Phantom, Solflare, etc.)

💡 Deposits are processed automatically - just send and update!
            `;
        } else {
            // Instructions for new users
            instructions = `
🛡️ FIRST DEPOSIT - WALLET VERIFICATION 🛡️

To get started with game tokens:

1. Copy the treasury address: ${this.treasuryAddress}
2. Send USDC from your wallet to this address
3. Paste the transaction signature below
4. Click "Verify Deposit" to complete setup

⚠️  Important:
• Send USDC (not SOL or other tokens)
• Minimum deposit: 0.06 USDC (0.01 tokens after 5¢ fee)
• 5¢ fee applies to all deposits
• Use any Solana wallet (Phantom, Solflare, etc.)

💡 Tip: Use https://solscan.io to verify your transaction

🚀 After verification, future deposits are automatic!
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
        // BUG FIX: Must check both null AND undefined because undefined !== null is true!
        // This was causing users with undefined wallet addresses to be treated as verified
        const hasVerifiedWallet = this.userWalletAddress !== null && this.userWalletAddress !== undefined;
        console.log(`🔍 [FRONTEND] User wallet address check:`);
        console.log(`   - userWalletAddress: ${this.userWalletAddress}`);
        console.log(`   - typeof: ${typeof this.userWalletAddress}`);
        console.log(`   - is null: ${this.userWalletAddress === null}`);
        console.log(`   - is undefined: ${this.userWalletAddress === undefined}`);
        console.log(`   - OLD CHECK (buggy): ${this.userWalletAddress !== null}`);
        console.log(`   - NEW CHECK (correct): ${hasVerifiedWallet}`);
        console.log(`   - hasVerifiedWallet: ${hasVerifiedWallet}`);

        try {
            let requestBody;
            let statusMessage;

            if (hasVerifiedWallet && !signature) {
                // Auto-update for verified users
                console.log(`🔄 [FRONTEND] Using auto-update for verified user`);
                requestBody = { autoUpdate: true };
                statusMessage = 'Automatically updating balance from blockchain...';
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

            const response = await fetch(this.resolveApi('deposit'), {
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
            this.gameBalance = data.newBalance || data.newGameBalance || this.gameBalance;

            // Update game balance
            if (window.gameInstance) {
                window.gameInstance.tokens = this.gameBalance;
                window.gameInstance.updateDisplay();
            }

            // Handle different response types
            if (data.autoUpdated) {
                // Auto-update success
                this.showSuccess(`✅ Balance automatically updated! You now have ${data.newBalance ?? data.newGameBalance} tokens.`);
                this.updateScanStatus('found');
                if ((data.gameTokensAdded ?? 0) !== 0) {
                    setTimeout(() => {
                        const added = data.gameTokensAdded ?? 0;
                        const sign = added > 0 ? '+' : '';
                        this.showSuccess(`${sign}${added} tokens from recent transactions.`);
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
                if (data.usdcReceived !== undefined) {
                    this.showSuccess(`Successfully deposited ${data.usdcReceived} USDC (${data.feeDeducted}¢ fee deducted) → ${data.usdcAfterFee} USDC = ${data.gameTokensAdded} tokens!`);
                } else {
                    this.showSuccess('Deposit processed.');
                }
            }

            // Update header wallet display immediately
            this.updateHeaderWalletDisplay();

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
        const securityNotice = document.querySelector('.security-notice');

        if (this.userWalletAddress) {
            // User has verified wallet
            if (walletStatus) walletStatus.style.display = 'block';
            if (verifiedAddress) {
                verifiedAddress.textContent = `${this.userWalletAddress.slice(0, 8)}...${this.userWalletAddress.slice(-8)}`;
            }

            // Hide the security notice since wallet is now verified
            if (securityNotice) {
                securityNotice.style.display = 'none';
            }

            // Auto-hide the wallet verified message after 3 seconds
            setTimeout(() => {
                if (walletStatus) {
                    walletStatus.style.display = 'none';
                }
            }, 3000);
        } else {
            // No verified wallet yet
            if (walletStatus) walletStatus.style.display = 'none';
            // Show security notice for unverified wallets
            if (securityNotice) {
                securityNotice.style.display = 'block';
            }
        }
    }

    async loadTreasuryBalance() {
        if (!window.authManager?.token) return;

        try {
            const response = await fetch(this.resolveApi('treasury-balance'), {
                headers: {
                    'Authorization': `Bearer ${window.authManager.token}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                const val = data.formattedBalance || `${(data.usdcBalance || 0).toFixed(2)} USDC`;
                const treasuryBalanceElement = document.getElementById('treasuryBalance');
                const treasuryBalanceInline = document.getElementById('treasuryBalanceInline');
                if (treasuryBalanceElement) treasuryBalanceElement.textContent = val;
                if (treasuryBalanceInline) treasuryBalanceInline.textContent = val;
            } else {
                console.log('Treasury balance not available');
                const treasuryBalanceElement = document.getElementById('treasuryBalance');
                const treasuryBalanceInline = document.getElementById('treasuryBalanceInline');
                if (treasuryBalanceElement) treasuryBalanceElement.textContent = 'N/A';
                if (treasuryBalanceInline) treasuryBalanceInline.textContent = 'N/A';
            }
        } catch (error) {
            console.error('Error loading treasury balance:', error);
            const treasuryBalanceElement = document.getElementById('treasuryBalance');
            const treasuryBalanceInline = document.getElementById('treasuryBalanceInline');
            if (treasuryBalanceElement) treasuryBalanceElement.textContent = 'N/A';
            if (treasuryBalanceInline) treasuryBalanceInline.textContent = 'N/A';
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

    updateHeaderWalletDisplay() {
        // Update user wallet display in header
        const userWallet = document.getElementById('user-wallet');
        if (userWallet) {
            const displayAddr = this.userWithdrawAddress || this.userWalletAddress;
            if (displayAddr) {
                userWallet.textContent = `Wallet: ${displayAddr.slice(0, 7)}...`;
                console.log(`✅ [HEADER WALLET] Updated to: ${displayAddr.slice(0, 7)}...`);
            } else {
                userWallet.textContent = 'Wallet: Not connected';
                console.log(`ℹ️ [HEADER WALLET] No wallet connected`);
            }
        }
    }

    updateWalletUI() {
        // Ensure gameBalance is a valid number
        if (typeof this.gameBalance !== 'number' || isNaN(this.gameBalance)) {
            console.log(`⚠️ [WALLET UI] gameBalance is invalid: ${this.gameBalance}, resetting to 0`);
            this.gameBalance = 0;
        }

        console.log(`🔄 [WALLET UI] Updating balances - Game: ${this.gameBalance}`);

        // Update user wallet display in header
        this.updateHeaderWalletDisplay();

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



        // Show wallet section if user is logged in
        const walletSection = document.getElementById('wallet-section');
        const transactionHistory = document.getElementById('transaction-history');
        const depositBtn = document.getElementById('deposit-btn');
        const verifyBtn = document.getElementById('verify-deposit-btn');
        const signatureInput = document.getElementById('deposit-signature');

        if (walletSection && window.authManager?.isAuthenticated) {
            walletSection.style.display = 'block';
            if (transactionHistory) transactionHistory.style.display = 'block';

            // Update wallet verification status
            this.updateWalletVerificationUI();

            // Update deposit UI based on verification status
            if (depositBtn && verifyBtn) {
                if (this.userWalletAddress) {
                    // Verified user - simplified deposit flow
                    depositBtn.textContent = '📥 Deposit USDC';
                    verifyBtn.textContent = '🔄 Update Balance';
                    if (signatureInput) {
                        signatureInput.style.display = 'none';
                        signatureInput.placeholder = 'Deposits are verified automatically!';
                    }
                } else {
                    // New user - show manual verification
                    depositBtn.textContent = '📥 Deposit USDC';
                    verifyBtn.textContent = '✅ Verify Deposit';
                    if (signatureInput) {
                        signatureInput.style.display = 'block';
                        signatureInput.placeholder = 'Enter transaction signature';
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
            {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0  // Support legacy transactions
            }
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

        const destinationAddress = this.userWithdrawAddress || this.userWalletAddress;
        if (!destinationAddress) {
            console.log(`❌ [FRONTEND] No withdrawal address configured`);
            this.showError('Please set your personal withdrawal address in Settings before withdrawing.');
            return;
        }

        if (!window.authManager?.token) {
            console.log(`❌ [FRONTEND] No auth token available`);
            this.showError('Please login first.');
            return;
        }

        try {
            console.log(`📤 [FRONTEND] Sending withdrawal request...`);
            this.showInfo('Processing withdrawal to your saved wallet...');

            const response = await fetch(this.resolveApi('withdraw'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.authManager.token}`
                },
                body: JSON.stringify({
                    amount
                })
            });

            console.log(`📥 [FRONTEND] Withdrawal API response status: ${response.status}`);

            const data = await response.json();
            console.log(`📥 [FRONTEND] Withdrawal API response data:`, data);

            if (!response.ok) {
                console.log(`❌ [FRONTEND] Withdrawal API error:`, data.error);
                if (data.requiresWithdrawAddress) {
                    this.showError('Please set your personal wallet in Settings before withdrawing.');
                } else {
                    this.showError(data.error || 'Withdrawal failed');
                }
                return;
            }
            console.log(`✅ [FRONTEND] Withdrawal API success`);

            // Update local balances
            this.gameBalance = parseFloat(data.newBalance || data.newGameBalance || this.gameBalance) || 0;
            console.log(`💰 [WITHDRAW] Updated gameBalance to: ${this.gameBalance}`);

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

            this.showSuccess(data.message || `Successfully withdrew ${amount} tokens to your wallet!`);

            // Add transaction to history
            this.addTransaction('withdraw', amount, amount);

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
                <span class="transaction-amount">${solAmount.toFixed(4)} USDC</span>
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
        console.log(`👤 [USER LOGIN] User logged in: ${user.name}`);
        console.log(`📧 [USER LOGIN] Email: ${user.email}`);
        console.log(`🆔 [USER LOGIN] User ID: ${user.id}`);
        console.log(`🔑 [USER LOGIN] Current wallet address before profile load: ${this.userWalletAddress}`);
        this.loadUserData();
    }

    async loadUserData() {
        if (!window.authManager?.token) return;

        try {
            const response = await fetch(this.resolveApi('user-profile'), {
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
                console.log(`⚙️  [USER DATA] Withdraw address: ${userData.withdrawAddress}`);
                console.log(`🔍 [USER DATA] Wallet address details:`);
                console.log(`   - typeof: ${typeof userData.solanaAddress}`);
                console.log(`   - is null: ${userData.solanaAddress === null}`);
                console.log(`   - is undefined: ${userData.solanaAddress === undefined}`);
                console.log(`   - is empty string: ${userData.solanaAddress === ''}`);

                // Set balances with proper type conversion
                this.gameBalance = parseFloat(userData.gameBalance) || 0;
                this.userBalance = parseFloat(userData.usdcBalance) || 0;
                this.userWalletAddress = userData.solanaAddress; // Store verified wallet address
                this.userWithdrawAddress = userData.withdrawAddress || null;

                console.log(`✅ [BALANCE SET] Game balance: ${this.gameBalance}, USDC balance: ${this.userBalance}`);
                console.log(`🔑 [WALLET ADDRESS] Loaded: ${this.userWalletAddress}`);

                // Update header wallet display immediately when wallet address is loaded
                this.updateHeaderWalletDisplay();

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

            const response = await fetch(this.resolveApi('user-reconcile-balance'), {
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
            const response = await fetch(this.resolveApi('transactions'), {
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
        this.userWalletAddress = null; // Clear wallet address on logout

        // Clear header wallet display immediately
        this.updateHeaderWalletDisplay();

        this.updateWalletUI();
    }

    showError(message) {
        this.toast(message, '#cc3333');
    }

    showSuccess(message) {
        this.toast(message, '#00a86b');
    }

    showInfo(message) {
        this.toast(message, '#2d7bdc');
    }

    toast(message, bg) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: ${bg}; color: #fff; padding: 12px 16px; border-radius: 8px; z-index: 10001; box-shadow: 0 10px 30px rgba(0,0,0,0.25);`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
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