#!/bin/bash

# Define the URL and the global key path
KEY_URL="https://liforra.de/sshkeys.pub"
GLOBAL_KEY_DIR="/etc/ssh/global_keys"
GLOBAL_KEY_FILE="$GLOBAL_KEY_DIR/authorized_keys"
SSHD_CONFIG="/etc/ssh/sshd_config"

echo "--- Starting SSH Configuration ---"

# 1. Ensure the global keys directory exists
sudo mkdir -p "$GLOBAL_KEY_DIR"

# 2. Download the public key
echo "Downloading keys from $KEY_URL..."
sudo curl -sSL "$KEY_URL" -o "$GLOBAL_KEY_FILE"

# 3. Set strict permissions (SSH will ignore keys with loose permissions)
sudo chmod 700 "$GLOBAL_KEY_DIR"
sudo chmod 644 "$GLOBAL_KEY_FILE"

# 4. Update sshd_config
echo "Configuring sshd_config..."

# Function to update or add config lines
update_config() {
  local key=$1
  local value=$2
  if grep -q "^#*$key" "$SSHD_CONFIG"; then
    sudo sed -i "s|^#*$key.*|$key $value|" "$SSHD_CONFIG"
  else
    echo "$key $value" | sudo tee -a "$SSHD_CONFIG" >/dev/null
  fi
}

# Apply the specific requirements
update_config "Port" "22"
update_config "ListenAddress" "0.0.0.0"
update_config "PubkeyAuthentication" "yes"
update_config "PasswordAuthentication" "no"
# This line tells SSH to look at the user's local keys AND our global file
update_config "AuthorizedKeysFile" ".ssh/authorized_keys $GLOBAL_KEY_FILE"

# 5. Restart SSH service
echo "Restarting SSH service..."
if command -v systemctl >/dev/null; then
  sudo systemctl restart ssh || sudo systemctl restart sshd
else
  # Fallback for Termux or non-systemd environments
  pkill sshd && sshd
fi

echo "--- Configuration Complete ---"
echo "Check: Password auth is OFF, Pubkey auth is ON, and Global Key is active."
