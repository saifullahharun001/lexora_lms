import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import test from "node:test";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import {
  buildS3ClientConfig,
  ObjectStorageInfrastructureError,
  type S3CommandClient,
  S3ObjectStorageAdapter,
  type S3UrlSigner,
} from "./s3-object-storage.adapter";

const config = {
  endpoint: "http://127.0.0.1:9000",
  region: "us-east-1",
  bucket: "lexora-private",
  accessKey: "test-access-key",
  secretKey: "test-secret-value",
  forcePathStyle: true,
  publicBaseUrl: "http://127.0.0.1:9000/lexora-private",
  malwareScanning: {
    mode: "disabled",
    host: "127.0.0.1",
    port: 3310,
    timeoutMs: 5_000,
  },
} as const;

const quarantine = {
  bucket: config.bucket,
  objectKey: "quarantine/department-a/01JXYZ8J4H3K2M1N",
};
const available = {
  bucket: config.bucket,
  objectKey: "available/department-a/01JXYZ8J4H3K2M1N",
};
const head = {
  ContentLength: 42,
  ContentType: "application/pdf",
  ChecksumSHA256: "trusted-checksum",
  ETag: "not-a-sha256",
};
const promotionContent = Buffer.from("trusted promotion content");
const wrongPromotionContent = Buffer.alloc(promotionContent.length, 0x78);
const promotionChecksum = createHash("sha256")
  .update(promotionContent)
  .digest("hex");
const promotionExpectation = {
  expectedSizeBytes: promotionContent.length,
  expectedChecksumSha256: promotionChecksum.toUpperCase(),
};
const promotionHead = {
  ContentLength: promotionContent.length,
  ContentType: "application/pdf",
  ETag: "provider-concurrency-token",
};
const missing = () =>
  Object.assign(new Error("provider detail"), {
    name: "NoSuchKey",
    $metadata: { httpStatusCode: 404 },
  });
const conditionalConflict = (httpStatusCode: 409 | 412) =>
  Object.assign(new Error(`provider conflict ${config.secretKey}`), {
    name: "ConditionalRequestConflict",
    $metadata: { httpStatusCode },
  });

class FakeClient implements S3CommandClient {
  readonly calls: unknown[] = [];

  constructor(
    private readonly respond: (
      command: unknown,
      callIndex: number,
    ) => unknown | Promise<unknown>,
  ) {}

  async send(command: unknown): Promise<unknown> {
    this.calls.push(command);
    return this.respond(command, this.calls.length - 1);
  }
}

class FakeSigner implements S3UrlSigner {
  calls: Array<{ command: GetObjectCommand; expiresInSeconds: number }> = [];

  async sign(
    command: GetObjectCommand,
    expiresInSeconds: number,
  ): Promise<string> {
    this.calls.push({ command, expiresInSeconds });
    return "https://signed.example/private-value";
  }
}

function harness(
  respond: ConstructorParameters<typeof FakeClient>[0] = () => ({}),
) {
  const client = new FakeClient(respond);
  const signer = new FakeSigner();
  return {
    adapter: new S3ObjectStorageAdapter(config as never, client, signer),
    client,
    signer,
  };
}

function assertStorageError(
  action: () => Promise<unknown>,
  code: ObjectStorageInfrastructureError["code"],
) {
  return assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof ObjectStorageInfrastructureError);
    assert.equal(error.code, code);
    assert.ok(!error.message.includes(config.accessKey));
    assert.ok(!error.message.includes(config.secretKey));
    assert.ok(!error.message.includes(config.endpoint));
    assert.ok(!error.message.includes(quarantine.objectKey));
    return true;
  });
}

test("maps validated endpoint, region, credentials, and path style", () => {
  const result = buildS3ClientConfig(config as never);
  assert.equal(result.endpoint, config.endpoint);
  assert.equal(result.region, config.region);
  assert.equal(result.forcePathStyle, true);
  assert.deepEqual(result.credentials, {
    accessKeyId: config.accessKey,
    secretAccessKey: config.secretKey,
  });
});

