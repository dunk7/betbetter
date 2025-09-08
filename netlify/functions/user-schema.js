// Shared User Schema for all Netlify functions
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  name: String,
  picture: String,
  solanaAddress: String,
  // Address the user wants to receive withdrawals to (personal wallet)
  withdrawAddress: String,
  // Flag indicating first deposit came from an exchange-managed wallet
  isExchangeWallet: { type: Boolean, default: false },
  gameBalance: { type: Number, default: 0 },
  usdcBalance: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  lastLogin: { type: Date, default: Date.now }
});

// Prevent model recompilation
let User;
try {
  User = mongoose.model('User');
} catch (error) {
  User = mongoose.model('User', userSchema);
}

module.exports = User;