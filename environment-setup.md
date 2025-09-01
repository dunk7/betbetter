# Environment Setup Guide

## Required Environment Variables

Create a `.env` file in the root directory with the following variables:

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

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. MongoDB Setup
- Install MongoDB locally or use MongoDB Atlas (cloud)
- Update MONGODB_URI in .env file

### 3. Google OAuth Setup
- Go to Google Cloud Console
- Create OAuth 2.0 credentials
- Add your domain to authorized origins
- Copy Client ID to GOOGLE_CLIENT_ID

### 4. Generate JWT Secret
```bash
# Generate a secure random string
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 5. Start the Server
```bash
npm run dev  # For development with auto-restart
# or
npm start    # For production
```

## Frontend Configuration

Update your frontend API calls to point to the backend:

```javascript
const API_BASE = 'http://localhost:5000/api';
```

## Production Deployment

For production, make sure to:
- Set NODE_ENV=production
- Use HTTPS for all requests
- Configure proper CORS origins
- Set up proper logging
- Use environment-specific configurations