test("rejects an arbitrary bucket without exposing credentials", async () => {
  const { adapter } = harness();
  await assertStorageError(
    () =>
      adapter.statObject({
        ...quarantine,
        bucket: "attacker-selected",
      }),
    "INVALID_LOCATION",
  );
});

for (const [name, objectKey] of [
  ["leading slash", "/quarantine/id"],
  ["backslash", String.raw`quarantine\id`],
  ["dot segment", "quarantine/./id"],
  ["dot-dot segment", "quarantine/../id"],
  ["empty segment", "quarantine//id"],
  ["leading segment whitespace", "quarantine/ id"],
  ["trailing segment whitespace", "quarantine/id "],
  ["whitespace-only segment", "quarantine/ /id"],
  ["uncontrolled prefix", "uploads/id"],
] as const) {
  test(`rejects ${name} object key`, async () => {
    const { adapter } = harness();
    await assertStorageError(
      () => adapter.statObject({ bucket: config.bucket, objectKey }),
      "INVALID_LOCATION",
    );
  });
}

test("quarantine upload sends put then head and returns authoritative metadata", async () => {
  const content = Readable.from("content");
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) return head;
    return {};
  });
  const result = await adapter.createQuarantineObject(quarantine, content, 42);
  assert.ok(client.calls[0] instanceof PutObjectCommand);
  assert.ok(client.calls[1] instanceof HeadObjectCommand);
  assert.equal(
    (client.calls[1] as HeadObjectCommand).input.ChecksumMode,
    "ENABLED",
  );
  assert.equal(result.sizeBytes, 42);
  assert.equal(result.contentType, "application/pdf");
  assert.equal(result.checksum, "trusted-checksum");
  assert.equal((client.calls[0] as PutObjectCommand).input.Body, content);
  assert.equal((client.calls[0] as PutObjectCommand).input.ContentLength, 42);
  assert.equal((client.calls[0] as PutObjectCommand).input.ACL, undefined);
  assert.equal((client.calls[0] as PutObjectCommand).input.IfNoneMatch, "*");
});

for (const invalidSize of [
  0,
  -1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
]) {
  test(
    "quarantine upload rejects invalid expected size " + invalidSize,
    async () => {
      const { adapter, client } = harness();
      await assertStorageError(
        () =>
          adapter.createQuarantineObject(
            quarantine,
            Readable.from("content"),
            invalidSize,
          ),
        "INVALID_METADATA",
      );
      assert.equal(client.calls.length, 0);
    },
  );
}

test("conditional quarantine conflict is sanitized without cleanup or success", async () => {
  const { adapter, client } = harness((command) => {
    if (command instanceof PutObjectCommand) throw conditionalConflict(412);
    return head;
  });
  await assertStorageError(
    () =>
      adapter.createQuarantineObject(quarantine, Readable.from("content"), 42),
    "DESTINATION_CONFLICT",
  );
  assert.equal(client.calls.length, 1);
  assertNoDelete(client.calls);
});

test("quarantine upload rejects available keys", async () => {
  const { adapter } = harness();
  await assertStorageError(
    () =>
      adapter.createQuarantineObject(available, Readable.from("content"), 42),
    "INVALID_LOCATION",
  );
});

test("upload requires positive content length and does not clean up failed verification", async () => {
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) return {};
    return {};
  });
  await assertStorageError(
    () =>
      adapter.createQuarantineObject(quarantine, Readable.from("content"), 42),
    "INVALID_METADATA",
  );
  assert.equal(
    client.calls.some((command) => command instanceof DeleteObjectCommand),
    false,
  );
});

