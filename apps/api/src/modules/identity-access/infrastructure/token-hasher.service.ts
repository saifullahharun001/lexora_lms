import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";

@Injectable()
export class TokenHasherService {
  hash(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  compareHashes(leftHash: string, rightHash: string): boolean {
    if (leftHash.length !== rightHash.length) {
      return false;
    }

    return timingSafeEqual(Buffer.from(leftHash, "hex"), Buffer.from(rightHash, "hex"));
  }

  generateOpaqueToken(size = 32): string {
    return randomBytes(size).toString("hex");
  }
}
