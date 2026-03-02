#!/bin/bash
set -e

# Strict input validation to prevent command injection
COMPONENT="$1"

# Whitelist validation
case "$COMPONENT" in
    qemu|docker)
        # Valid component
        ;;
    "")
        echo "Error: No component specified"
        echo "Usage: $0 {qemu|docker}"
        exit 1
        ;;
    *)
        echo "Error: Invalid component '$COMPONENT'"
        echo "Supported components: qemu, docker"
        exit 1
        ;;
esac

echo "Installing component: $COMPONENT"

case "$COMPONENT" in
    qemu)
        echo "Checking for Homebrew..."
        if ! command -v brew &> /dev/null; then
            echo "Error: Homebrew is not installed. Please install Homebrew first:"
            echo "/bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
            exit 1
        fi
        
        echo "Installing QEMU via Homebrew..."
        if ! brew install qemu; then
            echo "Error: Failed to install QEMU via Homebrew"
            exit 1
        fi
        
        echo "Verifying QEMU installation..."
        if command -v qemu-system-aarch64 &> /dev/null; then
            echo "QEMU installed successfully!"
            qemu-system-aarch64 --version
        else
            echo "Error: QEMU installation failed"
            exit 1
        fi
        ;;
        
    docker)
        echo "Checking for Docker..."
        if command -v docker &> /dev/null; then
            echo "Docker is already installed"
            docker --version
            exit 0
        fi
        
        echo "Docker installation requires manual setup."
        echo "Please install one of the following:"
        echo "  1. Docker Desktop: https://www.docker.com/products/docker-desktop"
        echo "  2. OrbStack (recommended): https://orbstack.dev"
        echo "  3. Colima: brew install colima"
        exit 1
        ;;
esac

echo "Installation complete!"
