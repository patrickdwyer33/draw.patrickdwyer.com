import { test } from "node:test";
import assert from "node:assert/strict";
import { keyFor } from "../server/services/objects.js";

test("keyFor builds the public drawings key verbatim", () => {
	assert.equal(keyFor("test space AND CAPS"), "draw/public/drawings/test space AND CAPS.bin");
});
