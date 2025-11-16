#!/usr/bin/env bash
# chmod +x is recommended after checkout if needed
set -euo pipefail

# Check venv availability (Debian/Ubuntu may need python3-venv)
if ! python3 -c "import venv" >/dev/null 2>&1; then
	echo "[!] Python venv module not found. On Debian/Ubuntu, install it first:"
	echo "    sudo apt-get update && sudo apt-get install -y python3-venv"
	exit 1
fi

# Create venv
python3 -m venv .venv
source .venv/bin/activate

# Upgrade pip and install reqs
python -m pip install --upgrade pip
pip install -r scripts/requirements.txt

# Install Playwright browsers
python -m playwright install --with-deps

echo "Setup complete. Activate with: source .venv/bin/activate"
