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
export interface SignedReadUrl {
  url: string;
  expiresAt: Date;
}

export interface ObjectStoragePort {
  createQuarantineObject(
    location: ObjectLocation,
    content: Readable,
  ): Promise<ObjectMetadata>;
  readObject(location: ObjectLocation): Promise<Readable>;
  moveToAvailable(
    source: ObjectLocation,
    destination: ObjectLocation,
  ): Promise<ObjectMetadata>;
  deleteObject(location: ObjectLocation): Promise<void>;
  createSignedReadUrl(
    location: ObjectLocation,
    expiresInSeconds: number,
  ): Promise<SignedReadUrl>;
  statObject(location: ObjectLocation): Promise<ObjectMetadata | null>;
}
