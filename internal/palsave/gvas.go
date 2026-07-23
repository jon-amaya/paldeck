package palsave

// Layer 2: GVAS — Unreal's SaveGame serialization. A header, then a tree of
// typed properties terminated by "None" names. Everything here was validated
// by parsing real Palworld saves; unknown constructs fail loudly with their
// byte offset so the format can teach us (constitution P4, empirically).

import (
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"math"
	"unicode/utf16"
)

type parseErr struct {
	off int
	msg string
}

func (e parseErr) Error() string { return fmt.Sprintf("gvas parse at offset %d: %s", e.off, e.msg) }

type reader struct {
	b    []byte
	off  int
	path string // last property path entered — diagnostic breadcrumb
}

func (r *reader) fail(format string, a ...any) {
	panic(parseErr{r.off, fmt.Sprintf(format, a...) + " (near " + r.path + ")"})
}

func (r *reader) need(n int) []byte {
	if r.off+n > len(r.b) {
		r.fail("need %d bytes, have %d", n, len(r.b)-r.off)
	}
	s := r.b[r.off : r.off+n]
	r.off += n
	return s
}

func (r *reader) u8() byte    { return r.need(1)[0] }
func (r *reader) u16() uint16 { return binary.LittleEndian.Uint16(r.need(2)) }
func (r *reader) u32() uint32 { return binary.LittleEndian.Uint32(r.need(4)) }
func (r *reader) u64() uint64 { return binary.LittleEndian.Uint64(r.need(8)) }
func (r *reader) i32() int32  { return int32(r.u32()) }
func (r *reader) i64() int64  { return int64(r.u64()) }
func (r *reader) f32() float32 {
	return math.Float32frombits(r.u32())
}
func (r *reader) f64() float64 {
	return math.Float64frombits(r.u64())
}

// fstring: i32 length. >0 → that many UTF-8 bytes incl. trailing NUL.
// <0 → that many UTF-16LE code units incl. trailing NUL.
func (r *reader) fstring() string {
	n := r.i32()
	switch {
	case n == 0:
		return ""
	case n > 0:
		if n > 10_000_000 {
			r.fail("implausible string length %d", n)
		}
		b := r.need(int(n))
		return string(b[:n-1])
	default:
		m := int(-n)
		if m > 10_000_000 {
			r.fail("implausible utf16 length %d", m)
		}
		b := r.need(m * 2)
		u := make([]uint16, m-1)
		for i := range u {
			u[i] = binary.LittleEndian.Uint16(b[i*2:])
		}
		return string(utf16.Decode(u))
	}
}

func (r *reader) guid() string { return hex.EncodeToString(r.need(16)) }

// optional 16-byte property guid, gated by a flag byte
func (r *reader) propGuid() {
	if r.u8() != 0 {
		r.need(16)
	}
}

// ── header ──────────────────────────────────────────────────────────────────

type Header struct {
	SaveVersion  uint32
	UE4Version   uint32
	UE5Version   uint32
	EngineMajor  uint16
	EngineMinor  uint16
	EnginePatch  uint16
	Changelist   uint32
	Branch       string
	CustomCount  uint32
	SaveClass    string
	BodyOffset   int
}

func ParseHeader(raw []byte) (h Header, err error) {
	defer func() {
		if p := recover(); p != nil {
			if pe, ok := p.(parseErr); ok {
				err = pe
				return
			}
			panic(p)
		}
	}()
	r := &reader{b: raw}
	if string(r.need(4)) != "GVAS" {
		r.fail("missing GVAS magic")
	}
	h.SaveVersion = r.u32()
	h.UE4Version = r.u32()
	if h.SaveVersion >= 3 {
		h.UE5Version = r.u32()
	}
	h.EngineMajor = r.u16()
	h.EngineMinor = r.u16()
	h.EnginePatch = r.u16()
	h.Changelist = r.u32()
	h.Branch = r.fstring()
	_ = r.u32() // custom version format
	h.CustomCount = r.u32()
	r.need(int(h.CustomCount) * 20) // guid(16) + version(4) each
	h.SaveClass = r.fstring()
	h.BodyOffset = r.off
	return h, nil
}

// ── property tree ────────────────────────────────────────────────────────────

// StructVal keeps the struct type name alongside its decoded value.
type StructVal struct {
	Type  string
	Value any
}

// KV is one entry of a MapProperty (order preserved from the file).
type KV struct {
	Key, Value any
}

// looksLikePropertyList peeks: a property list starts with an FString property
// name — small length prefix, printable ASCII, NUL-terminated. A bare Guid
// almost never decodes that way. This replaces the reference implementation's
// hand-maintained path-hint table with evidence from the bytes themselves.
func (r *reader) looksLikePropertyList() bool {
	if r.off+4 > len(r.b) {
		return false
	}
	n := int(int32(binary.LittleEndian.Uint32(r.b[r.off:])))
	if n < 2 || n > 64 || r.off+4+n > len(r.b) {
		return false
	}
	s := r.b[r.off+4 : r.off+4+n]
	if s[n-1] != 0 {
		return false
	}
	for _, c := range s[:n-1] {
		if c < 0x20 || c > 0x7e {
			return false
		}
	}
	return true
}

