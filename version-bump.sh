#!/bin/bash
# Increments the patch version in manifest.json
# Usage: ./version-bump.sh [major|minor|patch]

MANIFEST="manifest.json"
CURRENT=$(grep '"version"' $MANIFEST | sed 's/.*"version": "\(.*\)".*/\1/')
IFS='.' read -r major minor patch <<< "$CURRENT"

case "${1:-patch}" in
  major) major=$((major + 1)); minor=0; patch=0 ;;
  minor) minor=$((minor + 1)); patch=0 ;;
  patch) patch=$((patch + 1)) ;;
esac

NEW="$major.$minor.$patch"
sed -i '' "s/\"version\": \"$CURRENT\"/\"version\": \"$NEW\"/" $MANIFEST
echo "Version bumped: $CURRENT -> $NEW"
