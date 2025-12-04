#!/usr/bin/env bash
eval export $(cat dev.env)

npx @tailwindcss/cli -i ./pretail-styles.css -o ./public/styles.css --watch --minify &
echo "Hi"

if whereis nodemon; then
	nodemon ./app.js
else
	node ./app.js
fi