// ParseBody decodes the root property tree following the header.
func ParseBody(raw []byte, bodyOffset int) (m map[string]any, err error) {
	defer func() {
		if p := recover(); p != nil {
			if pe, ok := p.(parseErr); ok {
				err = pe
				return
			}
			panic(p)
		}
	}()
	r := &reader{b: raw, off: bodyOffset}
	return r.properties(""), nil
}

func (r *reader) properties(path string) map[string]any {
	m := map[string]any{}
	for {
		name := r.fstring()
		if name == "None" {
			return m
		}
		typ := r.fstring()
		size := r.u64()
		r.path = path + "." + name
		m[name] = r.property(typ, int(size), path+"."+name)
	}
}

func (r *reader) property(typ string, size int, path string) any {
	switch typ {
	case "BoolProperty":
		v := r.u8()
		r.propGuid()
		return v != 0
	case "IntProperty":
		r.propGuid()
		return r.i32()
	case "Int64Property":
		r.propGuid()
		return r.i64()
	case "UInt32Property":
		r.propGuid()
		return r.u32()
	case "UInt64Property":
		r.propGuid()
		return r.u64()
	case "FloatProperty":
		r.propGuid()
		return r.f32()
	case "DoubleProperty":
		r.propGuid()
		return r.f64()
	case "StrProperty", "NameProperty", "SoftObjectProperty", "ObjectProperty":
		r.propGuid()
		return r.fstring()
	case "EnumProperty":
		enumType := r.fstring()
		r.propGuid()
		_ = enumType
		return r.fstring()
	case "ByteProperty":
		enumName := r.fstring()
		r.propGuid()
		if enumName == "None" {
			return r.u8()
		}
		return r.fstring()
	case "StructProperty":
		structType := r.fstring()
		r.need(16) // struct guid
		r.propGuid()
		return r.structValue(structType, path)
	case "ArrayProperty":
		inner := r.fstring()
		r.propGuid()
		return r.arrayValue(inner, path)
	case "MapProperty":
		keyT := r.fstring()
		valT := r.fstring()
		r.propGuid()
		_ = r.u32() // removed count
		n := int(r.u32())
		if n > 10_000_000 {
			r.fail("implausible map count %d at %s", n, path)
		}
		out := make([]KV, 0, n)
		for i := 0; i < n; i++ {
			k := r.mapElem(keyT, path+".Key")
			v := r.mapElem(valT, path+".Value")
			out = append(out, KV{k, v})
		}
		return out
	default:
		r.fail("unknown property type %q at %s (size %d)", typ, path, size)
		return nil
	}
}

func (r *reader) structValue(structType, path string) any {
	switch structType {
	case "Guid":
		return StructVal{structType, r.guid()}
	case "DateTime", "Timespan":
		return StructVal{structType, r.u64()}
	case "Vector", "Rotator":
		return StructVal{structType, [3]float64{r.f64(), r.f64(), r.f64()}}
	case "Quat":
		return StructVal{structType, [4]float64{r.f64(), r.f64(), r.f64(), r.f64()}}
	case "LinearColor":
		return StructVal{structType, [4]float32{r.f32(), r.f32(), r.f32(), r.f32()}}
	default:
		return StructVal{structType, r.properties(path)}
	}
}

func (r *reader) arrayValue(inner, path string) any {
	n := int(r.u32())
	if n > 50_000_000 {
		r.fail("implausible array count %d at %s", n, path)
	}
	switch inner {
	case "ByteProperty":
		// raw byte blob — Palworld's embedded RawData lives in these
		return append([]byte(nil), r.need(n)...)
	case "StructProperty":
		_ = r.fstring() // element prop name
		if t := r.fstring(); t != "StructProperty" {
			r.fail("array-of-struct with inner tag %q at %s", t, path)
		}
		_ = r.u64() // total payload size
		structType := r.fstring()
		r.need(16)
		r.propGuid()
		out := make([]any, 0, n)
		for i := 0; i < n; i++ {
			out = append(out, r.structValue(structType, path))
		}
		return out
	case "NameProperty", "StrProperty", "EnumProperty", "SoftObjectProperty", "ObjectProperty":
		out := make([]string, 0, n)
		for i := 0; i < n; i++ {
			out = append(out, r.fstring())
		}
		return out
	case "IntProperty":
		out := make([]int32, 0, n)
		for i := 0; i < n; i++ {
			out = append(out, r.i32())
		}
		return out
	case "Int64Property":
		out := make([]int64, 0, n)
		for i := 0; i < n; i++ {
			out = append(out, r.i64())
		}
		return out
	case "FloatProperty":
		out := make([]float32, 0, n)
		for i := 0; i < n; i++ {
			out = append(out, r.f32())
		}
		return out
	case "BoolProperty":
		out := make([]bool, 0, n)
		for i := 0; i < n; i++ {
			out = append(out, r.u8() != 0)
		}
		return out
	default:
		r.fail("unknown array inner type %q at %s", inner, path)
		return nil
	}
}

func (r *reader) mapElem(typ, path string) any {
	switch typ {
	case "StructProperty":
		if r.looksLikePropertyList() {
			return r.properties(path)
		}
		return r.guid()
	case "NameProperty", "StrProperty", "EnumProperty":
		return r.fstring()
	case "IntProperty":
		return r.i32()
	case "Int64Property":
		return r.i64()
	case "UInt32Property":
		return r.u32()
	case "BoolProperty":
		return r.u8() != 0
	default:
		r.fail("unknown map element type %q at %s", typ, path)
		return nil
	}
}
