import {
  normalizedRowSchema,
  type NormalizedRow,
} from "../lib/schema";
import type { ParserProgress } from "./types";

export const MAX_PARSER_BATCH_SIZE = 2_000;

function formatValidationError(
  issues: ReadonlyArray<{
    message: string;
    path: ReadonlyArray<PropertyKey>;
  }>,
): string {
  return issues
    .map((issue) => {
      const path =
        issue.path.length === 0 ? "<row>" : issue.path.map(String).join(".");
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export class ValidatedBatchEmitter {
  private batch: NormalizedRow[] = [];
  private emittedCount = 0;

  constructor(
    private readonly emit: (batch: NormalizedRow[]) => Promise<void>,
    private readonly progress: (progress: ParserProgress) => void,
  ) {}

  get emitted(): number {
    return this.emittedCount;
  }

  async add(candidate: unknown, source: string, label: string): Promise<void> {
    const validation = normalizedRowSchema.safeParse(candidate);
    if (!validation.success) {
      throw new Error(
        `Parser produced an invalid row from ${source}: ${formatValidationError(
          validation.error.issues,
        )}`,
      );
    }

    this.batch.push(validation.data);
    if (this.batch.length === MAX_PARSER_BATCH_SIZE) {
      await this.flush(label);
    }
  }

  async flush(label: string): Promise<void> {
    if (this.batch.length === 0) {
      return;
    }

    const pending = this.batch;
    await this.emit(pending);
    this.batch = [];
    this.emittedCount += pending.length;
    this.progress({ done: this.emittedCount, label });
  }

  async finish(label: string): Promise<void> {
    if (this.batch.length > 0) {
      await this.flush(label);
    } else {
      this.progress({ done: this.emittedCount, label });
    }
  }
}
