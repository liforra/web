#!/usr/bin/env bash

# Export environment variables safely
set -o allexport
source dev.env
set +o allexport

# Start Tailwind in the background
npx @tailwindcss/cli -i ./pretail-styles.css -o ./public/styles.css --watch --minify &

echo "Hi"

# Run app.js with nodemon if available, fallback to node
if command -v nodemon >/dev/null 2>&1; then
    nodemon ./app.js
else
    node ./app.js
fi
