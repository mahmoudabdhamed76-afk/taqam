#!/bin/sh
cd "$(dirname "$0")"
PORT=${PORT:-8080} exec node --no-warnings server.js
