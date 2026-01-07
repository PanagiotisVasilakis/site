#!/usr/bin/env bash
set -euo pipefail

# Project root
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# Create virtual environment if missing
if [ ! -d ".venv" ]; then
  echo "Creating virtual environment..."
  python3 -m venv .venv
else
  echo "Virtual environment already exists."
fi

# Activate venv
# shellcheck source=/dev/null
source .venv/bin/activate

# Ensure pip is available
if ! command -v pip >/dev/null 2>&1; then
  echo "pip not found, installing via get-pip..."
  curl -sS https://bootstrap.pypa.io/get-pip.py -o get-pip.py
  python get-pip.py
  rm -f get-pip.py
fi

# Upgrade pip and install requirements
if [ -f "requirements.txt" ]; then
  echo "Installing Python dependencies..."
  pip install --upgrade pip setuptools wheel
  pip install -r requirements.txt
else
  echo "No requirements.txt found. Skipping Python deps installation."
fi

echo "Setup complete. Activate with: source .venv/bin/activate"
