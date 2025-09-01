class BetBetterGame {
    constructor() {
        this.tokens = 0.00;
        this.gamesPlayed = 0;
        this.wins = 0;
        this.betHistory = [];
        this.multiplier = 2; // Fixed 2x multiplier
        this.winChance = 0.50001; // Server-side: 50.001% user advantage
        this.isRolling = false;
        this.dice3D = null;
        this.firstBetCompleted = false; // Track if first bet is done
        this.apiBase = this.getApiBaseUrl(); // Dynamic API base URL

        this.initializeElements();
        this.attachEventListeners();
        this.initialize3DDice();
        this.updateDisplay();
        this.loadUserStats(); // Load accurate statistics from backend
    }

    getApiBaseUrl() {
        // Check if we're running on Netlify (production)
        if (window.location.hostname.includes('netlify.app')) {
            // Use your production backend URL here
            return 'https://primimus.netlify.app.com/api';
        }
        // Development fallback
        return 'http://localhost:5000/api';
    }

    initializeElements() {
        this.tokenBalance = document.getElementById('tokenBalance');
        this.betAmount = document.getElementById('betAmount');
        this.placeBet = document.getElementById('placeBet');
        this.result = document.getElementById('result');
        this.history = document.getElementById('history');
        this.gamesPlayedEl = document.getElementById('gamesPlayed');
        this.winsEl = document.getElementById('wins');
        this.winRateEl = document.getElementById('winRate');

        // Initialize betting availability
        this.checkBettingAvailability();
    }

    initialize3DDice() {
        // Wait for Three.js to load
        if (typeof THREE !== 'undefined') {
            // Initialize the nested dice system - STL files will load automatically
            this.dice3D = new Dice3D('diceCanvas');
            this.dice3D.setRollCompleteCallback(() => {
                this.onRollComplete();
            });
        } else {
            // Retry after a short delay if Three.js hasn't loaded yet
            setTimeout(() => this.initialize3DDice(), 100);
        }
    }

    attachEventListeners() {
        this.placeBet.addEventListener('click', () => this.placeBetHandler());
    }

    placeBetHandler() {
        const betAmount = parseFloat(this.betAmount.value);

        if (!this.validateBet(betAmount) || this.isRolling) {
            return;
        }

        // Check if user is authenticated for server-side betting
        if (!window.authManager?.isAuthenticated) {
            this.showResult('Please login to place bets!', 'error');
            return;
        }

        // Start rolling animation first
        this.isRolling = true;
        this.placeBet.disabled = true;
        this.placeBet.textContent = 'ROLLING...';

        // Start 3D dice roll animation
        if (this.dice3D) {
            this.dice3D.roll();
        } else {
            // Fallback if 3D dice isn't ready
            setTimeout(() => this.placeServerBet(betAmount), 2000);
        }
    }

    async placeServerBet(betAmount) {
        try {
            console.log(`🎲 [CLIENT_BET] Placing server-side bet: ${betAmount}`);

            // Add timeout to prevent hanging requests
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            const response = await fetch(`${this.apiBase}/game/place-bet`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.authManager.token}`
                },
                body: JSON.stringify({
                    betAmount: betAmount
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Bet failed');
            }

            const betResult = await response.json();
            console.log(`🎲 [CLIENT_BET] Server response:`, betResult);

            // Update local state with server result
            this.gamesPlayed++;
            if (betResult.playerWins) {
                this.wins++;
            }

            // Update tokens from server
            this.tokens = this.fixPrecision(betResult.newBalance);

            // Update Solana manager balance
            if (window.solanaManager) {
                window.solanaManager.gameBalance = this.tokens;
            }

            // Hide server security badge after first bet
            if (!this.firstBetCompleted) {
                this.firstBetCompleted = true;
                const securityBadge = document.getElementById('server-security-badge');
                if (securityBadge) {
                    securityBadge.style.display = 'none';
                }
            }

            // Store outcome for display
            this.outcomeResult = {
                won: betResult.playerWins,
                betAmount: betAmount,
                randomNumber: betResult.randomNumber,
                serverResult: betResult
            };

            // Show result after animation completes
            this.showBetResult();

        } catch (error) {
            console.error('Server bet error:', error);

            // Handle different types of errors
            let errorMessage = 'Bet failed';
            if (error.name === 'AbortError') {
                errorMessage = 'Bet request timed out. Please try again.';
            } else if (error.message) {
                errorMessage = error.message;
            }

            this.showResult(`Bet failed: ${errorMessage}`, 'error');

            // Re-enable button on error
            this.isRolling = false;
            this.placeBet.disabled = false;
            this.placeBet.textContent = 'PLACE BET';
        }
    }

    async onRollComplete() {
        // For 3D dice animation, call server bet after animation starts
        const betAmount = parseFloat(this.betAmount.value);
        if (this.dice3D && betAmount > 0) {
            await this.placeServerBet(betAmount);
        }
    }

    showBetResult() {
        const { won, betAmount, randomNumber } = this.outcomeResult;

        // Calculate net amount with precision fixing
        const netAmount = this.fixPrecision(won ? betAmount : -betAmount);

        // Show result with random number for transparency
        const randomDisplay = randomNumber ? ` (Random: ${(randomNumber * 100).toFixed(5)}%)` : '';
        if (won) {
            this.showResult(`WIN! +${betAmount}${randomDisplay}`, 'win');
        } else {
            this.showResult(`LOSE! -${betAmount}${randomDisplay}`, 'lose');
        }

        this.addToHistory(netAmount, won);
        this.updateDisplay();

        // Re-enable button
        this.isRolling = false;
        this.placeBet.disabled = false;
        this.placeBet.textContent = 'PLACE BET';

        if (this.tokens <= 0) {
            this.gameOver();
        }

        // Update betting availability
        this.checkBettingAvailability();
    }

    checkBettingAvailability() {
        const isAuthenticated = window.authManager?.isAuthenticated;
        const hasTokens = this.tokens > 0;

        if (isAuthenticated && hasTokens) {
            // User is authenticated and has tokens - enable betting
            this.placeBet.disabled = false;
            this.placeBet.textContent = 'PLACE BET';
            this.placeBet.style.opacity = '1';
            this.placeBet.style.cursor = 'pointer';

            // Clear any "need to deposit" messages
            if (this.result.textContent.includes('deposit') || this.result.textContent.includes('login')) {
                this.result.textContent = 'Ready to bet! Choose your amount and place your bet.';
                this.result.className = 'result-display';
                this.result.classList.add('ready-message');
            }
        } else if (isAuthenticated && !hasTokens) {
            // User is authenticated but no tokens - suggest deposit
            this.placeBet.disabled = true;
            this.placeBet.textContent = 'DEPOSIT TO PLAY';
            this.placeBet.style.opacity = '0.6';
            this.placeBet.style.cursor = 'not-allowed';
            this.showResult('Deposit USDC to get tokens and start playing!', 'info');
        } else {
            // User not authenticated
            this.placeBet.disabled = true;
            this.placeBet.textContent = 'LOGIN TO PLAY';
            this.placeBet.style.opacity = '0.6';
            this.placeBet.style.cursor = 'not-allowed';
            this.showResult('Please login with Google to start playing!', 'info');
        }
    }

    gameOver() {
        this.placeBet.disabled = true;
        this.placeBet.textContent = 'GAME OVER';
        this.placeBet.style.opacity = '0.6';
        this.placeBet.style.cursor = 'not-allowed';
        this.showResult('You\'re out of tokens! Deposit more to continue playing.', 'game-over');
    }

    validateBet(amount) {
        if (isNaN(amount) || amount <= 0) {
            this.showResult('Please enter a valid bet amount greater than 0!', 'error');
            return false;
        }

        if (amount > this.tokens) {
            this.showResult('You don\'t have enough tokens for that bet!', 'error');
            return false;
        }

        return true;
    }

    // DEPRECATED: Client-side randomness removed for security
    // Server now handles all betting with cryptographically secure randomness
    determineOutcome() {
        console.warn('Client-side determineOutcome() is deprecated. Using server-side betting instead.');
        return false; // This should never be called in production
    }

    showResult(message, type) {
        this.result.textContent = message;

        // Force animation restart by removing existing classes and forcing reflow
        this.result.className = 'result-display';
        this.result.offsetHeight; // Force reflow to reset animations

        if (type === 'win') {
            this.result.classList.add('win-message');
        } else if (type === 'lose') {
            this.result.classList.add('lose-message');
        } else if (type === 'info') {
            this.result.classList.add('info-message');
        } else if (type === 'error') {
            this.result.classList.add('error-message');
        } else if (type === 'ready-message') {
            this.result.classList.add('ready-message');
        } else if (type === 'game-over') {
            this.result.classList.add('game-over-message');
        }

        // Result messages now last forever (no auto-clear)
    }

    addToHistory(netAmount, won) {
        const timestamp = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'});
        const result = won ? 'WIN' : 'LOSS';
        const betAmount = won ? netAmount : Math.abs(netAmount);
        const resultColor = won ? '#00ff88' : '#ff4444';

        const historyItem = document.createElement('div');
        historyItem.innerHTML = `
            <span class="timestamp">${timestamp}</span>
            <span class="bet-info">Bet: ${betAmount}</span>
            <span class="result-text" style="color: ${resultColor};">${result}</span>
            <span class="amount-change" style="color: ${resultColor};">${won ? '+' : '-'}${betAmount}</span>
        `;

        this.betHistory.unshift(historyItem);

        // Keep only last 10 entries
        if (this.betHistory.length > 10) {
            this.betHistory.pop();
        }

        this.updateHistoryDisplay();
    }

    updateHistoryDisplay() {
        this.history.innerHTML = '';

        if (this.betHistory.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.innerHTML = `
                <div style="text-align: center; color: #888; font-size: 0.7rem; padding: 12px; opacity: 0.6; font-weight: 400;">
                    No past data
                </div>
            `;
            this.history.appendChild(emptyMessage);
        } else {
            this.betHistory.forEach(item => {
                this.history.appendChild(item);
            });
        }
    }

    // Helper function to fix floating point precision issues
    fixPrecision(num, decimals = 8) {
        return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
    }

    // Format number for display (avoid showing unnecessary decimals)
    formatDisplay(num) {
        const fixed = this.fixPrecision(num);
        // If it's a whole number, show as integer
        if (fixed % 1 === 0) {
            return fixed.toString();
        }
        // Otherwise show with appropriate decimal places (max 4 for display)
        return fixed.toFixed(Math.min(4, (fixed.toString().split('.')[1] || '').length));
    }

    updateDisplay() {
        // Show token amount with proper precision handling
        this.tokenBalance.textContent = this.formatDisplay(this.tokens);
        this.gamesPlayedEl.textContent = this.gamesPlayed;
        this.winsEl.textContent = this.wins;

        const winRate = this.gamesPlayed > 0 ? (this.wins / this.gamesPlayed * 100).toFixed(2) : 0;
        this.winRateEl.textContent = `${winRate}%`;

        // Update token balance color based on amount
        if (this.tokens > 0) {
            this.tokenBalance.style.color = '#00ff88';
        } else if (this.tokens === 0) {
            this.tokenBalance.style.color = '#ffa500';
        } else {
            this.tokenBalance.style.color = '#ff4444';
        }

        // Update betting availability
        this.checkBettingAvailability();
    }

    // Load accurate statistics from backend
    async loadUserStats() {
        if (!window.authManager?.isAuthenticated) return;

        try {
            const response = await fetch(`${this.apiBase}/user/stats`, {
                headers: {
                    'Authorization': `Bearer ${window.authManager.token}`
                }
            });

            if (response.ok) {
                const stats = await response.json();
                this.gamesPlayed = stats.gamesPlayed;
                this.wins = stats.wins;
                this.updateDisplay();
                console.log('Loaded user statistics:', stats);
            }
        } catch (error) {
            console.error('Error loading user stats:', error);
        }
    }

    gameOver() {
        this.placeBet.disabled = true;
        this.placeBet.textContent = 'GAME OVER';
        this.placeBet.style.opacity = '0.6';
        this.placeBet.style.cursor = 'not-allowed';
        this.showResult('You\'re out of tokens! Deposit more to continue playing.', 'game-over');
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    window.gameInstance = new BetBetterGame();
});