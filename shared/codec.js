// Binary drawing container v1. Browser + Node (pure ArrayBuffer/DataView).
// Layout: 'DRAW' | u8 version | 3 reserved | u32LE pointCount | 4 reserved
//         | f32LE positions[2n] | u8 colors[3n].  16-byte header = 4-aligned so
// new Float32Array(buf, 16, ...) needs no copy.
export const MAGIC = 0x44524157; // 'DRAW' big-endian
export const VERSION = 1;
export const HEADER_BYTES = 16;

export function encodeDrawing({ positions, colors }) {
	const n = positions.length / 2;
	if (!Number.isInteger(n) || colors.length !== 3 * n) {
		throw new Error("positions must be 2/point and colors 3/point");
	}
	const buf = new ArrayBuffer(HEADER_BYTES + 8 * n + 3 * n);
	const view = new DataView(buf);
	view.setUint32(0, MAGIC, false);
	view.setUint8(4, VERSION);
	view.setUint32(8, n, true);
	const pos = new Float32Array(buf, HEADER_BYTES, 2 * n);
	pos.set(positions);
	const col = new Uint8Array(buf, HEADER_BYTES + 8 * n, 3 * n);
	col.set(colors);
	return buf;
}

export function decodeDrawing(buf) {
	if (buf.byteLength < HEADER_BYTES) throw new Error("buffer shorter than header");
	const view = new DataView(buf);
	if (view.getUint32(0, false) !== MAGIC) throw new Error("bad magic");
	if (view.getUint8(4) !== VERSION) throw new Error("unknown version");
	const n = view.getUint32(8, true);
	const expected = HEADER_BYTES + 8 * n + 3 * n;
	if (buf.byteLength !== expected) throw new Error(`length mismatch: got ${buf.byteLength}, expected ${expected}`);
	// Copy out of the (possibly offset) source so callers own standalone arrays.
	const positions = new Float32Array(buf.slice(HEADER_BYTES, HEADER_BYTES + 8 * n));
	const colors = new Uint8Array(buf.slice(HEADER_BYTES + 8 * n));
	return { positions, colors };
}
