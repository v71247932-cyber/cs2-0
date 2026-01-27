#!/bin/bash
cd "$(dirname "$0")"
echo "Starting FPS Game Server..."
# Kill any existing server on port 8000 just in case
lsof -ti:8000 | xargs kill -9 2>/dev/null

python3 -m http.server 8000 &
SERVER_PID=$!

echo "Server started with PID $SERVER_PID"
echo "Opening Browser..."
sleep 1
open "http://localhost:8000"

echo "Press CTRL+C to stop the server and close this window."
wait $SERVER_PID
