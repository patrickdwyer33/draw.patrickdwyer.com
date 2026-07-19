import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeDrawing, decodeDrawing, HEADER_BYTES } from "../shared/codec.js";

test("round-trips positions and colors exactly", () => {
	const input = { positions: [0.1, 0.2, 0.3, 0.4], colors: [10, 20, 30, 40, 50, 60] };
	const decoded = decodeDrawing(encodeDrawing(input));
	assert.equal(decoded.positions.length, 4);
	assert.equal(decoded.colors.length, 6);
	// positions are Float32 — compare with tolerance
	input.positions.forEach((v, i) => assert.ok(Math.abs(decoded.positions[i] - v) < 1e-6));
	input.colors.forEach((v, i) => assert.equal(decoded.colors[i], v));
});

test("encoded length is exactly 16 + 8n + 3n", () => {
	const n = 5;
	const buf = encodeDrawing({ positions: Array(2 * n).fill(0.5), colors: Array(3 * n).fill(128) });
	assert.equal(buf.byteLength, HEADER_BYTES + 8 * n + 3 * n);
});

test("decode rejects bad magic", () => {
	const bad = new Uint8Array(HEADER_BYTES + 11); // 1 point
	assert.throws(() => decodeDrawing(bad.buffer), /magic/i);
});

test("decode rejects unknown version", () => {
	const buf = encodeDrawing({ positions: [0, 0], colors: [1, 2, 3] });
	new DataView(buf).setUint8(4, 99);
	assert.throws(() => decodeDrawing(buf), /version/i);
});

test("decode rejects length mismatch (short and long)", () => {
	const buf = encodeDrawing({ positions: [0, 0], colors: [1, 2, 3] });
	assert.throws(() => decodeDrawing(buf.slice(0, buf.byteLength - 1)), /length/i);
	const longer = new Uint8Array(buf.byteLength + 1);
	longer.set(new Uint8Array(buf));
	assert.throws(() => decodeDrawing(longer.buffer), /length/i);
});

test("round-trips zero points", () => {
	const buf = encodeDrawing({ positions: [], colors: [] });
	assert.equal(buf.byteLength, HEADER_BYTES);
	const decoded = decodeDrawing(buf);
	assert.equal(decoded.positions.length, 0);
	assert.equal(decoded.colors.length, 0);
});
