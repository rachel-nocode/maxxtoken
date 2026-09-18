#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
OUTPUT_DIR="$SCRIPT_DIR/bin"
OUTPUT="$OUTPUT_DIR/screen-capture-probe"
TEMP_OUTPUT=$(mktemp "${TMPDIR:-/tmp}/maxxtoken-screen-capture-probe.XXXXXX")
trap 'rm -f "$TEMP_OUTPUT"' EXIT HUP INT TERM

mkdir -p "$OUTPUT_DIR"
MACOSX_DEPLOYMENT_TARGET=12.0 xcrun clang -fobjc-arc -Os \
  -mmacosx-version-min=12.0 -arch arm64 -arch x86_64 \
  -framework Foundation -framework CoreGraphics \
  "$SCRIPT_DIR/screen-capture-probe.m" -o "$TEMP_OUTPUT"

ARCHS=$(lipo -archs "$TEMP_OUTPUT")
HAS_ARM64=false
HAS_X64=false
for ARCH in $ARCHS; do
  [ "$ARCH" = arm64 ] && HAS_ARM64=true
  [ "$ARCH" = x86_64 ] && HAS_X64=true
done
if [ "$HAS_ARM64" != true ] || [ "$HAS_X64" != true ]; then
  echo "screen-capture-probe must contain arm64 and x86_64 slices (found: $ARCHS)" >&2
  exit 1
fi

chmod 755 "$TEMP_OUTPUT"
mv "$TEMP_OUTPUT" "$OUTPUT"
