#!/usr/bin/env bash
# demo.sh
# Starts the dashboard for a demo, using the committed results
# (frontend/public/data/results.json). It does NOT run the benchmark sweep.
#
#   1. checks that Node.js and npm are installed;
#   2. installs the frontend dependencies if they are missing;
#   3. prints the two URLs and starts the development server
#      (stop it with Ctrl+C).
#
# Usage:  scripts/demo.sh
#
# Owner: Person B.

set -euo pipefail

# Always work from the repository root, wherever the script is called from.
cd "$(dirname "$0")/.."

if ! command -v npm > /dev/null; then
    echo "Error: npm not found. Install Node.js 20.19 or newer (see README)." >&2
    exit 1
fi

# node_modules is missing on a fresh clone: install once.
if [ ! -d frontend/node_modules ]; then
    echo "Installing the frontend dependencies (first run only)..."
    npm --prefix frontend install
fi

PORT=5173
echo ""
echo "Dashboard starting. Open in a browser:"
echo "  Results (measured data):     http://localhost:$PORT/#/results"
echo "  Simulator (illustration):    http://localhost:$PORT/#/simulator"
echo "Stop with Ctrl+C."
echo ""

# --strictPort: fail instead of silently using another port, so the URLs
# above are always right. "exec" lets Ctrl+C stop the server directly.
exec npm --prefix frontend run dev -- --port "$PORT" --strictPort
