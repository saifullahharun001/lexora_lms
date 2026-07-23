import { Readable } from "node:stream";

import {
  CopyObjectCommand,
  type CopyObjectCommandInput,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Inject, Injectable } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";

import { storageConfig } from "../../../../common/config/loaders/storage.config";
import type {
  ObjectLocation,
  ObjectMetadata,
  ObjectStoragePort,
  SignedReadUrl,
} from "../../application/ports/object-storage.port";

export const S3_COMMAND_CLIENT = Symbol("S3_COMMAND_CLIENT");
export const S3_URL_SIGNER = Symbol("S3_URL_SIGNER");
export const RAW_S3_CLIENT = Symbol("RAW_S3_CLIENT");

type StorageConfiguration = ConfigType<typeof storageConfig>;
type ControlledPrefix = "quarantine/" | "available/";

export interface S3CommandClient {
  send(command: unknown): Promise<unknown>;
}

export interface S3UrlSigner {
  sign(command: GetObjectCommand, expiresInSeconds: number): Promise<string>;
}

interface HeadResult {
  ContentLength?: number;
  ContentType?: string;
  ChecksumSHA256?: string;
  ETag?: string;
}

interface InternalObjectMetadata {
  publicMetadata: ObjectMetadata;
  providerEtag?: string;
}

interface GetResult {
  Body?: unknown;
}

type DestinationConditionalCopyInput = CopyObjectCommandInput & {
  IfNoneMatch: "*";
};

export class ObjectStorageInfrastructureError extends Error {
  constructor(
    readonly code:
      | "INVALID_LOCATION"
      | "NOT_FOUND"
      | "INVALID_METADATA"
      | "OPERATION_FAILED"
      | "DESTINATION_CONFLICT"
      | "RECONCILIATION_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "ObjectStorageInfrastructureError";
  }
}

export function buildS3ClientConfig(
  config: StorageConfiguration,
): S3ClientConfig {
  return {
    endpoint: config.endpoint,
    region: config.region,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
  };
}

export function createS3CommandClient(client: S3Client): S3CommandClient {
  return {
    send: (command) => client.send(command as never),
  };
}

export function createS3UrlSigner(client: S3Client): S3UrlSigner {
  return {
    sign: (command, expiresInSeconds) =>
      getSignedUrl(client, command, { expiresIn: expiresInSeconds }),
  };
}

@Injectable()
export class S3ObjectStorageAdapter implements ObjectStoragePort {
  constructor(
    @Inject(storageConfig.KEY)
    private readonly config: StorageConfiguration,
    @Inject(S3_COMMAND_CLIENT)
    private readonly client: S3CommandClient,
    @Inject(S3_URL_SIGNER)
    private readonly signer: S3UrlSigner,
  ) {}

