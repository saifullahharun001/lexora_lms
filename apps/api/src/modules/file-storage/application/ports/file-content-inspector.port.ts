import type { Readable } from "node:stream";

export interface InspectedFileContent {
  canonicalMimeType: string;
  recognizedExtension?: string;
  contentType?: string;
}
export interface FileContentInspectorPort {
  inspect(content: Readable | Uint8Array): Promise<InspectedFileContent>;
}
