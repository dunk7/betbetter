class BetBetterGame {
    constructor() {
        this.tokens = 50.00;
        this.gamesPlayed = 0;
        this.wins = 0;
        this.betHistory = [];

        this.initializeElements();
        this.attachEventListeners();
        this.updateDisplay();
    }

    initializeElements() {
        this.tokenBalance = document.getElementById('tokenBalance');
        this.betAmount = document.getElementById('betAmount');
        this.betHeads = document.getElementById('betHeads');
        this.betTails = document.getElementById('betTails');
        this.result = document.getElementById('result');
        this.history = document.getElementById('history');
        this.gamesPlayedEl = document.getElementById('gamesPlayed');
        this.winsEl = document.getElementById('wins');
        this.winRateEl = document.getElementById('winRate');
    }

    attachEventListeners() {
        this.betHeads.addEventListener('click', () => this.placeBet('heads'));
        this.betTails.addEventListener('click', () => this.placeBet('tails'));
    }

    placeBet(choice) {
        const betAmount = parseFloat(this.betAmount.value);

        if (!this.validateBet(betAmount)) {
            return;
        }

        this.gamesPlayed++;
        const won = this.determineOutcome(choice);

        if (won) {
            this.tokens += betAmount;
            this.wins++;
            this.showResult(`🎉 WIN! You gained ${betAmount.toFixed(2)} tokens!`, 'win');
        } else {
            this.tokens -= betAmount;
            this.showResult(`💔 LOSS! You lost ${betAmount.toFixed(2)} tokens!`, 'lose');
        }

        this.addToHistory(choice, betAmount, won);
        this.updateDisplay();

        if (this.tokens <= 0) {
            this.gameOver();
        }
    }

    validateBet(amount) {
        if (isNaN(amount) || amount <= 0) {
            this.showResult('❌ Please enter a valid bet amount greater than 0!', 'error');
            return false;
        }

        if (amount > this.tokens) {
            this.showResult('❌ You don\'t have enough tokens for that bet!', 'error');
            return false;
        }

        return true;
    }

    determineOutcome(choice) {
        // Generate a random number between 0 and 1
        const random = Math.random();

        if (choice === 'heads') {
            // Player chose heads (win option) - 50.001% chance to win
            return random < 0.50001;
        } else {
            // Player chose tails (lose option) - 49.999% chance to win
            return random < 0.49999;
        }
    }

    showResult(message, type) {
        this.result.textContent = message;
        this.result.className = 'result-display';

        if (type === 'win') {
            this.result.classList.add('win-message');
        } else if (type === 'lose') {
            this.result.classList.add('lose-message');
        }

        // Clear result after 3 seconds
        setTimeout(() => {
            this.result.textContent = '';
            this.result.className = 'result-display';
        }, 3000);
    }

    addToHistory(choice, amount, won) {
        const timestamp = new Date().toLocaleTimeString();
        const result = won ? 'WIN' : 'LOSS';
        const choiceText = choice === 'heads' ? 'Heads (Win)' : 'Tails (Lose)';

        const historyItem = document.createElement('div');
        historyItem.innerHTML = `
            <strong>${timestamp}</strong> | ${choiceText} | Bet: ${amount.toFixed(2)} | ${result}
            ${won ? `<span style="color: #00ff88;">+${amount.toFixed(2)}</span>` : `<span style="color: #ff4444;">-${amount.toFixed(2)}</span>`}
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
        this.betHistory.forEach(item => {
            this.history.appendChild(item);
        });
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