test("quarantine upload rejects an authoritative size mismatch without cleanup", async () => {
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) {
      return { ...head, ContentLength: 41 };
    }
    return {};
  });
  await assertStorageError(
    () =>
      adapter.createQuarantineObject(quarantine, Readable.from("content"), 42),
    "INVALID_METADATA",
  );
  assert.deepEqual(
    client.calls.map((command) => command?.constructor.name),
    ["PutObjectCommand", "HeadObjectCommand"],
  );
  assertNoDelete(client.calls);
});

test("ETag is not treated as a checksum", async () => {
  const { adapter } = harness((command) => {
    if (command instanceof HeadObjectCommand)
      return { ContentLength: 42, ETag: "etag-value" };
    return {};
  });
  const result = await adapter.createQuarantineObject(
    quarantine,
    Readable.from("content"),
    42,
  );
  assert.equal(result.checksum, undefined);
});

test("read returns a Node Readable without buffering", async () => {
  const body = Readable.from("content");
  const { adapter } = harness(() => ({ Body: body }));
  assert.equal(await adapter.readObject(quarantine), body);
});

test("read rejects an incompatible response body", async () => {
  const { adapter } = harness(() => ({ Body: new Uint8Array([1]) }));
  await assertStorageError(
    () => adapter.readObject(quarantine),
    "INVALID_METADATA",
  );
});

test("read maps confirmed missing objects and sanitizes other failures", async () => {
  const absent = harness(() => {
    throw missing();
  });
  await assertStorageError(
    () => absent.adapter.readObject(quarantine),
    "NOT_FOUND",
  );

  const failed = harness(() => {
    throw new Error(`network failure ${config.secretKey}`);
  });
  await assertStorageError(
    () => failed.adapter.readObject(quarantine),
    "OPERATION_FAILED",
  );
});

test("stat returns safe metadata and null only for confirmed missing objects", async () => {
  const present = harness(() => head);
  assert.deepEqual(await present.adapter.statObject(available), {
    ...available,
    sizeBytes: 42,
    contentType: "application/pdf",
    checksum: "trusted-checksum",
  });
  const absent = harness(() => {
    throw missing();
  });
  assert.equal(await absent.adapter.statObject(available), null);
});

for (const failure of [
  Object.assign(new Error("denied"), {
    name: "AccessDenied",
    $metadata: { httpStatusCode: 403 },
  }),
  new Error("network unavailable"),
]) {
  test(`stat propagates ${failure.message} safely`, async () => {
    const { adapter } = harness(() => {
      throw failure;
    });
    await assertStorageError(
      () => adapter.statObject(available),
      "OPERATION_FAILED",
    );
  });
}

function promotionStream(content = promotionContent) {
  return Readable.from([content]);
}

class TrackingReadable extends Readable {
  chunksConsumed = 0;
  destroyCalls = 0;
  completed = false;

  constructor(
    private readonly chunks: readonly Buffer[],
    private readonly throwOnDestroy = false,
  ) {
    super({ highWaterMark: 1 });
  }

  override _read(): void {
    const chunk = this.chunks[this.chunksConsumed];
    if (!chunk) {
      this.completed = true;
      this.push(null);
      return;
    }
    this.chunksConsumed += 1;
    this.push(chunk);
  }

  override destroy(error?: Error): this {
    this.destroyCalls += 1;
    if (this.throwOnDestroy) {
      throw new Error(`cleanup detail ${config.secretKey}`);
    }
    return super.destroy(error);
  }
}

for (const invalidSize of [
  0,
  -1,
  1.5,
  Number.NaN,
  Number.MAX_SAFE_INTEGER + 1,
]) {
  test("promotion rejects invalid trusted size " + invalidSize, async () => {
    const { adapter, client } = harness();
    await assertStorageError(
      () =>
        adapter.moveToAvailable(quarantine, available, {
          ...promotionExpectation,
          expectedSizeBytes: invalidSize,
        }),
      "INVALID_METADATA",
    );
    assert.equal(client.calls.length, 0);
  });
}

