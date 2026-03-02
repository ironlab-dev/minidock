#!/bin/bash

set -e

echo "🚀 Starting MiniDock Setup..."

# 1. Check for Homebrew
if ! command -v brew &> /dev/null; then
    echo "🍺 Homebrew not found. Installing..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
else
    echo "✅ Homebrew is already installed."
fi

# 2. Install System Dependencies
echo "📦 Installing system dependencies via Homebrew..."
brew update
brew install swift-format node qemu colima docker

# 3. Backend Setup
echo "🏗️  Setting up Backend..."
if [ -d "backend" ]; then
    cd backend
    swift build
    cd ..
else
    echo "⚠️  Backend directory not found."
fi

# 4. Frontend Setup
echo "🌐 Setting up Frontend..."
if [ -d "web" ]; then
    cd web
    npm install
    cd ..
else
    echo "⚠️  Web directory not found."
fi

echo ""
echo "✨ Setup Complete!"
echo "------------------------------------------------"
echo "👉 To start MiniDock in development mode:"
echo "   ./dev.sh"
echo ""
echo "👉 To stop all instances:"
echo "   ./stop.sh"
echo "------------------------------------------------"
