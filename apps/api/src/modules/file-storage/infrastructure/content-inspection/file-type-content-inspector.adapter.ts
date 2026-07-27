import { Readable } from "node:stream";

import { Inject, Injectable, Optional } from "@nestjs/common";
import type { FileTypeParser as FileTypeParserType } from "file-type";
import { loadEsm } from "load-esm";

import { storageConfig } from "../../../../common/config/loaders/storage.config";
import type {
  FileContentInspectorPort,
  InspectedFileContent,
} from "../../application/ports/file-content-inspector.port";
import { ContentInspectionError } from "../../application/ports/file-content-inspector.port";

export { ContentInspectionError } from "../../application/ports/file-content-inspector.port";

type FileTypeModule = typeof import("file-type");
type FileTypeModuleLoader = () => Promise<FileTypeModule>;

export function createRetryableSharedModuleLoader(
  loader: FileTypeModuleLoader,
): FileTypeModuleLoader {
  let modulePromise: Promise<FileTypeModule> | undefined;
  return () => {
    modulePromise ??= loader().catch((error: unknown) => {
      modulePromise = undefined;
      throw error;
    });
    return modulePromise;
  };
}

const defaultLoader = createRetryableSharedModuleLoader(() =>
  loadEsm<FileTypeModule>("file-type"),
);

@Injectable()
export class FileTypeContentInspectorAdapter implements FileContentInspectorPort {
  constructor(
    @Inject(storageConfig.KEY)
    private readonly config: ReturnType<typeof storageConfig>,
    @Optional()
    private readonly loadModule: FileTypeModuleLoader = defaultLoader,
  ) {}

  async inspect(content: Readable | Uint8Array): Promise<InspectedFileContent> {
    const controller = new AbortController();
    let timedOut = false;
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new ContentInspectionError("CONTENT_INSPECTION_TIMEOUT"));
      }, this.config.contentInspectionTimeoutMs);
    });
    try {
      const detection = (async () => {
        const module = await this.loadModule();
        const Parser = module.FileTypeParser as typeof FileTypeParserType;
        const parser = new Parser({ signal: controller.signal });
        return content instanceof Readable
          ? parser.fromStream(Readable.toWeb(content))
          : parser.fromBuffer(content);
      })();
      const detected = await Promise.race([detection, timeout]);
      if (!detected) throw new ContentInspectionError("CONTENT_UNRECOGNIZED");
      return {
        canonicalMimeType: detected.mime.toLowerCase(),
        recognizedExtension: detected.ext.toLowerCase(),
      };
    } catch (error) {
      if (error instanceof ContentInspectionError) throw error;
      throw new ContentInspectionError(
        timedOut ? "CONTENT_INSPECTION_TIMEOUT" : "CONTENT_INSPECTION_FAILED",
      );
    } finally {
      clearTimeout(timer!);
      if (content instanceof Readable) {
        try {
          content.destroy();
        } catch {
          // Inspection owns the response stream; disposal never exposes provider details.
        }
      }
    }
  }
}
