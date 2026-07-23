import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import {
  CopyObjectCommand,
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
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) return head;
    return {};
  });
  const result = await adapter.createQuarantineObject(
    quarantine,
    Readable.from("content"),
  );
  assert.ok(client.calls[0] instanceof PutObjectCommand);
  assert.ok(client.calls[1] instanceof HeadObjectCommand);
  assert.equal(
    (client.calls[1] as HeadObjectCommand).input.ChecksumMode,
    "ENABLED",
  );
  assert.equal(result.sizeBytes, 42);
  assert.equal(result.contentType, "application/pdf");
  assert.equal(result.checksum, "trusted-checksum");
  assert.equal((client.calls[0] as PutObjectCommand).input.ACL, undefined);
  assert.equal((client.calls[0] as PutObjectCommand).input.IfNoneMatch, "*");
});

test("conditional quarantine conflict is sanitized without cleanup or success", async () => {
  const { adapter, client } = harness((command) => {
    if (command instanceof PutObjectCommand) throw conditionalConflict(412);
    return head;
  });
  await assertStorageError(
    () => adapter.createQuarantineObject(quarantine, Readable.from("content")),
    "DESTINATION_CONFLICT",
  );
  assert.equal(client.calls.length, 1);
  assertNoDelete(client.calls);
});

test("quarantine upload rejects available keys", async () => {
  const { adapter } = harness();
  await assertStorageError(
    () => adapter.createQuarantineObject(available, Readable.from("content")),
    "INVALID_LOCATION",
  );
});

test("upload requires positive content length and does not clean up failed verification", async () => {
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) return {};
    return {};
  });
  await assertStorageError(
    () => adapter.createQuarantineObject(quarantine, Readable.from("content")),
    "INVALID_METADATA",
  );
  assert.equal(
    client.calls.some((command) => command instanceof DeleteObjectCommand),
    false,
  );
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

test("move copies, verifies destination, then deletes source", async () => {
  let destinationHeads = 0;
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) {
      if (command.input.Key === sourceKey()) return head;
      destinationHeads += 1;
      if (destinationHeads === 1) throw missing();
      return head;
    }
    return {};
  });
  assert.equal(
    (await adapter.moveToAvailable(quarantine, available)).sizeBytes,
    42,
  );
  assert.deepEqual(
    client.calls.map((command) => command?.constructor.name),
    [
      "HeadObjectCommand",
      "HeadObjectCommand",
      "CopyObjectCommand",
      "HeadObjectCommand",
      "DeleteObjectCommand",
    ],
  );
  const copy = client.calls[2] as CopyObjectCommand;
  assert.equal(
    copy.input.CopySource,
    encodeURIComponent(`${config.bucket}/${quarantine.objectKey}`),
  );
  assert.equal(copy.input.CopySourceIfMatch, head.ETag);
  assert.equal(
    (
      copy.input as typeof copy.input & {
        IfNoneMatch?: string;
      }
    ).IfNoneMatch,
    "*",
  );
});

test("actual copy middleware inserts destination If-None-Match header", async () => {
  let destinationHeads = 0;
  let terminalRequest:
    | { headers?: Record<string, string | undefined> }
    | undefined;
  const { adapter } = harness(async (command) => {
    if (command instanceof HeadObjectCommand) {
      if (command.input.Key === sourceKey()) return head;
      destinationHeads += 1;
      if (destinationHeads === 1) throw missing();
      return head;
    }
    if (command instanceof CopyObjectCommand) {
      const handler = command.middlewareStack.resolve(async (args) => {
        terminalRequest = args.request as {
          headers?: Record<string, string | undefined>;
        };
        return {
          response: {},
          output: { $metadata: {} },
        };
      }, {} as never);
      await handler({
        input: command.input,
        request: { headers: {} },
      } as never);
      assert.equal(command.input.CopySourceIfMatch, head.ETag);
    }
    return {};
  });

  await adapter.moveToAvailable(quarantine, available);
  assert.equal(terminalRequest?.headers?.["if-none-match"], "*");
});

for (const [name, destination] of [
  [
    "mismatched opaque identity",
    { ...available, objectKey: "available/department-a/different-id" },
  ],
  [
    "mismatched department path",
    { ...available, objectKey: "available/department-b/01JXYZ8J4H3K2M1N" },
  ],
] as const) {
  test(`${name} is rejected before any storage request`, async () => {
    const { adapter, client } = harness();
    await assertStorageError(
      () => adapter.moveToAvailable(quarantine, destination),
      "INVALID_LOCATION",
    );
    assert.equal(client.calls.length, 0);
  });
}

test("source missing plus unrelated destination is not treated as moved", async () => {
  const { adapter, client } = harness(() => head);
  await assertStorageError(
    () =>
      adapter.moveToAvailable(quarantine, {
        ...available,
        objectKey: "available/department-a/unrelated-id",
      }),
    "INVALID_LOCATION",
  );
  assert.equal(client.calls.length, 0);
});

test("copy failure retains the quarantine source", async () => {
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) {
      if (command.input.Key === sourceKey()) return head;
      throw missing();
    }
    if (command instanceof CopyObjectCommand) throw new Error("copy failed");
    return {};
  });
  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available),
    "OPERATION_FAILED",
  );
  assertNoDelete(client.calls);
});

