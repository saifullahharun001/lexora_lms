import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeDisplayFilename } from "./filename-sanitizer";

test("sanitizes traversal and path components", () => {
  assert.equal(sanitizeDisplayFilename("../../secret.pdf"), "secret.pdf");
  assert.equal(sanitizeDisplayFilename("..\\..\\secret.pdf"), "secret.pdf");
  assert.equal(sanitizeDisplayFilename("folder/sub\\report.pdf"), "report.pdf");
});
test("removes controls, leading dots, and trailing dots or spaces", () => {
  assert.equal(sanitizeDisplayFilename(".\u0000.hidden.txt... "), "hidden.txt");
});
test("uses a fallback for an empty filename", () =>
  assert.equal(sanitizeDisplayFilename(" ... "), "unnamed-file"));
test("limits long names while preserving a safe extension", () => {
  const result = sanitizeDisplayFilename(`${"a".repeat(300)}.pdf`);
  assert.equal(result.length, 180);
  assert.ok(result.endsWith(".pdf"));
});
test("normalizes genuine Unicode and preserves multiple extensions", () => {
  assert.equal(
    sanitizeDisplayFilename("Ｒｅｐｏｒｔ বাংলা résumé.tar.gz"),
    "Report বাংলা résumé.tar.gz",
  );
});
test("removes bidi and zero-width display controls that can spoof extensions", () => {
  assert.equal(
    sanitizeDisplayFilename("invoice\u202Efdp.exe"),
    "invoicefdp.exe",
  );
  assert.equal(
    sanitizeDisplayFilename("zero\u200Bwidth\u200Cname\u200D.txt\uFEFF"),
    "zerowidthname.txt",
  );
});
