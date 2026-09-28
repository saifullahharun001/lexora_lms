import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CLASS_SESSION_REPOSITORY } from "../../domain/class-session.constants";
import type { ClassSessionRepositoryPort, DueSessionCursor } from "../ports/class-session.repository.port";
import { ClassSessionLifecycleRuntime } from "./class-session-lifecycle.runtime";

@Injectable()
export class ClassSessionLifecycleReconciler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ClassSessionLifecycleReconciler.name);
  private readonly intervalMs: number;
  private timer?: { cancel(): void };
  private pending?: Promise<void>;
  private stopped = false;
  private cursor?: DueSessionCursor;

  constructor(
    @Inject(CLASS_SESSION_REPOSITORY) private readonly repository: ClassSessionRepositoryPort,
    private readonly runtime: ClassSessionLifecycleRuntime,
    config: ConfigService,
  ) {
    this.intervalMs = config.get<number>("CLASS_SESSION_RECONCILIATION_INTERVAL_MS", 10_000);
    if (!Number.isInteger(this.intervalMs) || this.intervalMs < 1_000 || this.intervalMs > 60_000) {
      throw new Error("CLASS_SESSION_RECONCILIATION_INTERVAL_MS must be an integer from 1000 to 60000");
    }
  }

  async onApplicationBootstrap() { await this.run(); }

  // Local overlap suppression is only an optimisation; database locking guarantees correctness.
  run(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.pending) return this.pending;
    this.timer?.cancel();
    this.timer = undefined;
    this.pending = this.sweep().finally(() => {
      this.pending = undefined;
      if (!this.stopped) this.timer = this.runtime.schedule(() => { void this.run(); }, this.intervalMs);
    });
    return this.pending;
  }

  private async sweep() {
    try {
      const result = await this.repository.reconcileDue(this.cursor);
      this.cursor = result.cursor ?? undefined;
    } catch {
      this.logger.error("Class session reconciliation sweep failed; next bounded sweep will retry");
    }
  }

  async onModuleDestroy() {
    this.stopped = true;
    this.timer?.cancel();
    await this.pending;
  }
}
