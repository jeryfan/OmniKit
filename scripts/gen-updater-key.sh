#!/usr/bin/env bash
# Generate a new Tauri updater key pair and update tauri.conf.json
set -euo pipefail

CONF="$(dirname "$0")/../src-tauri/tauri.conf.json"
KEY_FILE="$HOME/.tauri/omnikit.key"

# Prompt for password
read -r -s -p "Enter key password (leave empty for no password): " PASSWORD
echo
if [ -n "$PASSWORD" ]; then
  read -r -s -p "Confirm password: " PASSWORD2
  echo
  if [ "$PASSWORD" != "$PASSWORD2" ]; then
    echo "Passwords do not match." >&2
    exit 1
  fi
fi

# Generate key pair
echo "Generating key pair..."
if [ -n "$PASSWORD" ]; then
  npx tauri signer generate -w "$KEY_FILE" --force --password "$PASSWORD"
else
  npx tauri signer generate -w "$KEY_FILE" --force --ci
fi

PRIVATE_KEY=$(cat "$KEY_FILE")
PUBLIC_KEY=$(cat "${KEY_FILE}.pub")

# Update pubkey in tauri.conf.json
NEW_PUBKEY=$(echo "$PUBLIC_KEY" | tr -d '\n')
python3 - <<PYEOF
import json, sys

with open("$CONF") as f:
    conf = json.load(f)

conf["plugins"]["updater"]["pubkey"] = "$NEW_PUBKEY"

with open("$CONF", "w") as f:
    json.dump(conf, f, indent=2, ensure_ascii=False)
    f.write("\n")

print("Updated pubkey in $CONF")
PYEOF

# Print instructions
echo
echo "========================================"
echo "Key pair generated successfully."
echo "========================================"
echo
echo "Set the following GitHub repository secrets:"
echo "  Settings -> Secrets and variables -> Actions -> Repository secrets"
echo
echo "Secret name : TAURI_SIGNING_PRIVATE_KEY"
echo "Secret value:"
echo "$PRIVATE_KEY"
echo
if [ -n "$PASSWORD" ]; then
  echo "Secret name : TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
  echo "Secret value: $PASSWORD"
  echo
fi
echo "Key file saved to: $KEY_FILE"
echo "Keep it safe — losing it means future updates cannot be signed."