test("copy precondition failure is sanitized and retains the source", async () => {
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) {
      if (command.input.Key === sourceKey()) return head;
      throw missing();
    }
    if (command instanceof CopyObjectCommand) {
      assert.equal(command.input.CopySourceIfMatch, head.ETag);
      throw new Error(`precondition detail ${config.secretKey}`);
    }
    return {};
  });
  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available),
    "OPERATION_FAILED",
  );
  assertNoDelete(client.calls);
});

test("destination conditional copy conflict retains source and supports safe retry", async () => {
  let destinationExists = false;
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) {
      if (command.input.Key === sourceKey()) return head;
      if (destinationExists) return head;
      throw missing();
    }
    if (command instanceof CopyObjectCommand) {
      assert.equal(
        (
          command.input as typeof command.input & {
            IfNoneMatch?: string;
          }
        ).IfNoneMatch,
        "*",
      );
      assert.equal(command.input.CopySourceIfMatch, head.ETag);
      destinationExists = true;
      throw conditionalConflict(409);
    }
    return {};
  });

  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available),
    "RECONCILIATION_REQUIRED",
  );
  assertNoDelete(client.calls);

  const callCountBeforeRetry = client.calls.length;
  const result = await adapter.moveToAvailable(quarantine, available);
  assert.equal(result.checksum, head.ChecksumSHA256);
  assert.ok(
    client.calls
      .slice(callCountBeforeRetry)
      .some((command) => command instanceof DeleteObjectCommand),
  );
});

test("copy middleware fails closed when serialized headers are unavailable", async () => {
  const { adapter, client } = harness(async (command) => {
    if (command instanceof HeadObjectCommand) {
      if (command.input.Key === sourceKey()) return head;
      throw missing();
    }
    if (command instanceof CopyObjectCommand) {
      const handler = command.middlewareStack.resolve(
        async () => ({
          response: {},
          output: { $metadata: {} },
        }),
        {} as never,
      );
      await handler({
        input: command.input,
        request: {},
      } as never);
    }
    return {};
  });

  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available),
    "OPERATION_FAILED",
  );
  assertNoDelete(client.calls);
});

test("destination verification failure retains the quarantine source", async () => {
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) {
      if (command.input.Key === sourceKey()) return head;
      throw missing();
    }
    return {};
  });
  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available),
    "RECONCILIATION_REQUIRED",
  );
  assertNoDelete(client.calls);
});

for (const [name, incompatible] of [
  ["size", { ...head, ContentLength: 41 }],
  ["checksum", { ...head, ChecksumSHA256: "different" }],
] as const) {
  test(`${name} mismatch blocks source deletion`, async () => {
    let destinationHeads = 0;
    const { adapter, client } = harness((command) => {
      if (command instanceof HeadObjectCommand) {
        if (command.input.Key === sourceKey()) return head;
        destinationHeads += 1;
        if (destinationHeads === 1) throw missing();
        return incompatible;
      }
      return {};
    });
    await assertStorageError(
      () => adapter.moveToAvailable(quarantine, available),
      "DESTINATION_CONFLICT",
    );
    assertNoDelete(client.calls);
  });
}

test("already-moved retry returns the compatible destination", async () => {
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) {
      if (command.input.Key === sourceKey()) throw missing();
      return head;
    }
    return {};
  });
  assert.equal(
    (await adapter.moveToAvailable(quarantine, available)).sizeBytes,
    42,
  );
  assert.equal(client.calls.length, 2);
});

test("compatible source-plus-destination retry deletes source without copying", async () => {
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) return head;
    return {};
  });
  await adapter.moveToAvailable(quarantine, available);
  assert.equal(
    client.calls.some((command) => command instanceof CopyObjectCommand),
    false,
  );
  assert.ok(client.calls.at(-1) instanceof DeleteObjectCommand);
});

test("same-size existing destination without checksums requires reconciliation", async () => {
  const metadataWithoutChecksums = {
    ContentLength: 42,
    ETag: "provider-concurrency-token",
  };
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) return metadataWithoutChecksums;
    return {};
  });
  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available),
    "RECONCILIATION_REQUIRED",
  );
  assertNoDelete(client.calls);
});

test("incompatible existing destination is rejected and source retained", async () => {
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) {
      return command.input.Key === sourceKey()
        ? head
        : { ...head, ContentLength: 100 };
    }
    return {};
  });
  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available),
    "DESTINATION_CONFLICT",
  );
  assertNoDelete(client.calls);
});

test("existing destination with unequal trustworthy checksum is rejected", async () => {
  const { adapter, client } = harness((command) => {
    if (command instanceof HeadObjectCommand) {
      return command.input.Key === sourceKey()
        ? head
        : { ...head, ChecksumSHA256: "different-trustworthy-checksum" };
    }
    return {};
  });
  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available),
    "DESTINATION_CONFLICT",
  );
  assertNoDelete(client.calls);
});

test("delete failure after verified copy reports reconciliation required", async () => {
  const { adapter } = harness((command) => {
    if (command instanceof HeadObjectCommand) return head;
    if (command instanceof DeleteObjectCommand) throw new Error("denied");
    return {};
  });
  await assertStorageError(
    () => adapter.moveToAvailable(quarantine, available),
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

function sourceKey() {
  return quarantine.objectKey;
}

function assertNoDelete(calls: unknown[]) {
  assert.equal(
    calls.some((command) => command instanceof DeleteObjectCommand),
    false,
  );
}
