class BetBetterGame {
    constructor() {
        this.tokens = 0.00;
        this.gamesPlayed = 0;
        this.wins = 0;
        this.betHistory = [];
        this.multiplier = 2; // Fixed 2x multiplier
        this.winChance = 0.50001; // Always 50.001% for the simple dice roll
        this.isRolling = false;
        this.dice3D = null;

        this.initializeElements();
        this.attachEventListeners();
        this.initialize3DDice();
        this.updateDisplay();
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

        // Determine outcome first (but don't show it yet)
        this.gamesPlayed++;
        const won = this.determineOutcome();
        this.outcomeResult = { won, betAmount };

        // Start rolling
        this.isRolling = true;
        this.placeBet.disabled = true;
        this.placeBet.textContent = 'ROLLING...';

        // Start 3D dice roll animation
        if (this.dice3D) {
            this.dice3D.roll();
        } else {
            // Fallback if 3D dice isn't ready
            setTimeout(() => this.onRollComplete(), 2000);
        }
    }

    async onRollComplete() {
        const { won, betAmount } = this.outcomeResult;

        // Calculate net amount
        const netAmount = won ? betAmount : -betAmount;

        // Update backend with game result
        if (window.authManager?.isAuthenticated) {
            try {
                const response = await fetch('http://localhost:5000/api/game/update-balance', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${window.authManager.token}`
                    },
                    body: JSON.stringify({
                        amount: netAmount,
                        type: won ? 'win' : 'loss'
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    this.tokens = data.newBalance;

                    // Update Solana manager balance
                    if (window.solanaManager) {
                        window.solanaManager.gameBalance = this.tokens;
                    }
                } else {
                    console.error('Failed to update backend balance');
                    // Fallback to local calculation
                    if (won) {
                        this.tokens += betAmount;
                        this.wins++;
                    } else {
                        this.tokens -= betAmount;
                    }
                }
            } catch (error) {
                console.error('Backend update error:', error);
                // Fallback to local calculation
                if (won) {
                    this.tokens += betAmount;
                    this.wins++;
                } else {
                    this.tokens -= betAmount;
                }
            }
        } else {
            // Not authenticated, use local calculation
            if (won) {
                this.tokens += betAmount;
                this.wins++;
            } else {
                this.tokens -= betAmount;
            }
        }

        // Show result
        if (won) {
            this.showResult(`WIN! +${betAmount}`, 'win');
        } else {
            this.showResult(`LOSE! -${betAmount}`, 'lose');
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

    determineOutcome() {
        // Generate a random number between 0 and 1
        const random = Math.random();

        // Player wins if random number is less than 50.001% (slight advantage)
        return random < 0.50001;
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

    updateDisplay() {
        this.tokenBalance.textContent = this.tokens.toFixed(2);
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