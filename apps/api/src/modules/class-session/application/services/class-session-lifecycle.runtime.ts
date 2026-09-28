import { Injectable } from "@nestjs/common";

@Injectable()
export class ClassSessionLifecycleRuntime {
  schedule(callback: () => void, delayMs: number) {
    const timer = setTimeout(callback, delayMs);
    timer.unref();
    return { cancel: () => clearTimeout(timer) };
  }
}
