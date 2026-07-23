import assert from "node:assert/strict";
import test from "node:test";
import {
  FileStorageValidationError,
  normalizeSafeDiagnosticMetadata,
  validatePendingMetadata,
} from "./file-storage-validation";

const valid = {
  bucket: "private",
  objectKey: "opaque/id-123",
  originalFilename: "Report.pdf",
  canonicalMimeType: "application/pdf",
  sizeBytes: 42,
  checksumSha256: "A".repeat(64),
};

test("valid pending metadata is trimmed and checksum normalized", () => {
  const result = validatePendingMetadata({
    ...valid,
    bucket: " private ",
    canonicalMimeType: " application/pdf ",
  });
  assert.equal(result.checksumSha256, "a".repeat(64));
  assert.equal(result.bucket, "private");
});
for (const checksum of ["", "abc", "g".repeat(64), "a".repeat(63)]) {
  test(`rejects malformed checksum length ${checksum.length}`, () =>
    assert.throws(
      () => validatePendingMetadata({ ...valid, checksumSha256: checksum }),
      FileStorageValidationError,
    ));
}
for (const size of [
  0,
  -1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  2_147_483_648,
]) {
  test(`rejects invalid file size ${String(size)}`, () =>
    assert.throws(
      () => validatePendingMetadata({ ...valid, sizeBytes: size }),
      FileStorageValidationError,
    ));
}
for (const override of [
  { bucket: "   " },
  { canonicalMimeType: " " },
  { objectKey: " " },
]) {
  test("rejects whitespace-only internal metadata", () =>
    assert.throws(
      () => validatePendingMetadata({ ...valid, ...override }),
      FileStorageValidationError,
    ));
}
for (const objectKey of [
  "/leading",
  "back\\slash",
  "a//b",
  "a/./b",
  "a/../b",
  "Report.pdf",
  "uploads/Report.pdf",
  "quarantine/Report.pdf",
  "department-a/report.pdf",
  "a/\u0000b",
]) {
  test(`rejects unsafe object key ${JSON.stringify(objectKey)}`, () =>
    assert.throws(
      () => validatePendingMetadata({ ...valid, objectKey }),
      FileStorageValidationError,
    ));
}
test("accepts an opaque object key independent from the display filename", () => {
  const result = validatePendingMetadata({
    ...valid,
    objectKey: "quarantine/department-a/01JXYZ8J4H3K2M1N",
  });
  assert.equal(result.objectKey, "quarantine/department-a/01JXYZ8J4H3K2M1N");
});
test("rejects unsafe diagnostic metadata keys", () => {
  assert.throws(
    () => normalizeSafeDiagnosticMetadata({ accessToken: "secret" }),
    FileStorageValidationError,
  );
  assert.throws(
    () => normalizeSafeDiagnosticMetadata({ rawOutput: "scanner dump" }),
    FileStorageValidationError,
  );
});
test("rejects oversized and deeply nested diagnostic metadata", () => {
  assert.throws(
    () => normalizeSafeDiagnosticMetadata({ message: "x".repeat(5_000) }),
    FileStorageValidationError,
  );
  assert.throws(
    () => normalizeSafeDiagnosticMetadata({ a: { b: { c: { d: { e: 1 } } } } }),
    FileStorageValidationError,
  );
});
test("accepts bounded JSON-safe diagnostic metadata", () => {
  assert.deepEqual(
    normalizeSafeDiagnosticMetadata({
      engine: "clam",
      attempts: 1,
      flags: ["heuristic"],
    }),
    { engine: "clam", attempts: 1, flags: ["heuristic"] },
  );
});
