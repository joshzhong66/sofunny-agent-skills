#!/bin/bash
# HappyHorse Video Generation Script (Bash)
# Usage: ./generate-video.sh --api-key "sk-xxx" --prompt "your prompt"

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_PATH="$SCRIPT_DIR/generate-video.js"

# Check if node is available
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is required but not installed."
    exit 1
fi

# Pass all arguments to the Node.js script
node "$SCRIPT_PATH" "$@"
