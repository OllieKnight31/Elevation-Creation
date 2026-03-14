#!/bin/bash
# ============================================================
# Ollie Knight — Deploy to Elevation-Creation Repo
# ============================================================
# Usage: bash deploy-to-repo.sh [optional: commit message]
#
# This script pushes files from your local working directory
# into your personal folder (Ollie-Knight/) in the
# Elevation-Creation GitHub repo.
# ============================================================

set -e

REPO_URL="https://github.com/OllieKnight31/Elevation-Creation.git"
TARGET_DIR="Ollie-Knight"
BRANCH="main"
COMMIT_MSG="${1:-"Ollie Knight — new build $(date '+%Y-%m-%d %H:%M:%S')"}"

# Temp working directory
WORK_DIR=$(mktemp -d)
trap "rm -rf $WORK_DIR" EXIT

echo "🔄 Cloning repo..."
git clone --depth 1 "$REPO_URL" "$WORK_DIR/repo"

echo "📂 Copying files into $TARGET_DIR/..."
# Copy everything from current directory into the target folder
# (excluding hidden files and the script itself)
rsync -av --exclude='.git' --exclude='deploy-to-repo.sh' ./ "$WORK_DIR/repo/$TARGET_DIR/"

cd "$WORK_DIR/repo"
git add -A
git commit -m "$COMMIT_MSG"
git push origin "$BRANCH"

echo "✅ Successfully deployed to $TARGET_DIR/ in Elevation-Creation!"
echo "🔗 https://github.com/OllieKnight31/Elevation-Creation/tree/main/$TARGET_DIR"
