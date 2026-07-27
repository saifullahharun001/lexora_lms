import assert from "node:assert/strict";
import test from "node:test";

import {
  ACADEMIC_DOCUMENT_CONTENT_POLICY,
  enforceTrustedFileContentPolicy,
  FileContentPolicyError,
} from "./trusted-file-content.policy";

const evaluate = (overrides: Record<string, unknown> = {}) =>
  enforceTrustedFileContentPolicy({
    filename: "report.pdf",
    claimedMimeType: "application/pdf",
    detectedCanonicalMimeType: "application/pdf",
    detectedExtension: "pdf",
    policy: ACADEMIC_DOCUMENT_CONTENT_POLICY,
    ...overrides,
  });

test("accepts PDF and normalizes uppercase filename extension", () => {
  assert.equal(
    evaluate({ filename: "REPORT.PDF" }).canonicalMimeType,
    "application/pdf",
  );
});

test("supports only explicit jpg/jpeg alias", () => {
  assert.equal(
    evaluate({
      filename: "photo.jpeg",
      claimedMimeType: "image/jpeg",
      detectedCanonicalMimeType: "image/jpeg",
      detectedExtension: "jpg",
    }).recognizedExtension,
    "jpg",
  );
});

test("server-owned policy cannot be broadened through runtime mutation", () => {
  assert.equal(Object.isFrozen(ACADEMIC_DOCUMENT_CONTENT_POLICY), true);
  assert.equal(
    Object.isFrozen(ACADEMIC_DOCUMENT_CONTENT_POLICY.approvedMimeExtensions),
    true,
  );
  assert.equal(
    Object.isFrozen(
      ACADEMIC_DOCUMENT_CONTENT_POLICY.approvedMimeExtensions["image/jpeg"],
    ),
    true,
  );
  assert.throws(() => {
    (ACADEMIC_DOCUMENT_CONTENT_POLICY as { policyId: string }).policyId =
      "broadened";
  });
  assert.throws(() => {
    (
      ACADEMIC_DOCUMENT_CONTENT_POLICY.approvedMimeExtensions as Record<
        string,
        string[]
      >
    )["application/x-msdownload"] = ["exe"];
  });
  assert.throws(() => {
    (
      ACADEMIC_DOCUMENT_CONTENT_POLICY.approvedMimeExtensions[
        "image/jpeg"
      ] as string[]
    ).push("exe");
  });
});

for (const overrides of [
  {
    filename: "report.png",
    detectedCanonicalMimeType: "application/pdf",
    detectedExtension: "png",
  },
  {
    filename: "report.pdf",
    detectedCanonicalMimeType: "image/png",
    detectedExtension: "pdf",
  },
  {
    filename: "photo.jpg",
    detectedCanonicalMimeType: "image/png",
    detectedExtension: "jpg",
  },
]) {
  test("rejects an inconsistent detected MIME-extension pair", () => {
    assert.throws(
      () => evaluate(overrides),
      (error: unknown) => {
        assert.ok(error instanceof FileContentPolicyError);
        assert.equal(error.code, "MIME_EXTENSION_MISMATCH");
        return true;
      },
    );
  });
}

for (const [name, overrides, code] of [
  [
    "PDF filename with PNG content",
    { detectedCanonicalMimeType: "image/png", detectedExtension: "png" },
    "EXTENSION_CONTENT_MISMATCH",
  ],
  [
    "PNG filename with PDF content",
    { filename: "report.png" },
    "EXTENSION_CONTENT_MISMATCH",
  ],
  [
    "double extension executable",
    { filename: "report.pdf.exe" },
    "EXTENSION_NOT_ALLOWED",
  ],
  ["missing extension", { filename: "report" }, "EXTENSION_REQUIRED"],
  [
    "extension outside allowlist",
    { filename: "report.txt" },
    "EXTENSION_NOT_ALLOWED",
  ],
  [
    "detected MIME outside allowlist",
    { detectedCanonicalMimeType: "application/zip", detectedExtension: "pdf" },
    "MIME_NOT_ALLOWED",
  ],
  [
    "specific wrong client MIME",
    { claimedMimeType: "image/png" },
    "CLAIMED_MIME_MISMATCH",
  ],
  [
    "executable",
    {
      filename: "program.exe",
      detectedCanonicalMimeType: "application/x-msdownload",
      detectedExtension: "exe",
    },
    "EXTENSION_NOT_ALLOWED",
  ],
  [
    "generic ZIP",
    {
      filename: "archive.zip",
      detectedCanonicalMimeType: "application/zip",
      detectedExtension: "zip",
    },
    "EXTENSION_NOT_ALLOWED",
  ],
  [
    "macro-enabled Office",
    {
      filename: "report.docm",
      detectedCanonicalMimeType:
        "application/vnd.ms-word.document.macroenabled.12",
      detectedExtension: "docm",
    },
    "EXTENSION_NOT_ALLOWED",
  ],
  [
    "unrecognized textual content",
    {
      filename: "notes.txt",
      detectedCanonicalMimeType: "text/plain",
      detectedExtension: "txt",
    },
    "EXTENSION_NOT_ALLOWED",
  ],
] as const) {
  test(`rejects ${name}`, () => {
    assert.throws(
      () => evaluate(overrides),
      (error: unknown) => {
        assert.ok(error instanceof FileContentPolicyError);
        assert.equal(error.code, code);
        return true;
      },
    );
  });
}

for (const claimedMimeType of ["", "application/octet-stream"]) {
  test(`treats ${claimedMimeType || "empty MIME"} as unknown claim`, () => {
    assert.equal(
      evaluate({ claimedMimeType }).canonicalMimeType,
      "application/pdf",
    );
  });
}
