#!/usr/bin/env bash
# One-time setup of a fresh Lightsail Ubuntu 24.04 instance for the MTC portal.
#
# Usage (as the default `ubuntu` user, e.g. in Lightsail's browser SSH):
#   copy this file to the instance as bootstrap.sh (see docs/SETUP.md), then
#   sudo bash bootstrap.sh <site-domain> "<deploy public key>"
#
#   <site-domain>        e.g. mtc-demo.example.mu (its DNS A record must point here)
#   <deploy public key>  the PUBLIC half of the key GitHub Actions uses to deploy
#
# Safe to run again: existing users, keys and the .env file are kept.
set -euo pipefail

SITE_DOMAIN="${1:-}"
DEPLOY_PUBKEY="${2:-}"
APP_DIR=/opt/mtc
DEPLOY_USER=deploy

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo." >&2; exit 1
fi
if [[ -z "$SITE_DOMAIN" || -z "$DEPLOY_PUBKEY" ]]; then
  echo "Usage: sudo bash bootstrap.sh <site-domain> \"<deploy public key>\"" >&2; exit 1
fi
if [[ "$DEPLOY_PUBKEY" != ssh-* ]]; then
  echo "The second argument must be an SSH public key (starts with ssh-)." >&2; exit 1
fi

echo "==> Updating the system"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -y -q
apt-get install -y -q ca-certificates curl gnupg unattended-upgrades fail2ban

echo "==> Enabling automatic security updates"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now fail2ban

echo "==> Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "==> Adding swap (helps small instances)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi

echo "==> Creating the '$DEPLOY_USER' user for GitHub Actions"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
AUTH_KEYS="/home/$DEPLOY_USER/.ssh/authorized_keys"
touch "$AUTH_KEYS"
grep -qxF "$DEPLOY_PUBKEY" "$AUTH_KEYS" || echo "$DEPLOY_PUBKEY" >>"$AUTH_KEYS"
chown "$DEPLOY_USER:$DEPLOY_USER" "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"

echo "==> Preparing $APP_DIR"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"
ENV_FILE="$APP_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  PG_PASS="$(openssl rand -hex 24)"
  SESSION_SECRET="$(openssl rand -hex 32)"
  cat >"$ENV_FILE" <<EOF
# MTC Membership Register — server settings. Keep this file private.
SITE_DOMAIN=${SITE_DOMAIN}
APP_BASE_URL=https://${SITE_DOMAIN}

POSTGRES_PASSWORD=${PG_PASS}
DATABASE_URL=postgres://mtc:${PG_PASS}@db:5432/mtc
SESSION_SECRET=${SESSION_SECRET}

# Staff sign-in: app registration in MTC's Microsoft 365 tenant
ENTRA_TENANT_ID=
ENTRA_CLIENT_ID=
ENTRA_CLIENT_SECRET=

# Email through SMTP2GO (HTTPS API)
SMTP2GO_API_KEY=
MAIL_FROM_ADDRESS=
MAIL_FROM_NAME=The Mauritius Turf Club

# Document storage: private Lightsail bucket (S3-compatible)
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

# MIPS payment gateway (test credentials for the demo).
# Final variable names are confirmed once MIPS sends its merchant documentation.
MIPS_MODE=test
MIPS_MERCHANT_ID=
MIPS_API_USERNAME=
MIPS_API_PASSWORD=
EOF
  chown "$DEPLOY_USER:$DEPLOY_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "    Created $ENV_FILE with generated database password and session secret."
else
  echo "    $ENV_FILE already exists; left unchanged."
fi

echo "==> Hardening SSH (keys only, no root login)"
cat >/etc/ssh/sshd_config.d/60-mtc-hardening.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sshd -t
systemctl reload ssh || systemctl reload sshd

cat <<EOF

Done.

Next steps:
  1. Fill in the empty values in $ENV_FILE:
       sudo -u $DEPLOY_USER nano $ENV_FILE
  2. In GitHub, add the repository secrets listed in docs/SETUP.md, then
     re-run the "Build and deploy" workflow (or push to main).
  3. Check: https://${SITE_DOMAIN}/api/health should return {"status":"ok"}.
EOF
