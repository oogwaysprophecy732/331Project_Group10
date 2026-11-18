#!/bin/zsh
# Starts GreyMatter securely for this Mac and devices on the local network.
set -eu

cd "$(dirname "$0")"

local_ip="$(ifconfig en0 2>/dev/null | awk '$1 == "inet" { print $2; exit }')"
local_hostname="$(scutil --get LocalHostName 2>/dev/null || hostname -s)"
local_address="${local_hostname}.local"

if [[ -z "$local_ip" ]]; then
  print "Could not find the Mac's Wi-Fi address. Connect to Wi-Fi, then try again."
  exit 1
fi

certificate="greymatter-local.pem"
private_key="greymatter-local-key.pem"

if ! command -v mkcert >/dev/null 2>&1; then
  print "mkcert is required to make the local HTTPS certificate. Install it, then try again."
  exit 1
fi

print "Creating/updating the local HTTPS certificate…"
mkcert -cert-file "$certificate" -key-file "$private_key" \
  "$local_address" "$local_ip" localhost 127.0.0.1

print "GreyMatter is available at https://${local_address}:8000"
print "On this Wi-Fi, you can also use https://${local_ip}:8000"
print "Leave this Terminal window open while using GreyMatter. Press Control-C to stop it."

exec ./venv/bin/uvicorn main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --ssl-certfile "$certificate" \
  --ssl-keyfile "$private_key"