for (const invalidChecksum of ["", "f".repeat(63), "g".repeat(64)]) {
  test("promotion rejects malformed trusted checksum", async () => {
    const { adapter, client } = harness();
    await assertStorageError(
      () =>
        adapter.moveToAvailable(quarantine, available, {
          ...promotionExpectation,
          expectedChecksumSha256: invalidChecksum,
        }),
      "INVALID_METADATA",
    );
    assert.equal(client.calls.length, 0);
  });
}

for (const destination of [
  { ...available, objectKey: "available/department-a/different-id" },
  { ...available, objectKey: "available/department-b/01JXYZ8J4H3K2M1N" },
]) {
  test("promotion enforces deterministic destination mapping", async () => {
    const { adapter, client } = harness();
    await assertStorageError(
      () =>
        adapter.moveToAvailable(quarantine, destination, promotionExpectation),
      "INVALID_LOCATION",
    );
    assert.equal(client.calls.length, 0);
  });
}

test("source and destination missing returns not found", async () => {
  const { adapter, client } = harness(() => {
    throw missing();
  });
  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available, promotionExpectation),
    "NOT_FOUND",
  );
  assert.equal(client.calls.length, 2);
});

test("source missing retry authenticates matching destination by streamed SHA-256", async () => {
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) {
      if (command.input.Key === quarantine.objectKey) throw missing();
      return promotionHead;
    }
    if (command instanceof GetObjectCommand) {
      assert.equal(command.input.Key, available.objectKey);
      assert.equal(command.input.IfMatch, promotionHead.ETag);
      return { Body: promotionStream() };
    }
    return {};
  });
  const result = await adapter.moveToAvailable(
    quarantine,
    available,
    promotionExpectation,
  );
  assert.equal(result.sizeBytes, promotionContent.length);
  assert.equal(client.calls.length, 3);
  assertNoDelete(client.calls);
});

test("source missing same-size wrong destination is a conflict", async () => {
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) {
      if (command.input.Key === quarantine.objectKey) throw missing();
      return promotionHead;
    }
    if (command instanceof GetObjectCommand) {
      return { Body: promotionStream(wrongPromotionContent) };
    }
    return {};
  });
  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available, promotionExpectation),
    "DESTINATION_CONFLICT",
  );
  assertNoDelete(client.calls);
});

test("different-size existing destination conflicts and retains source", async () => {
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) {
      return command.input.Key === quarantine.objectKey
        ? promotionHead
        : { ...promotionHead, ContentLength: promotionContent.length + 1 };
    }
    return {};
  });
  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available, promotionExpectation),
    "DESTINATION_CONFLICT",
  );
  assertNoDelete(client.calls);
});

test("same-size wrong existing destination conflicts and retains source", async () => {
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) return promotionHead;
    if (command instanceof GetObjectCommand) {
      assert.equal(command.input.Key, available.objectKey);
      return { Body: promotionStream(wrongPromotionContent) };
    }
    return {};
  });
  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available, promotionExpectation),
    "DESTINATION_CONFLICT",
  );
  assertNoDelete(client.calls);
});

test("matching existing destination permits guarded source deletion", async () => {
  const destinationStream = new TrackingReadable([promotionContent]);
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) return promotionHead;
    if (command instanceof GetObjectCommand) {
      assert.equal(command.input.Key, available.objectKey);
      return { Body: destinationStream };
    }
    if (command instanceof DeleteObjectCommand) {
      assert.equal(destinationStream.completed, true);
      assert.equal(command.input.Key, quarantine.objectKey);
      assert.notEqual(command.input.Key, available.objectKey);
    }
    return {};
  });
  const result = await adapter.moveToAvailable(
    quarantine,
    available,
    promotionExpectation,
  );
  assert.equal(result.sizeBytes, promotionContent.length);
  const deletes = client.calls.filter(
    (command) => command instanceof DeleteObjectCommand,
  ) as DeleteObjectCommand[];
  assert.equal(deletes.length, 1);
  assert.equal(deletes[0]!.input.Key, quarantine.objectKey);
});

