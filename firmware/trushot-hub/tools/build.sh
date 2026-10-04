#!/usr/bin/env bash
set -euo pipefail

ARDUINO_CLI_BIN="${ARDUINO_CLI_BIN:-arduino-cli}"
BUILD_DIR="${TRUSHOT_BUILD_DIR:-/tmp/trushot-hub-build}"
SKETCH_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FQBN='esp32:esp32:esp32s3:USBMode=hwcdc,CDCOnBoot=cdc,UploadMode=default,CPUFreq=240,FlashMode=qio,FlashSize=16M,PartitionScheme=app3M_fat9M_16MB,DebugLevel=none,PSRAM=opi,LoopCore=1,EventsCore=1,EraseFlash=none'

"$ARDUINO_CLI_BIN" compile --clean --fqbn "$FQBN" --build-path "$BUILD_DIR" "$SKETCH_DIR"
