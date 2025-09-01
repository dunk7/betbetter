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

        // Show deposit verification UI
        const verificationDiv = document.querySelector('.deposit-verification');
        if (verificationDiv) {
            verificationDiv.style.display = verificationDiv.style.display === 'none' ? 'block' : 'none';
        }

        const instructions = `
🛡️ SECURE DEPOSIT INSTRUCTIONS 🛡️

To deposit USDC and get game tokens:

1. Copy the treasury address: ${this.treasuryAddress}
2. Send USDC from your wallet to this address
3. Use any Solana wallet (Phantom, Solflare, etc.)
4. Exchange Rate: 1 USDC = 1 token

🔐 Security Features:
• Your wallet address will be verified and stored
• Future deposits must come from the same address
• Transaction signatures prevent double-processing
• Only you can withdraw to your verified address

⚠️  Important:
• Send USDC (not SOL or other tokens)
• Minimum deposit: 0.01 USDC (0.01 tokens)
• After sending, paste the transaction signature below
• Processing may take a few seconds

💡 Tip: You can use https://solscan.io to verify your transaction
        `;

        alert(instructions);
    }

    async verifyDeposit() {
        const signatureInput = document.getElementById('deposit-signature');
        const signature = signatureInput?.value?.trim();

        console.log(`🔍 [FRONTEND] Starting deposit verification with signature: ${signature}`);

        if (!signature) {
            console.log(`❌ [FRONTEND] No transaction signature provided`);
            this.showError('Please enter the transaction signature from your USDC transfer.');
            return;
        }

        if (!window.authManager?.token) {
            console.log(`❌ [FRONTEND] No auth token available`);
            this.showError('Please login first.');
            return;
        }

        try {
            console.log(`📤 [FRONTEND] Sending deposit verification request...`);
            this.showInfo('Verifying deposit transaction...');

            const response = await fetch(`${this.apiBase}/deposit`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.authManager.token}`
                },
                body: JSON.stringify({ transactionSignature: signature })
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

            // Handle wallet verification for first deposit
            if (data.walletVerified) {
                this.showSuccess(`🎉 First deposit successful! Your wallet address has been verified and stored securely.`);
                setTimeout(() => {
                    this.showSuccess(`Successfully deposited ${data.usdcReceived} USDC (${data.gameTokensAdded} tokens)!`);
                }, 2000);
            } else {
                this.showSuccess(`Successfully deposited ${data.usdcReceived} USDC (${data.gameTokensAdded} tokens)!`);
            }

            // Update UI
            this.updateWalletUI();
            this.loadTransactionHistory();

            // Clear input
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

    async updateWalletBalance() {
        if (!this.connection || !this.wallet) return;

        try {
            const balance = await this.connection.getBalance(this.wallet);
            const SolanaWeb3 = window.solanaWeb3 || window.solana;
        const solBalance = balance / SolanaWeb3.LAMPORTS_PER_SOL;

            // Update UI
            const balanceElement = document.getElementById('user-usdc-balance');
            if (balanceElement) {
                balanceElement.textContent = `USDC: ${solBalance.toFixed(4)}`; // Using SOL balance as proxy for USDC for now
            }

            this.userBalance = solBalance;
        } catch (error) {
            console.error('Error fetching balance:', error);

            // Handle specific balance fetching errors
            if (error.message && error.message.includes('403')) {
                console.warn('Wallet address not found on network, using simulated balance');
                // For demo purposes, set a simulated balance
                this.userBalance = 10.0; // Simulated 10 USDC
                const balanceElement = document.getElementById('user-usdc-balance');
                if (balanceElement) {
                    balanceElement.textContent = `USDC: ${this.userBalance.toFixed(4)}`;
                }
            } else if (error.message && error.message.includes('Access forbidden')) {
                console.warn('Access forbidden - wallet might be on different network');
                this.userBalance = 5.0; // Simulated balance for demo
                const balanceElement = document.getElementById('user-usdc-balance');
                if (balanceElement) {
                    balanceElement.textContent = `USDC: ${this.userBalance.toFixed(4)}`;
                }
            } else {
                this.showError('Failed to fetch wallet balance.');
            }
        }
    }

    updateWalletUI() {
        console.log(`🔄 [WALLET UI] Updating balances - Game: ${this.gameBalance}, USDC: ${this.userBalance}`);

        // Update token balance display
        const tokenBalance = document.getElementById('tokenBalance');
        if (tokenBalance) {
            tokenBalance.textContent = this.gameBalance.toFixed(2);
            console.log(`✅ [TOKEN BALANCE] Updated to: ${this.gameBalance.toFixed(2)}`);
        }

        // Update USDC balance display
        const usdcBalance = document.getElementById('usdcBalance');
        if (usdcBalance) {
            usdcBalance.textContent = this.userBalance.toFixed(4);
            console.log(`✅ [USDC BALANCE] Updated to: ${this.userBalance.toFixed(4)}`);
        }

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

        if (walletSection && window.authManager?.isAuthenticated) {
            walletSection.style.display = 'block';
            if (transactionHistory) transactionHistory.style.display = 'block';

            // Update wallet verification status
            this.updateWalletVerificationUI();
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
            } else {
                console.log(`❌ [USER DATA] Failed to load profile: ${response.status}`);
            }
        } catch (error) {
            console.error('Error loading user data:', error);
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
});