test("normal promotion streams two source passes into conditional Put then verifies", async () => {
  let destinationHeadCount = 0;
  let sourceGetCount = 0;
  const secondPassStream = new TrackingReadable([promotionContent]);
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) {
      if (command.input.Key === quarantine.objectKey) return promotionHead;
      destinationHeadCount += 1;
      if (destinationHeadCount === 1) throw missing();
      return promotionHead;
    }
    if (command instanceof GetObjectCommand) {
      if (command.input.Key === quarantine.objectKey) {
        sourceGetCount += 1;
        assert.equal(command.input.IfMatch, promotionHead.ETag);
        return {
          Body: sourceGetCount === 1 ? promotionStream() : secondPassStream,
        };
      }
      return { Body: promotionStream() };
    }
    if (command instanceof PutObjectCommand) {
      assert.equal(command.input.Key, available.objectKey);
      assert.equal(command.input.Body, secondPassStream);
      assert.equal(command.input.IfNoneMatch, "*");
      assert.equal(command.input.ContentLength, promotionContent.length);
      assert.equal(command.input.ContentType, promotionHead.ContentType);
    }
    return {};
  });

  const result = await adapter.moveToAvailable(
    quarantine,
    available,
    promotionExpectation,
  );
  assert.equal(result.sizeBytes, promotionContent.length);
  assert.equal(sourceGetCount, 2);
  assert.ok(secondPassStream.destroyCalls >= 1);
  assert.deepEqual(
    client.calls.map((command) => command?.constructor.name),
    [
      "HeadObjectCommand",
      "HeadObjectCommand",
      "GetObjectCommand",
      "GetObjectCommand",
      "PutObjectCommand",
      "HeadObjectCommand",
      "GetObjectCommand",
      "DeleteObjectCommand",
    ],
  );
  assert.equal(
    client.calls.some(
      (command) => command?.constructor.name === "CopyObjectCommand",
    ),
    false,
  );
});

for (const status of [409, 412] as const) {
  test(
    "conditional destination Put conflict retains source " + status,
    async () => {
      let sourceGets = 0;
      const secondPassStream = new TrackingReadable([promotionContent]);
      const { adapter, client } = harness((command) => {
        if (command instanceof HeadObjectCommand) {
          if (command.input.Key === quarantine.objectKey) return promotionHead;
          throw missing();
        }
        if (command instanceof GetObjectCommand) {
          sourceGets += 1;
          return {
            Body: sourceGets === 1 ? promotionStream() : secondPassStream,
          };
        }
        if (command instanceof PutObjectCommand) {
          throw conditionalConflict(status);
        }
        return {};
      });
      await assertStorageError(
        () =>
          adapter.moveToAvailable(quarantine, available, promotionExpectation),
        "RECONCILIATION_REQUIRED",
      );
      assert.equal(sourceGets, 2);
      assert.ok(secondPassStream.destroyCalls >= 1);
      assertNoDelete(client.calls);
      assert.equal(
        client.calls.some(
          (command) =>
            command instanceof DeleteObjectCommand &&
            command.input.Key === available.objectKey,
        ),
        false,
      );
    },
  );
}

test("generic destination Put failure disposes the second source stream", async () => {
  let sourceGets = 0;
  const secondPassStream = new TrackingReadable([promotionContent]);
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) {
      if (command.input.Key === quarantine.objectKey) return promotionHead;
      throw missing();
    }
    if (command instanceof GetObjectCommand) {
      sourceGets += 1;
      return { Body: sourceGets === 1 ? promotionStream() : secondPassStream };
    }
    if (command instanceof PutObjectCommand) {
      throw new Error(`provider detail ${config.secretKey}`);
    }
    return {};
  });
  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available, promotionExpectation),
    "RECONCILIATION_REQUIRED",
  );
  assert.ok(secondPassStream.destroyCalls >= 1);
  assertNoDelete(client.calls);
});

