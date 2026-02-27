#!/bin/bash
set -euo pipefail

# Setup ghostwriter on hetzner-recon
# Run from local machine: ssh hetzner-recon < deploy/setup-hetzner.sh

GHOSTWRITER_DIR=/root/ghostwriter
HUGO_REPO=/root/exitcloud.github.io
GHOSTWRITER_REPO="git@github.com:npow/quill.git"
HUGO_REPO_URL="git@github.com:exitcloud/exitcloud.github.io.git"

echo "==> Cloning repos..."
if [ ! -d "$GHOSTWRITER_DIR" ]; then
  git clone "$GHOSTWRITER_REPO" "$GHOSTWRITER_DIR"
else
  cd "$GHOSTWRITER_DIR" && git pull --rebase origin main
fi

if [ ! -d "$HUGO_REPO" ]; then
  git clone "$HUGO_REPO_URL" "$HUGO_REPO"
else
  cd "$HUGO_REPO" && git pull --rebase origin main
fi

# Git config for commits from container
cd "$HUGO_REPO"
git config user.email "bot@exitcloud.dev"
git config user.name "Ghostwriter Bot"

echo "==> Setting up connections.json..."
mkdir -p /root/.ghostwriter
cat > /root/.ghostwriter/connections.json << 'EOF'
{
  "connections": [
    {
      "id": "exitcloud",
      "platform": "hugo",
      "credentials": {
        "repoPath": "/repos/exitcloud.github.io"
      },
      "createdAt": "2026-02-25T00:00:00Z"
    }
  ]
}
EOF

echo "==> Creating .env..."
cat > "$GHOSTWRITER_DIR/deploy/.env" << 'EOF'
CLIPROXY_API_KEY=your-api-key-1
HUGO_REPO_PATH=/root/exitcloud.github.io
EOF

echo "==> Building ghostwriter image..."
cd "$GHOSTWRITER_DIR"
docker compose -f deploy/docker-compose.prod.yml build

echo "==> Installing cron.d file (9 AM ET = 14:00 UTC)..."
cp "$GHOSTWRITER_DIR/deploy/cron.d/ghostwriter" /etc/cron.d/ghostwriter
chmod 644 /etc/cron.d/ghostwriter
# Remove legacy user crontab entry if present
(crontab -l 2>/dev/null | grep -v ghostwriter) | crontab - || true

echo "==> Done! Cron schedule:"
cat /etc/cron.d/ghostwriter
echo ""
echo "Test with: cd $GHOSTWRITER_DIR && docker compose -f deploy/docker-compose.prod.yml run --rm ghostwriter"
