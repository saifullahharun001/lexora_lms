import type { Readable } from "node:stream";

export interface ObjectLocation {
  bucket: string;
  objectKey: string;
}
export interface ObjectMetadata extends ObjectLocation {
  sizeBytes: number;
  contentType?: string;
  checksum?: string;
}
export interface ObjectPromotionExpectation {
  expectedSizeBytes: number;
  expectedChecksumSha256: string;
}
export interface SignedReadUrl {
  url: string;
  expiresAt: Date;
}

export interface ObjectStoragePort {
  createQuarantineObject(
    location: ObjectLocation,
    content: Readable,
    // Trusted server-side byte count required for streaming object-storage writes.
    expectedSizeBytes: number,
  ): Promise<ObjectMetadata>;
  readObject(location: ObjectLocation): Promise<Readable>;
  moveToAvailable(
    source: ObjectLocation,
    destination: ObjectLocation,
    expectation: ObjectPromotionExpectation,
  ): Promise<ObjectMetadata>;
  deleteObject(location: ObjectLocation): Promise<void>;
  createSignedReadUrl(
    location: ObjectLocation,
    expiresInSeconds: number,
  ): Promise<SignedReadUrl>;
  statObject(location: ObjectLocation): Promise<ObjectMetadata | null>;
}
