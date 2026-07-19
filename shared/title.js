// Titles are the S3 key verbatim (UTF-8). Validate, never transform — slugifying
// was removed in 1cb748d because it broke the find feature. Fail loud on the few
// characters that are actually dangerous.
export function validateTitle(title) {
	if (typeof title !== "string" || title.length === 0) throw new Error("Title is empty");
	if (title !== title.trim()) throw new Error("Title has leading/trailing whitespace");
	if (title.includes("/")) throw new Error("Title cannot contain a slash");
	// eslint-disable-next-line no-control-regex
	if (/[\u0000-\u001f\u007f]/.test(title)) throw new Error("Title contains control characters");
	if (new TextEncoder().encode(title).length > 200) throw new Error("Title is too long (max 200 bytes)");
}
