#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SOURCE="$PROJECT_DIR/native/MacSystemAudioSource.swift"
OUTPUT_DIR="$PROJECT_DIR/work/bin"
OUTPUT="$OUTPUT_DIR/lecscape-system-audio"
MODULE_CACHE="$PROJECT_DIR/work/swift-module-cache"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "LecScape system audio capture requires macOS." >&2
  exit 64
fi

if [[ -x "$OUTPUT" && "$OUTPUT" -nt "$SOURCE" ]]; then
  echo "$OUTPUT"
  exit 0
fi

mkdir -p "$OUTPUT_DIR" "$MODULE_CACHE"
ARCH="$(uname -m)"
SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
SWIFTC="$(xcrun --sdk macosx --find swiftc)"

"$SWIFTC" \
  -parse-as-library \
  -target "${ARCH}-apple-macosx13.0" \
  -sdk "$SDK_PATH" \
  -module-cache-path "$MODULE_CACHE" \
  -framework Foundation \
  -framework ScreenCaptureKit \
  -framework AVFoundation \
  -framework CoreMedia \
  -framework CoreGraphics \
  "$SOURCE" \
  -o "$OUTPUT"

codesign --force --sign - "$OUTPUT" >/dev/null 2>&1
echo "$OUTPUT"