  async createQuarantineObject(
    location: ObjectLocation,
    content: Readable,
  ): Promise<ObjectMetadata> {
    this.validateLocation(location, ["quarantine/"]);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: location.objectKey,
          Body: content,
          IfNoneMatch: "*",
        }),
      );
      const metadata = await this.head(location);
      if (metadata.publicMetadata.sizeBytes <= 0) {
        throw new ObjectStorageInfrastructureError(
          "INVALID_METADATA",
          "Stored object metadata is invalid",
        );
      }
      return metadata.publicMetadata;
    } catch (error) {
      if (this.isConditionalConflict(error)) {
        throw new ObjectStorageInfrastructureError(
          "DESTINATION_CONFLICT",
          "Quarantine object already exists",
        );
      }
      throw this.sanitizeFailure(error, "Object upload failed");
    }
  }

  async readObject(location: ObjectLocation): Promise<Readable> {
    this.validateLocation(location, ["quarantine/", "available/"]);
    try {
      const result = (await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: location.objectKey,
        }),
      )) as GetResult;
      if (!(result.Body instanceof Readable)) {
        throw new ObjectStorageInfrastructureError(
          "INVALID_METADATA",
          "Stored object body is not Node-readable",
        );
      }
      return result.Body;
    } catch (error) {
      if (this.isNotFound(error)) {
        throw new ObjectStorageInfrastructureError(
          "NOT_FOUND",
          "Stored object was not found",
        );
      }
      throw this.sanitizeFailure(error, "Object read failed");
    }
  }

  async statObject(location: ObjectLocation): Promise<ObjectMetadata | null> {
    this.validateLocation(location, ["quarantine/", "available/"]);
    try {
      return (await this.head(location)).publicMetadata;
    } catch (error) {
      if (this.isNotFound(error)) return null;
      throw this.sanitizeFailure(error, "Object metadata lookup failed");
    }
  }

  async moveToAvailable(
    source: ObjectLocation,
    destination: ObjectLocation,
  ): Promise<ObjectMetadata> {
    this.validateLocation(source, ["quarantine/"]);
    this.validateLocation(destination, ["available/"]);
    if (destination.objectKey !== this.expectedAvailableKey(source.objectKey)) {
      this.invalidLocation();
    }

    const sourceMetadata = await this.internalStatObject(source);
    const destinationMetadata = await this.internalStatObject(destination);

    if (!sourceMetadata) {
      if (destinationMetadata) return destinationMetadata.publicMetadata;
      throw new ObjectStorageInfrastructureError(
        "NOT_FOUND",
        "Quarantine object was not found",
      );
    }

    if (destinationMetadata) {
      this.assertStrongRetryCompatibility(
        sourceMetadata.publicMetadata,
        destinationMetadata.publicMetadata,
      );
      await this.deleteVerifiedSource(source);
      return destinationMetadata.publicMetadata;
    }

    try {
      const copyInput: DestinationConditionalCopyInput = {
        Bucket: this.config.bucket,
        Key: destination.objectKey,
        CopySource: encodeURIComponent(
          `${this.config.bucket}/${source.objectKey}`,
        ),
        IfNoneMatch: "*",
        ...(sourceMetadata.providerEtag
          ? { CopySourceIfMatch: sourceMetadata.providerEtag }
          : {}),
      };
      await this.client.send(
        this.createDestinationConditionalCopyCommand(copyInput),
      );
    } catch (error) {
      if (this.isConditionalConflict(error)) {
        throw new ObjectStorageInfrastructureError(
          "RECONCILIATION_REQUIRED",
          "Destination changed during copy; quarantine source was retained",
        );
      }
      throw this.sanitizeFailure(error, "Object copy failed");
    }

    const verifiedDestination = await this.internalStatObject(destination);
    if (!verifiedDestination) {
      throw new ObjectStorageInfrastructureError(
        "RECONCILIATION_REQUIRED",
        "Copied object could not be verified; quarantine source was retained",
      );
    }
    this.assertNormalCopyCompatible(
      sourceMetadata.publicMetadata,
      verifiedDestination.publicMetadata,
    );
    await this.deleteVerifiedSource(source);
    return verifiedDestination.publicMetadata;
  }

  async deleteObject(location: ObjectLocation): Promise<void> {
    this.validateLocation(location, ["quarantine/", "available/"]);
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.config.bucket,
          Key: location.objectKey,
        }),
      );
    } catch (error) {
      if (this.isNotFound(error)) return;
      throw this.sanitizeFailure(error, "Object deletion failed");
    }
  }

  async createSignedReadUrl(
    location: ObjectLocation,
    expiresInSeconds: number,
  ): Promise<SignedReadUrl> {
    this.validateLocation(location, ["available/"]);
    if (
      !Number.isInteger(expiresInSeconds) ||
      expiresInSeconds < 1 ||
      expiresInSeconds > 900
    ) {
      throw new ObjectStorageInfrastructureError(
        "INVALID_LOCATION",
        "Signed URL expiry is invalid",
      );
    }
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: location.objectKey,
    });
    const issuedAt = Date.now();
    try {
      const url = await this.signer.sign(command, expiresInSeconds);
      return {
        url,
        expiresAt: new Date(issuedAt + expiresInSeconds * 1_000),
      };
    } catch (error) {
      throw this.sanitizeFailure(error, "Signed URL generation failed");
    }
  }

  private async internalStatObject(
    location: ObjectLocation,
  ): Promise<InternalObjectMetadata | null> {
    try {
      return await this.head(location);
    } catch (error) {
      if (this.isNotFound(error)) return null;
      throw this.sanitizeFailure(error, "Object metadata lookup failed");
    }
  }

  private async head(
    location: ObjectLocation,
  ): Promise<InternalObjectMetadata> {
    const result = (await this.client.send(
      new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: location.objectKey,
        ChecksumMode: "ENABLED",
      }),
    )) as HeadResult;
    if (
      !Number.isSafeInteger(result.ContentLength) ||
      (result.ContentLength as number) < 0
    ) {
      throw new ObjectStorageInfrastructureError(
        "INVALID_METADATA",
        "Stored object metadata is invalid",
      );
    }
    return {
      publicMetadata: {
        bucket: this.config.bucket,
        objectKey: location.objectKey,
        sizeBytes: result.ContentLength as number,
        ...(result.ContentType ? { contentType: result.ContentType } : {}),
        ...(result.ChecksumSHA256 ? { checksum: result.ChecksumSHA256 } : {}),
      },
      ...(result.ETag ? { providerEtag: result.ETag } : {}),
    };
  }

  private validateLocation(
    location: ObjectLocation,
    allowedPrefixes: readonly ControlledPrefix[],
  ): void {
    const key = location.objectKey;
    if (location.bucket !== this.config.bucket) this.invalidLocation();
    if (
      !key ||
      key.startsWith("/") ||
      key.includes("\\") ||
      this.hasControlCharacters(key)
    ) {
      this.invalidLocation();
    }
    const segments = key.split("/");
    if (
      segments.some(
        (segment) =>
          !segment ||
          segment !== segment.trim() ||
          segment === "." ||
          segment === "..",
      ) ||
      !allowedPrefixes.some((prefix) => key.startsWith(prefix))
    ) {
      this.invalidLocation();
    }
  }

  private invalidLocation(): never {
    throw new ObjectStorageInfrastructureError(
      "INVALID_LOCATION",
      "Object storage location is not allowed",
    );
  }

  private hasControlCharacters(value: string): boolean {
    return Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) as number;
      return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
    });
  }

  private expectedAvailableKey(sourceKey: string): string {
    return `available/${sourceKey.slice("quarantine/".length)}`;
  }

  private createDestinationConditionalCopyCommand(
    input: DestinationConditionalCopyInput,
  ): CopyObjectCommand {
    const command = new CopyObjectCommand(input);
    // CopyObject supports destination If-None-Match, but the installed SDK model
    // does not yet serialize that field. Add the signed HTTP header explicitly.
    command.middlewareStack.add(
      (next) => async (args) => {
        const request = args.request as {
          headers?: Record<string, string | undefined>;
        };
        if (!request?.headers) {
          throw new Error("Copy request headers are unavailable");
        }
        request.headers["if-none-match"] = "*";
        return next(args);
      },
      {
        name: "lexoraDestinationIfNoneMatch",
        step: "build",
      },
    );
    return command;
  }

  private assertNormalCopyCompatible(
    source: ObjectMetadata,
    destination: ObjectMetadata,
  ): void {
    if (
      source.sizeBytes !== destination.sizeBytes ||
      (source.checksum &&
        destination.checksum &&
        source.checksum !== destination.checksum)
    ) {
      throw new ObjectStorageInfrastructureError(
        "DESTINATION_CONFLICT",
        "Destination object conflicts with the quarantine object",
      );
    }
  }

  private assertStrongRetryCompatibility(
    source: ObjectMetadata,
    destination: ObjectMetadata,
  ): void {
    this.assertNormalCopyCompatible(source, destination);
    if (!source.checksum || !destination.checksum) {
      throw new ObjectStorageInfrastructureError(
        "RECONCILIATION_REQUIRED",
        "Existing destination requires checksum-based reconciliation",
      );
    }
  }

  private async deleteVerifiedSource(source: ObjectLocation): Promise<void> {
    try {
      await this.deleteObject(source);
    } catch {
      throw new ObjectStorageInfrastructureError(
        "RECONCILIATION_REQUIRED",
        "Destination is verified but quarantine cleanup requires reconciliation",
      );
    }
  }

  private isNotFound(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const candidate = error as {
      name?: string;
      $metadata?: { httpStatusCode?: number };
    };
    return (
      candidate.$metadata?.httpStatusCode === 404 ||
      candidate.name === "NotFound" ||
      candidate.name === "NoSuchKey"
    );
  }

  private isConditionalConflict(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const status = (error as { $metadata?: { httpStatusCode?: number } })
      .$metadata?.httpStatusCode;
    return status === 409 || status === 412;
  }

  private sanitizeFailure(
    error: unknown,
    message: string,
  ): ObjectStorageInfrastructureError {
    if (error instanceof ObjectStorageInfrastructureError) return error;
    return new ObjectStorageInfrastructureError("OPERATION_FAILED", message);
  }
}
