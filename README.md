# BetBetter - The Slightly Advantageous Betting Game

A simple web-based betting game where the odds are ever so slightly in your favor!

## Features

- **Starting Balance**: 50.00 tokens
- **House Edge**: 49.999% (you have 50.001% advantage when choosing "Heads")
- **Game Mechanics**:
  - Choose "Heads (Win)" for 50.001% chance to win
  - Choose "Tails (Lose)" for 49.999% chance to win
  - Win = double your bet amount
  - Loss = lose your bet amount
- **Statistics Tracking**: Games played, wins, and win rate
- **Bet History**: Last 10 bets with timestamps
- **Visual Feedback**: Color-coded results and animations

## How to Play

1. Enter your bet amount (must be ≤ your current token balance)
2. Choose "Heads (Win)" for slightly better odds (50.001%)
3. Choose "Tails (Lose)" for slightly worse odds (49.999%)
4. Watch your balance and statistics update in real-time
5. Game ends when you run out of tokens

## Technical Details

- Built with vanilla HTML, CSS, and JavaScript
- No external dependencies required
- Responsive design
- Modern UI with glassmorphism effects

## Running the Game

1. Clone or download the project
2. Open `index.html` in your web browser
3. Or run a local server: `python3 -m http.server 8000`
4. Visit `http://localhost:8000`

## Strategy Note

While the odds are technically in your favor when choosing "Heads", remember that gambling is inherently risky. The advantage is so slight (0.001%) that it may take thousands of games to see a meaningful difference over the house edge.