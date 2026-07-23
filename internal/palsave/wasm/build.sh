#!/usr/bin/env bash
# Build ooz.wasm — the Oodle decompressor Paldeck embeds and runs via wazero.
# Needs: wasi-sdk at ~/wasi-sdk, ooz sources at /tmp/ooz (github.com/zao/ooz).
set -e
SDK=~/wasi-sdk
OOZ=/tmp/ooz
OUT="$(dirname "$0")/ooz.wasm"

"$SDK/bin/clang++" --target=wasm32-wasi -O2 -fno-exceptions -fno-rtti \
  -I"$OOZ" -I"$OOZ/simde" -DSIMDE_ENABLE_NATIVE_ALIASES \
  -mexec-model=reactor \
  -Wl,--export=paldeck_decompress -Wl,--export=malloc -Wl,--export=free \
  -Wl,--strip-all -Wl,-zstack-size=1048576 \
  "$(dirname "$0")/wrapper.cpp" "$OOZ/kraken.cpp" "$OOZ/lzna.cpp" "$OOZ/bitknit.cpp" \
  -o "$OUT"

ls -la "$OUT"
