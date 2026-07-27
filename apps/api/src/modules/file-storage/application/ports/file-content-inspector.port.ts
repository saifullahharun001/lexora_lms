import type { Readable } from "node:stream";

export interface InspectedFileContent {
  canonicalMimeType: string;
  recognizedExtension: string;
}
export type ContentInspectionErrorCode =
  | "CONTENT_UNRECOGNIZED"
  | "CONTENT_INSPECTION_TIMEOUT"
  | "CONTENT_INSPECTION_FAILED";
export class ContentInspectionError extends Error {
  constructor(readonly code: ContentInspectionErrorCode) {
    super("File content inspection failed");
  }
}
/** Consumes and disposes the supplied stream. Detection uses bytes only, never client claims. Failures are sanitized and fail closed. */
export interface FileContentInspectorPort {
  inspect(content: Readable | Uint8Array): Promise<InspectedFileContent>;
}