test("stream cleanup failure preserves the sanitized destination Put outcome", async () => {
  let sourceGets = 0;
  const secondPassStream = new TrackingReadable([promotionContent], true);
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) {
      if (command.input.Key === quarantine.objectKey) return promotionHead;
      throw missing();
    }
    if (command instanceof GetObjectCommand) {
      sourceGets += 1;
      return { Body: sourceGets === 1 ? promotionStream() : secondPassStream };
    }
    if (command instanceof PutObjectCommand) throw conditionalConflict(409);
    return {};
  });
  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available, promotionExpectation),
    "RECONCILIATION_REQUIRED",
  );
  assert.equal(secondPassStream.destroyCalls, 1);
  assertNoDelete(client.calls);
});

test("oversized source verification stops before consuming remaining chunks", async () => {
  const oversized = new TrackingReadable([
    promotionContent,
    Buffer.from("overflow"),
    Buffer.from("must-not-be-consumed"),
  ]);
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) {
      if (command.input.Key === quarantine.objectKey) return promotionHead;
      throw missing();
    }
    if (command instanceof GetObjectCommand) return { Body: oversized };
    return {};
  });
  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available, promotionExpectation),
    "RECONCILIATION_REQUIRED",
  );
  assert.ok(oversized.destroyCalls >= 1);
  assert.ok(oversized.chunksConsumed < 3);
  assert.equal(
    client.calls.some((command) => command instanceof PutObjectCommand),
    false,
  );
  assertNoDelete(client.calls);
});

test("oversized destination verification stops before consuming remaining chunks", async () => {
  const oversized = new TrackingReadable([
    promotionContent,
    Buffer.from("overflow"),
    Buffer.from("must-not-be-consumed"),
  ]);
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) return promotionHead;
    if (command instanceof GetObjectCommand) return { Body: oversized };
    return {};
  });
  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available, promotionExpectation),
    "DESTINATION_CONFLICT",
  );
  assert.ok(oversized.destroyCalls >= 1);
  assert.ok(oversized.chunksConsumed < 3);
  assertNoDelete(client.calls);
});

test("source second-pass IfMatch failure retains source", async () => {
  let sourceGets = 0;
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) {
      if (command.input.Key === quarantine.objectKey) return promotionHead;
      throw missing();
    }
    if (command instanceof GetObjectCommand) {
      sourceGets += 1;
      assert.equal(command.input.IfMatch, promotionHead.ETag);
      if (sourceGets === 2) throw conditionalConflict(412);
      return { Body: promotionStream() };
    }
    return {};
  });
  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available, promotionExpectation),
    "RECONCILIATION_REQUIRED",
  );
  assert.equal(
    client.calls.some((command) => command instanceof PutObjectCommand),
    false,
  );
  assertNoDelete(client.calls);
});

test("missing source provider ETag fails before destination creation", async () => {
  const withoutEtag = { ...promotionHead, ETag: undefined };
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) {
      if (command.input.Key === quarantine.objectKey) return withoutEtag;
      throw missing();
    }
    if (command instanceof GetObjectCommand) {
      return { Body: promotionStream() };
    }
    return {};
  });
  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available, promotionExpectation),
    "RECONCILIATION_REQUIRED",
  );
  assert.equal(
    client.calls.some((command) => command instanceof PutObjectCommand),
    false,
  );
  assertNoDelete(client.calls);
});

test("trusted source checksum mismatch prevents destination creation", async () => {
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) {
      if (command.input.Key === quarantine.objectKey) return promotionHead;
      throw missing();
    }
    if (command instanceof GetObjectCommand) {
      return { Body: promotionStream(wrongPromotionContent) };
    }
    return {};
  });
  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available, promotionExpectation),
    "RECONCILIATION_REQUIRED",
  );
  assert.equal(
    client.calls.some((command) => command instanceof PutObjectCommand),
    false,
  );
  assertNoDelete(client.calls);
});

