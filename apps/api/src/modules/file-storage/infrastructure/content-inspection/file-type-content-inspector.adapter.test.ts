import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import {
  ContentInspectionError,
  createRetryableSharedModuleLoader,
  FileTypeContentInspectorAdapter,
} from "./file-type-content-inspector.adapter";

const config = { contentInspectionTimeoutMs: 500 } as never;
const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
const truncatedPng = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489",
  "hex",
);
const completePng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const jpeg = Buffer.from("ffd8ffe000104a46494600010100000100010000ffd9", "hex");

test("detects real PDF, PNG, and JPEG signatures", async () => {
  const inspector = new FileTypeContentInspectorAdapter(config);
  assert.deepEqual(await inspector.inspect(pdf), {
    canonicalMimeType: "application/pdf",
    recognizedExtension: "pdf",
  });
  assert.deepEqual(await inspector.inspect(truncatedPng), {
    canonicalMimeType: "image/png",
    recognizedExtension: "png",
  });
  assert.deepEqual(await inspector.inspect(jpeg), {
    canonicalMimeType: "image/jpeg",
    recognizedExtension: "jpg",
  });
});

test("accepts Uint8Array and Node Readable and disposes the stream", async () => {
  const inspector = new FileTypeContentInspectorAdapter(config);
  assert.equal(
    (await inspector.inspect(new Uint8Array(pdf))).recognizedExtension,
    "pdf",
  );
  const stream = Readable.from([pdf]);
  assert.equal((await inspector.inspect(stream)).recognizedExtension, "pdf");
  assert.equal(stream.destroyed, true);
});

test("detects a complete PNG from Node Readable and disposes the stream", async () => {
  const stream = Readable.from([completePng]);
  const inspector = new FileTypeContentInspectorAdapter(config);
  assert.deepEqual(await inspector.inspect(stream), {
    canonicalMimeType: "image/png",
    recognizedExtension: "png",
  });
  assert.equal(stream.destroyed, true);
});

test("detects JPEG from Node Readable and disposes the stream", async () => {
  const stream = Readable.from([jpeg]);
  const inspector = new FileTypeContentInspectorAdapter(config);
  assert.deepEqual(await inspector.inspect(stream), {
    canonicalMimeType: "image/jpeg",
    recognizedExtension: "jpg",
  });
  assert.equal(stream.destroyed, true);
});

test("truncated PNG stream fails closed and is disposed", async () => {
  const stream = Readable.from([truncatedPng]);
  const inspector = new FileTypeContentInspectorAdapter(config);
  await assert.rejects(
    () => inspector.inspect(stream),
    (error: unknown) => {
      assert.ok(error instanceof ContentInspectionError);
      assert.equal(error.code, "CONTENT_UNRECOGNIZED");
      return true;
    },
  );
  assert.equal(stream.destroyed, true);
});

for (const bytes of [
  Buffer.from("unrecognized"),
  Buffer.alloc(0),
  Buffer.from([0xff]),
]) {
  test("unrecognized or truncated content fails closed and disposes streams", async () => {
    const stream = Readable.from([bytes]);
    const inspector = new FileTypeContentInspectorAdapter(config);
    await assert.rejects(
      () => inspector.inspect(stream),
      (error: unknown) => {
        assert.ok(error instanceof ContentInspectionError);
        assert.equal(error.code, "CONTENT_UNRECOGNIZED");
        if (bytes.length > 0)
          assert.equal(error.message.includes(bytes.toString()), false);
        return true;
      },
    );
    assert.equal(stream.destroyed, true);
  });
}

test("ESM load and parser failures are sanitized", async () => {
  const loadFailureStream = Readable.from([pdf]);
  const loadFailure = new FileTypeContentInspectorAdapter(config, async () => {
    throw new Error("C:/secret/package/path object-key bucket-name");
  });
  await assert.rejects(
    () => loadFailure.inspect(loadFailureStream),
    (error: unknown) => {
      assert.ok(error instanceof ContentInspectionError);
      assert.equal(error.code, "CONTENT_INSPECTION_FAILED");
      assert.equal(error.message, "File content inspection failed");
      return true;
    },
  );
  assert.equal(loadFailureStream.destroyed, true);
  const parserFailureStream = Readable.from([pdf]);
  const parserFailure = new FileTypeContentInspectorAdapter(
    config,
    async () =>
      ({
        FileTypeParser: class {
          fromStream() {
            throw new Error("raw parser detail");
          }
        },
      }) as never,
  );
  await assert.rejects(
    () => parserFailure.inspect(parserFailureStream),
    ContentInspectionError,
  );
  assert.equal(parserFailureStream.destroyed, true);
});

test("transient ESM load failure is cleared and a later inspection retries", async () => {
  let attempts = 0;
  const retryableLoader = createRetryableSharedModuleLoader(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("transient module failure");
    return {
      FileTypeParser: class {
        fromBuffer() {
          return { mime: "application/pdf", ext: "pdf" };
        }
      },
    } as never;
  });
  const inspector = new FileTypeContentInspectorAdapter(
    config,
    retryableLoader,
  );
  await assert.rejects(
    () => inspector.inspect(pdf),
    (error: unknown) => {
      assert.ok(error instanceof ContentInspectionError);
      assert.equal(error.code, "CONTENT_INSPECTION_FAILED");
      return true;
    },
  );
  assert.deepEqual(await inspector.inspect(pdf), {
    canonicalMimeType: "application/pdf",
    recognizedExtension: "pdf",
  });
  assert.equal(attempts, 2);
});

test("concurrent calls share one successful in-flight module load", async () => {
  let attempts = 0;
  const sharedLoader = createRetryableSharedModuleLoader(async () => {
    attempts += 1;
    await Promise.resolve();
    return {
      FileTypeParser: class {
        fromBuffer() {
          return { mime: "application/pdf", ext: "pdf" };
        }
      },
    } as never;
  });
  const inspector = new FileTypeContentInspectorAdapter(config, sharedLoader);
  await Promise.all([inspector.inspect(pdf), inspector.inspect(pdf)]);
  await inspector.inspect(pdf);
  assert.equal(attempts, 1);
});

test("timeout aborts and disposes the input stream", async () => {
  const stream = new Readable({ read() {} });
  const inspector = new FileTypeContentInspectorAdapter(
    { contentInspectionTimeoutMs: 10 } as never,
    async () =>
      ({
        FileTypeParser: class {
          constructor(options: { signal: AbortSignal }) {
            this.signal = options.signal;
          }
          private readonly signal: AbortSignal;
          fromStream() {
            return new Promise((_, reject) =>
              this.signal.addEventListener(
                "abort",
                () => reject(new Error("aborted")),
                { once: true },
              ),
            );
          }
        },
      }) as never,
  );
  await assert.rejects(
    () => inspector.inspect(stream),
    (error: unknown) => {
      assert.ok(error instanceof ContentInspectionError);
      assert.equal(error.code, "CONTENT_INSPECTION_TIMEOUT");
      return true;
    },
  );
  assert.equal(stream.destroyed, true);
});
