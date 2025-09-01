#!/bin/bash

# BetBetter Startup Script
echo "🎰 Starting BetBetter Casino Game..."
echo "====================================="

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create a .env file with your configuration."
    echo "See environment-setup.md for details."
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start backend server in background
echo "🚀 Starting backend server on port 5000..."
npm run dev &
BACKEND_PID=$!

# Wait a moment for backend to start
sleep 3

# Start frontend server
echo "🎮 Starting frontend server on port 3000..."
npx live-server --port=3000 --host=0.0.0.0 --no-browser &
FRONTEND_PID=$!

echo ""
echo "✅ Servers started successfully!"
echo "================================="
echo "🎯 Frontend: http://127.0.0.1:3000"
echo "🔧 Backend:  http://localhost:5000"
echo ""
echo "📝 To stop servers: Press Ctrl+C"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down servers..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "✅ All servers stopped. Goodbye!"
    exit 0
}

# Set trap to cleanup on Ctrl+C
trap cleanup SIGINT SIGTERM

# Wait for processes
wait