test("post-write destination checksum mismatch retains source", async () => {
  let destinationHeads = 0;
  let sourceGets = 0;
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) {
      if (command.input.Key === quarantine.objectKey) return promotionHead;
      destinationHeads += 1;
      if (destinationHeads === 1) throw missing();
      return promotionHead;
    }
    if (command instanceof GetObjectCommand) {
      if (command.input.Key === quarantine.objectKey) {
        sourceGets += 1;
        return { Body: promotionStream() };
      }
      return { Body: promotionStream(wrongPromotionContent) };
    }
    return {};
  });
  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available, promotionExpectation),
    "RECONCILIATION_REQUIRED",
  );
  assert.equal(sourceGets, 2);
  assertNoDelete(client.calls);
});

test("destination verification provider failure is sanitized as reconciliation", async () => {
  let destinationHeads = 0;
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) {
      if (command.input.Key === quarantine.objectKey) return promotionHead;
      destinationHeads += 1;
      if (destinationHeads === 1) throw missing();
      return promotionHead;
    }
    if (command instanceof GetObjectCommand) {
      if (command.input.Key === available.objectKey) {
        throw new Error("provider verification detail");
      }
      return { Body: promotionStream() };
    }
    return {};
  });
  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available, promotionExpectation),
    "RECONCILIATION_REQUIRED",
  );
  assertNoDelete(client.calls);
});

test("source deletion failure after verified destination requires reconciliation", async () => {
  const { adapter } = harness((command) => {
    if (command instanceof HeadObjectCommand) return promotionHead;
    if (command instanceof GetObjectCommand) {
      return { Body: promotionStream() };
    }
    if (command instanceof DeleteObjectCommand) {
      throw new Error("provider deletion detail");
    }
    return {};
  });
  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available, promotionExpectation),
    "RECONCILIATION_REQUIRED",
  );
});

test("delete issues a command and treats confirmed absence as success", async () => {
  const normal = harness(() => ({}));
  await normal.adapter.deleteObject(quarantine);
  assert.ok(normal.client.calls[0] instanceof DeleteObjectCommand);

  const absent = harness(() => {
    throw missing();
  });
  await absent.adapter.deleteObject(quarantine);
});

test("signed URL accepts only available keys and passes the command to signer", async () => {
  const { adapter, signer } = harness();
  const before = Date.now();
  const result = await adapter.createSignedReadUrl(available, 60);
  const after = Date.now();
  assert.equal(result.url, "https://signed.example/private-value");
  assert.equal(signer.calls.length, 1);
  assert.equal(signer.calls[0]!.expiresInSeconds, 60);
  assert.equal(signer.calls[0]!.command.input.Key, available.objectKey);
  assert.ok(result.expiresAt.getTime() >= before + 60_000);
  assert.ok(result.expiresAt.getTime() <= after + 60_000);

  await assertStorageError(
    () => adapter.createSignedReadUrl(quarantine, 60),
    "INVALID_LOCATION",
  );
});

for (const ttl of [0, 901, 1.5]) {
  test(`signed URL rejects invalid TTL ${ttl}`, async () => {
    const { adapter } = harness();
    await assertStorageError(
      () => adapter.createSignedReadUrl(available, ttl),
      "INVALID_LOCATION",
    );
  });
}

test("signer failures are sanitized", async () => {
  const { adapter, signer } = harness();
  signer.sign = async () => {
    throw new Error(`signer detail ${config.secretKey}`);
  };
  await assertStorageError(
    () => adapter.createSignedReadUrl(available, 60),
    "OPERATION_FAILED",
  );
});

function assertNoDelete(calls: unknown[]) {
  assert.equal(
    calls.some((command) => command instanceof DeleteObjectCommand),
    false,
  );
}
