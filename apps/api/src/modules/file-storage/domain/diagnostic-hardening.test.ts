import assert from "node:assert/strict";
import test from "node:test";
import {
  FileStorageValidationError,
  normalizeSafeDiagnosticMetadata,
} from "./file-storage-validation";
import { toOptionalPrismaJson } from "../infrastructure/repositories/prisma-file-storage.repository";

test("rejects binary and custom diagnostic objects", () => {
  assert.throws(
    () => normalizeSafeDiagnosticMetadata({ sample: new Uint8Array([1, 2]) }),
    FileStorageValidationError,
  );
  assert.throws(
    () => normalizeSafeDiagnosticMetadata({ timestamp: new Date() }),
    FileStorageValidationError,
  );
});

test("rejects camelCase secret and file-content keys", () => {
  assert.throws(
    () => normalizeSafeDiagnosticMetadata({ accessToken: "value" }),
    FileStorageValidationError,
  );
  assert.throws(
    () => normalizeSafeDiagnosticMetadata({ fileBytes: [1, 2] }),
    FileStorageValidationError,
  );
});

test("omits absent diagnostic metadata from Prisma create data", () => {
  assert.equal(toOptionalPrismaJson(undefined), undefined);
  assert.equal(toOptionalPrismaJson(null), undefined);
  const metadata = { engine: "clam" };
  assert.equal(toOptionalPrismaJson(metadata), metadata);
});

test("rejects root and nested prototype-pollution keys without pollution", () => {
  const pollutionKey = "fileStoragePolluted";
  assert.equal(
    (Object.prototype as Record<string, unknown>)[pollutionKey],
    undefined,
  );

  for (const json of [
    `{"__proto__":{"${pollutionKey}":true}}`,
    `{"nested":{"__proto__":{"${pollutionKey}":true}}}`,
  ]) {
    const input = JSON.parse(json) as Record<string, unknown>;
    assert.throws(
      () => normalizeSafeDiagnosticMetadata(input),
      FileStorageValidationError,
    );
    assert.equal(
      (Object.prototype as Record<string, unknown>)[pollutionKey],
      undefined,
    );
  }
});

for (const key of ["constructor", "prototype"]) {
  test(`rejects diagnostic metadata key ${key}`, () => {
    const input = JSON.parse(`{"nested":{"${key}":"unsafe"}}`) as Record<
      string,
      unknown
    >;
    assert.throws(
      () => normalizeSafeDiagnosticMetadata(input),
      FileStorageValidationError,
    );
  });
}
