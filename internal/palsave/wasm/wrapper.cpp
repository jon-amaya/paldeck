// Paldeck's WASM entry into ooz (GPL-3 Oodle decompressor, github.com/zao/ooz).
// Compiled to wasm32-wasi and executed by wazero inside the Go binary — no
// CGO, no native libs. Only decompression is exposed.
#include <stddef.h>
#include <stdint.h>

// kraken.cpp — despite the name it auto-detects Kraken/Mermaid/Selkie/LZNA/
// BitKnit from the Oodle block header.
extern int Kraken_Decompress(const uint8_t *src, size_t src_len, uint8_t *dst, size_t dst_len);

extern "C" {

// Returns the number of bytes written to dst, or <0 on failure.
__attribute__((export_name("paldeck_decompress")))
int paldeck_decompress(const uint8_t *src, int src_len, uint8_t *dst, int dst_len) {
  if (src_len <= 0 || dst_len <= 0) return -1;
  return Kraken_Decompress(src, (size_t)src_len, dst, (size_t)dst_len);
}

} // extern "C"
