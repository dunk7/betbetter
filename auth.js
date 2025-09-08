// Google Authentication Handler
class AuthManager {
    constructor() {
        this.user = null;
        this.isAuthenticated = false;
        this.token = null;
        // Use environment-appropriate API base URL
        this.apiBase = this.getApiBaseUrl();
        this.init();
    }

    getApiBaseUrl() {
        const host = window.location.hostname;
        const isLocal = host === 'localhost' || host === '127.0.0.1';
        // Local development hits Express API
        if (isLocal) return 'http://localhost:5000/api';
        // Production/staging: use site-relative Netlify Functions (works with custom domains and netlify.app)
        return '/.netlify/functions';
    }

    // Map function-style endpoints to Express routes when running locally
    resolveApi(path) {
        const base = this.apiBase;
        if (base.includes('localhost:5000')) {
            const mapping = {
                'auth-google': 'auth/google',
                'user-profile': 'user/profile',
                'user-stats': 'user/stats'
            };
            const mapped = mapping[path] || path;
            return `${base}/${mapped}`;
        }
        return `${base}/${path}`;
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initUI());
        } else {
            this.initUI();
        }
    }

    initUI() {
        // Initialize UI elements
        this.userInfo = document.getElementById('user-info');
        this.loginSection = document.getElementById('login-section');
        this.userAvatar = document.getElementById('user-avatar');
        this.userName = document.getElementById('user-name');
        this.logoutBtn = document.getElementById('logout-btn');

        // Check if elements exist before adding event listeners
        if (this.logoutBtn) {
            this.logoutBtn.addEventListener('click', () => this.logout());
        }

        // Check for existing session
        this.checkExistingSession();

        // Update UI if user is already authenticated
        if (this.isAuthenticated && this.user) {
            this.updateUI();
        }
    }

    checkExistingSession() {
        const token = localStorage.getItem('auth_token');
        const userData = localStorage.getItem('user_data');

        if (token && userData) {
            this.token = token;
            const parsedUserData = JSON.parse(userData);
            console.log(`🔍 [SESSION] Loading user data from localStorage:`);
            console.log(`   - name: ${parsedUserData.name}`);
            console.log(`   - email: ${parsedUserData.email}`);
            console.log(`   - solanaAddress: ${parsedUserData.solanaAddress}`);
            console.log(`   - solanaAddress type: ${typeof parsedUserData.solanaAddress}`);

            this.user = parsedUserData;
            this.isAuthenticated = true;

            // Verify token is still valid and load profile data
            this.verifyToken();

            // Load user profile data (including wallet address) on page load
            this.loadUserProfile();

            // Update UI only if elements are available
            if (this.userInfo) {
                this.updateUI();
            }
        }
    }

    async verifyToken() {
        try {
            const response = await fetch(this.resolveApi('user-profile'), {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (!response.ok) {
                // Token is invalid, logout
                this.logout();
            }
        } catch (error) {
            console.error('Token verification failed:', error);
            this.logout();
        }
    }

    async handleCredentialResponse(response) {
        try {
            // Send Google token to backend for verification and user creation
            const backendResponse = await fetch(this.resolveApi('auth-google'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    token: response.credential
                })
            });

            if (!backendResponse.ok) {
                throw new Error('Backend authentication failed');
            }

            const data = await backendResponse.json();

            // Store backend token and user data
            this.token = data.token;
            this.user = data.user;

            console.log(`🔍 [LOGIN] Storing user data in localStorage:`);
            console.log(`   - name: ${this.user.name}`);
            console.log(`   - email: ${this.user.email}`);
            console.log(`   - solanaAddress: ${this.user.solanaAddress}`);
            console.log(`   - solanaAddress type: ${typeof this.user.solanaAddress}`);

            localStorage.setItem('auth_token', this.token);
            localStorage.setItem('user_data', JSON.stringify(this.user));

            this.isAuthenticated = true;
            this.updateUI();

            // Immediately load user profile data to enable betting
            await this.loadUserProfile();

            // Notify other components
            this.onLoginSuccess();

        } catch (error) {
            console.error('Authentication error:', error);
            this.showError('Authentication failed. Please try again.');
        }
    }

    decodeJwtResponse(token) {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    }

    updateUI() {
        if (this.isAuthenticated && this.user) {
            // Show user info
            this.userInfo.style.display = 'flex';
            this.loginSection.style.display = 'none';

            // Update user details
            this.userAvatar.style.backgroundImage = `url(${this.user.picture})`;
            this.userAvatar.style.backgroundSize = '150%';
            this.userAvatar.style.backgroundPosition = 'center';
            this.userAvatar.style.backgroundRepeat = 'no-repeat';
            this.userName.textContent = this.user.name;

            // Show wallet section for authenticated users
            const walletSection = document.getElementById('wallet-section');
            if (walletSection) {
                walletSection.style.display = 'block';
            }
        } else {
            // Show login
            this.userInfo.style.display = 'none';
            this.loginSection.style.display = 'block';

            // Hide wallet section
            const walletSection = document.getElementById('wallet-section');
            if (walletSection) {
                walletSection.style.display = 'none';
            }
        }
    }

    logout() {
        // Clear local storage
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user_data');

        // Reset state
        this.user = null;
        this.token = null;
        this.isAuthenticated = false;

        // Update UI
        this.updateUI();

        // Notify other components
        this.onLogout();

        // Reload page to reset game state
        location.reload();
    }

    async loadUserProfile() {
        try {
            const response = await fetch(this.resolveApi('user-profile'), {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const userData = await response.json();
                console.log(`✅ [AUTH] Loaded user profile: ${userData.gameBalance} tokens, ${userData.usdcBalance} USDC`);

                // Store updated user data
                this.userData = userData;

                // Notify game manager about user balance
                if (window.gameInstance) {
                    window.gameInstance.tokens = parseFloat(userData.gameBalance) || 0;
                    window.gameInstance.updateDisplay();
                    window.gameInstance.checkBettingAvailability();
                }

                // Notify solana manager about user data
                if (window.solanaManager) {
                    console.log(`🔄 [AUTH] Updating solana manager with profile data`);
                    console.log(`🔑 [AUTH] Profile data received:`);
                    console.log(`   - gameBalance: ${userData.gameBalance}`);
                    console.log(`   - usdcBalance: ${userData.usdcBalance}`);
                    console.log(`   - solanaAddress: ${userData.solanaAddress}`);
                    console.log(`   - withdrawAddress: ${userData.withdrawAddress}`);
                    console.log(`   - solanaAddress type: ${typeof userData.solanaAddress}`);
                    console.log(`   - solanaAddress is null: ${userData.solanaAddress === null}`);
                    console.log(`   - solanaAddress is undefined: ${userData.solanaAddress === undefined}`);

                    window.solanaManager.gameBalance = parseFloat(userData.gameBalance) || 0;
                    window.solanaManager.userBalance = parseFloat(userData.usdcBalance) || 0;
                    window.solanaManager.userWalletAddress = userData.solanaAddress;
                    window.solanaManager.userWithdrawAddress = userData.withdrawAddress || null;
                    console.log(`🔑 [AUTH] Setting wallet address: ${userData.solanaAddress}`);
                    console.log(`⚙️  [AUTH] Setting withdraw address: ${userData.withdrawAddress}`);
                    console.log(`🔄 [AUTH] Solana manager wallet address set to: ${window.solanaManager.userWalletAddress}`);

                    // Update header wallet display immediately
                    window.solanaManager.updateHeaderWalletDisplay();

                    window.solanaManager.updateWalletUI();
                }

                return userData;
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.error(`Failed to load user profile: ${response.status} - ${errorData.error || 'Unknown error'}`);

                // If profile load fails, clear wallet address to force manual verification
                if (window.solanaManager) {
                    window.solanaManager.userWalletAddress = null;
                    window.solanaManager.userWithdrawAddress = null;
                    console.log(`🔄 [AUTH] Cleared wallet and withdraw address due to profile load failure`);
                }

                return null;
            }
        } catch (error) {
            console.error('Error loading user profile:', error);

            // If network error occurs, clear wallet address to force manual verification
            if (window.solanaManager) {
                window.solanaManager.userWalletAddress = null;
                window.solanaManager.userWithdrawAddress = null;
                console.log(`🔄 [AUTH] Cleared wallet and withdraw address due to network error`);
            }

            return null;
        }
    }

    onLoginSuccess() {
        // Notify other components about successful login
        if (window.solanaManager) {
            window.solanaManager.onUserLogin(this.user);
        }
    }

    onLogout() {
        // Notify other components about logout
        if (window.solanaManager) {
            window.solanaManager.onUserLogout();
        }
    }

    showError(message) {
        // Create error notification
        const errorDiv = document.createElement('div');
        errorDiv.className = 'auth-error';
        errorDiv.textContent = message;
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff4444;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(255, 68, 68, 0.3);
            z-index: 10000;
            animation: slideIn 0.3s ease-out;
        `;

        document.body.appendChild(errorDiv);

        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }
}

// Global Google OAuth handler
function handleCredentialResponse(response) {
    if (window.authManager) {
        window.authManager.handleCredentialResponse(response);
    }
}

// Initialize auth manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
});