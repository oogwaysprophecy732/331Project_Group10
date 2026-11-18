#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v docker >/dev/null 2>&1; then
  echo "Install Docker Engine and the Docker Compose plugin first." >&2
  exit 1
fi
read -r -p "DuckDNS hostname (example: my-greymatter.duckdns.org): " domain
if [[ ! "$domain" =~ ^[A-Za-z0-9.-]+\.duckdns\.org$ ]]; then
  echo "Enter a DuckDNS hostname ending in .duckdns.org." >&2
  exit 1
fi
read -r -p "Login username (letters, numbers, dot, underscore, hyphen): " username
if [[ ! "$username" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "Use only letters, numbers, dot, underscore, or hyphen in the username." >&2
  exit 1
fi
read -r -s -p "Choose a strong GreyMatter password: " password
printf '\n'
if (( ${#password} < 14 )); then
  echo "Use a password with at least 14 characters." >&2
  exit 1
fi
read -r -s -p "Enter it again: " password_confirm
printf '\n'
if [[ "$password" != "$password_confirm" ]]; then
  echo "The passwords did not match." >&2
  exit 1
fi
hash="$(docker run --rm caddy:2-alpine caddy hash-password --plaintext "$password")"
unset password password_confirm
escaped_hash="${hash//\$/\$\$}"
umask 077
cat > .env <<ENVEOF
GREYMATTER_DOMAIN=$domain
GREYMATTER_USERNAME=$username
GREYMATTER_PASSWORD_HASH=$escaped_hash
ENVEOF
unset hash escaped_hash
mkdir -p data/music data/artwork
if [[ ! -e data/music.db ]]; then touch data/music.db; fi
echo "Private login saved in deploy/oracle-cloud/.env (permissions restricted)."
echo "Next: copy your music, artwork, and backend/music.db into deploy/oracle-cloud/data/."
