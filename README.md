# 🎰 BetBetter - Premium Casino Game with Google OAuth & Solana Integration

A sophisticated betting game featuring 3D dice animation, Google authentication, and Solana blockchain integration for secure deposits and withdrawals.

## ✨ Features

- 🎮 **3D Dice Animation** - Smooth 60 FPS rotating dice with customizable speed
- 🔐 **Google OAuth** - Secure user authentication with Google accounts
- 💰 **Solana Integration** - Real cryptocurrency deposits and withdrawals
- 📊 **Transaction History** - Complete record of all user transactions
- 🎨 **Polished UI** - Glassmorphism design with responsive layout
- 🗄️ **MongoDB Backend** - Persistent user data and transaction storage
- 🚀 **Real-time Updates** - Live balance synchronization

## 🏗️ Architecture

### Frontend
- **HTML5/CSS3** - Modern responsive design
- **Vanilla JavaScript** - No frameworks for optimal performance
- **Three.js** - 3D dice rendering and animation
- **Google Identity Services** - OAuth authentication
- **Solana Web3.js** - Blockchain integration

### Backend
- **Node.js + Express** - RESTful API server
- **MongoDB** - User data and transaction storage
- **JWT Authentication** - Secure token-based auth
- **Solana Integration** - Real-time balance checking

## 🚀 Quick Start

### Prerequisites
- Node.js (v16+)
- MongoDB (local or Atlas)
- Google Cloud Console account
- Solana wallet (Phantom recommended)

### 1. Clone & Install
```bash
git clone <your-repo-url>
cd betbetter
npm install
```

### 2. Environment Setup
Create a `.env` file in the root directory:
```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id_here

# JWT Secret for token signing
JWT_SECRET=your_super_secret_jwt_key_here

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/betbetter

# Solana Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Server Configuration
PORT=5000
```

### 3. Google OAuth Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable "Google+ API" and "Google Identity Services API"
4. Create OAuth 2.0 credentials
5. Add your domain to authorized origins:
   - Development: `http://127.0.0.1:3000`
   - Production: Your actual domain
6. Copy Client ID to `.env` file

### 4. MongoDB Setup
**Option A: Local MongoDB**
```bash
# Install MongoDB locally
sudo apt-get install mongodb  # Ubuntu/Debian
# or
brew install mongodb          # macOS

# Start MongoDB
mongod
```

**Option B: MongoDB Atlas (Cloud)**
1. Create account at [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a free cluster
3. Get connection string and update `MONGODB_URI`

### 5. Start the Application

**Terminal 1: Start Backend**
```bash
npm run dev
# Server will run on http://localhost:5000
```

**Terminal 2: Start Frontend**
```bash
npx live-server --port=3000 --host=0.0.0.0 --no-browser
# Frontend will run on http://127.0.0.1:3000
```

### 6. Access the Game
Open your browser and navigate to: `http://127.0.0.1:3000`

## 🎮 How to Play

1. **Sign In** - Click the Google sign-in button
2. **Connect Wallet** - Connect your Solana wallet (Phantom)
3. **Deposit SOL** - Convert SOL to game tokens (1 SOL = 100 tokens)
4. **Place Bets** - Enter bet amount and click "PLACE BET"
5. **Watch Results** - Enjoy the 3D dice animation
6. **Withdraw** - Convert tokens back to SOL anytime

## 💡 Game Rules

- **Win Rate**: 50.001% (slight mathematical advantage)
- **Payout**: 1:1 (win your bet amount)
- **Exchange Rate**: 1 SOL = 100 game tokens
- **Minimum Bet**: 0.01 tokens
- **House Edge**: 0.001% (very player-friendly!)

## 🛠️ API Endpoints

### Authentication
- `POST /api/auth/google` - Google OAuth login
- `GET /api/user/profile` - Get user profile and balances

### Wallet Operations
- `POST /api/deposit` - Deposit SOL for game tokens
- `POST /api/withdraw` - Withdraw game tokens to SOL
- `GET /api/transactions` - Get transaction history

### Game Operations
- `POST /api/game/update-balance` - Update balance after bets

### Health Check
- `GET /api/health` - Server health status

## 🔧 Configuration Options

### Dice Animation Speed
Edit `dice3d.js` lines 456-460:
```javascript
const baseSpeeds = {
    group: { x: 0.045, y: 0.03 },    // Adjust rotation speeds
    outer: { x: 0.075, y: 0.045, z: 0.015 },
    inner: { x: 0.12, y: 0.09, z: 0.06 }
};
```

### Roll Duration
Edit `dice3d.js` line 380:
```javascript
const duration = 2200; // Roll animation duration in milliseconds
```

### Exchange Rate
Edit `server.js` lines 261 and 308:
```javascript
const gameTokens = amount * 100; // 1 SOL = 100 tokens
```

## 🚀 Production Deployment

### Backend Deployment
```bash
# Set production environment
NODE_ENV=production

# Use PM2 for process management
npm install -g pm2
pm2 start server.js --name betbetter-backend
```

### Frontend Deployment
- Deploy static files to any web server (Netlify, Vercel, etc.)
- Update API_BASE URL in frontend code
- Configure HTTPS for security

### Environment Variables for Production
```env
NODE_ENV=production
GOOGLE_CLIENT_ID=your_production_client_id
MONGODB_URI=your_production_mongodb_uri
JWT_SECRET=your_secure_production_jwt_secret
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

## 🔒 Security Features

- **JWT Authentication** - Secure token-based authentication
- **Google OAuth** - Industry-standard authentication
- **Input Validation** - All user inputs validated
- **Rate Limiting** - Protection against abuse
- **CORS Configuration** - Proper cross-origin handling
- **HTTPS Required** - Encrypted communication

## 🐛 Troubleshooting

### Common Issues

**Google OAuth not working:**
- Check Client ID in `.env` file
- Verify authorized domains in Google Cloud Console
- Ensure HTTPS in production

**MongoDB connection failed:**
- Check MongoDB is running locally
- Verify connection string in `.env`
- Check firewall settings

**Solana wallet not connecting:**
- Ensure Phantom wallet is installed
- Check Solana network settings
- Verify wallet permissions

**Dice animation not smooth:**
- Check browser performance
- Reduce animation complexity if needed
- Update graphics drivers

## 📈 Performance Optimization

- **60 FPS Animation** - Optimized for smooth gameplay
- **Lazy Loading** - Components load only when needed
- **Caching** - Static assets cached for faster loading
- **Compression** - Gzip compression for faster transfers
- **CDN Ready** - Assets optimized for CDN delivery

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - feel free to use this project for your own casino games!

## 🎉 Support

For support or questions:
- Create an issue on GitHub
- Check the troubleshooting section
- Review the API documentation

---

**Happy Gaming! 🎰✨**

Built with ❤️ using cutting-edge web technologies.