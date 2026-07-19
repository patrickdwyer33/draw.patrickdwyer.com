import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTitle } from "../shared/title.js";

test("accepts spaces, capitals, punctuation, emoji", () => {
	for (const t of ["test space AND CAPS", "hello!", "café", "🎨art"]) {
		assert.doesNotThrow(() => validateTitle(t));
	}
});

test("rejects slash", () => assert.throws(() => validateTitle("a/b"), /slash/i));
test("rejects control chars", () => {
	assert.throws(() => validateTitle("a\tb"), /control/i);   // tab
	assert.throws(() => validateTitle("a\u0000b"), /control/i); // NUL
	assert.throws(() => validateTitle("a\u007fb"), /control/i); // DEL
});
test("rejects leading/trailing whitespace", () => {
	assert.throws(() => validateTitle(" a"), /whitespace/i);
	assert.throws(() => validateTitle("a "), /whitespace/i);
});
test("rejects empty", () => assert.throws(() => validateTitle(""), /empty/i));
test("rejects > 200 bytes utf-8", () => {
	assert.throws(() => validateTitle("a".repeat(201)), /long/i);
	assert.throws(() => validateTitle("é".repeat(101)), /long/i); // 202 bytes
});
