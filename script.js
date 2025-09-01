class BetBetterGame {
    constructor() {
        this.tokens = 50.00;
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

    onRollComplete() {
        const { won, betAmount } = this.outcomeResult;

        // Update game state
        if (won) {
            this.tokens += betAmount; // Add the bet amount to tokens
            this.wins++;
            this.showResult(`WIN! +${betAmount}`, 'win');
        } else {
            this.tokens -= betAmount; // Subtract the bet amount from tokens
            this.showResult(`LOSE! -${betAmount}`, 'lose');
        }

        this.addToHistory(won ? betAmount : -betAmount, won);
        this.updateDisplay();

        // Re-enable button
        this.isRolling = false;
        this.placeBet.disabled = false;
        this.placeBet.textContent = 'PLACE BET';

        if (this.tokens <= 0) {
            this.gameOver();
        }
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
        if (this.tokens >= 50) {
            this.tokenBalance.style.color = '#00ff88';
        } else if (this.tokens >= 25) {
            this.tokenBalance.style.color = '#ffa500';
        } else {
            this.tokenBalance.style.color = '#ff4444';
        }
    }

    gameOver() {
        const gameOverDiv = document.createElement('div');
        gameOverDiv.className = 'game-over';
        gameOverDiv.innerHTML = `
            <div class="game-over-content">
                <h2>💀 Game Over!</h2>
                <p>You've run out of tokens!</p>
                <p>Games played: ${this.gamesPlayed}</p>
                <p>Final win rate: ${(this.gamesPlayed > 0 ? (this.wins / this.gamesPlayed * 100).toFixed(2) : 0)}%</p>
                <p>Total profit/loss: ${(this.tokens - 50).toFixed(2)} tokens</p>
                <button onclick="location.reload()">Play Again</button>
            </div>
        `;
        document.body.appendChild(gameOverDiv);
    }
}

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new BetBetterGame();
});