#!/usr/bin/env bash
set -euo pipefail

# Setup inside the kasse-dev WSL distro (not Ubuntu-BTP-CI).
export DEBIAN_FRONTEND=noninteractive

if [[ "$(id -u)" -eq 0 ]]; then
  apt-get update
  apt-get install -y --no-install-recommends \
    ca-certificates curl git unzip xz-utils python3 build-essential
  if ! id -u kasse >/dev/null 2>&1; then
    useradd -m -s /bin/bash -G sudo kasse
    echo 'kasse ALL=(ALL) NOPASSWD:ALL' >/etc/sudoers.d/kasse
    chmod 440 /etc/sudoers.d/kasse
  fi
  install -d -o kasse -g kasse /home/kasse
  printf '[user]\ndefault=kasse\n' >/etc/wsl.conf
  exec su - kasse -c "bash '$0'"
fi

export NVM_DIR="$HOME/.nvm"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi
# shellcheck disable=SC1090
. "$NVM_DIR/nvm.sh"
nvm install 22
nvm alias default 22

node -v
npm -v
git --version

echo
echo "kasse-dev ist bereit. Projekt:"
echo "  cd '/mnt/c/Selling App/kasse' && npm start"
