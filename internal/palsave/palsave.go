// Package palsave reads Palworld .sav files. Layer 1 (this file): the
// compression wrapper. Current saves are "PlM" = Oodle-compressed; Oodle is
// proprietary with no Go implementation, so we embed the open-source ooz
// decompressor (GPL-3) compiled to WebAssembly and run it with wazero — a
// pure-Go WASM runtime. No CGO, single binary preserved.
//
// Header layout (verified empirically against real saves, see specs/004):
//
//	offset 0x00  u32 LE  uncompressed size
//	offset 0x04  u32 LE  compressed size
//	offset 0x08  [4]byte magic: "PlM1" (Oodle) or "PlZ1" (zlib, pre-v0.6)
//	offset 0x0C  payload
package palsave

import (
	"bytes"
	"compress/zlib"
	"context"
	"encoding/binary"
	_ "embed"
	"fmt"
	"io"
	"sync"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
	"github.com/tetratelabs/wazero/imports/wasi_snapshot_preview1"
)

//go:embed wasm/ooz.wasm
var oozWasm []byte

// oodle wraps the instantiated WASM module. One instance, mutex-guarded —
// WASM modules aren't goroutine-safe, and save parsing is rare.
type oodle struct {
	mu      sync.Mutex
	mod     api.Module
	decomp  api.Function
	malloc  api.Function
	free    api.Function
	runtime wazero.Runtime
}

var (
	oozOnce sync.Once
	oozInst *oodle
	oozErr  error
)

func getOodle(ctx context.Context) (*oodle, error) {
	oozOnce.Do(func() {
		r := wazero.NewRuntime(ctx)
		wasi_snapshot_preview1.MustInstantiate(ctx, r)
		mod, err := r.Instantiate(ctx, oozWasm)
		if err != nil {
			oozErr = fmt.Errorf("instantiate ooz.wasm: %w", err)
			return
		}
		oozInst = &oodle{
			mod:     mod,
			decomp:  mod.ExportedFunction("paldeck_decompress"),
			malloc:  mod.ExportedFunction("malloc"),
			free:    mod.ExportedFunction("free"),
			runtime: r,
		}
	})
	return oozInst, oozErr
}

func (o *oodle) decompress(ctx context.Context, comp []byte, rawLen int) ([]byte, error) {
	o.mu.Lock()
	defer o.mu.Unlock()

	srcRes, err := o.malloc.Call(ctx, uint64(len(comp)))
	if err != nil {
		return nil, err
	}
	srcPtr := uint32(srcRes[0])
	defer o.free.Call(ctx, uint64(srcPtr))

	dstRes, err := o.malloc.Call(ctx, uint64(rawLen))
	if err != nil {
		return nil, err
	}
	dstPtr := uint32(dstRes[0])
	defer o.free.Call(ctx, uint64(dstPtr))

	if !o.mod.Memory().Write(srcPtr, comp) {
		return nil, fmt.Errorf("wasm memory write failed")
	}
	ret, err := o.decomp.Call(ctx, uint64(srcPtr), uint64(len(comp)), uint64(dstPtr), uint64(rawLen))
	if err != nil {
		return nil, fmt.Errorf("ooz decompress trapped: %w", err)
	}
	n := int32(uint32(ret[0]))
	if int(n) != rawLen {
		return nil, fmt.Errorf("ooz returned %d bytes, want %d", n, rawLen)
	}
	out, ok := o.mod.Memory().Read(dstPtr, uint32(rawLen))
	if !ok {
		return nil, fmt.Errorf("wasm memory read failed")
	}
	// Copy out — the slice aliases WASM memory that free() will reuse.
	return append([]byte(nil), out...), nil
}

// Decompress unwraps a Palworld .sav (PlM/PlZ) and returns the raw GVAS bytes.
func Decompress(ctx context.Context, sav []byte) ([]byte, error) {
	if len(sav) < 12 {
		return nil, fmt.Errorf("save too short (%d bytes)", len(sav))
	}
	rawLen := int(binary.LittleEndian.Uint32(sav[0:4]))
	compLen := int(binary.LittleEndian.Uint32(sav[4:8]))
	magic := sav[8:12]
	payload := sav[12:]
	if compLen > len(payload) {
		return nil, fmt.Errorf("header compressed size %d exceeds payload %d", compLen, len(payload))
	}
	payload = payload[:compLen]

	var raw []byte
	switch {
	case bytes.HasPrefix(magic, []byte("PlM")):
		oz, err := getOodle(ctx)
		if err != nil {
			return nil, err
		}
		out, err := oz.decompress(ctx, payload, rawLen)
		if err != nil {
			return nil, err
		}
		raw = out
	case bytes.HasPrefix(magic, []byte("PlZ")):
		zr, err := zlib.NewReader(bytes.NewReader(payload))
		if err != nil {
			return nil, fmt.Errorf("zlib: %w", err)
		}
		defer zr.Close()
		out, err := io.ReadAll(zr)
		if err != nil {
			return nil, fmt.Errorf("zlib read: %w", err)
		}
		raw = out
	default:
		return nil, fmt.Errorf("unknown save magic %q", magic)
	}

	if len(raw) < 4 || string(raw[0:4]) != "GVAS" {
		return nil, fmt.Errorf("decompressed data is not GVAS (got %q)", raw[:min(4, len(raw))])
	}
	return raw, nil
}
