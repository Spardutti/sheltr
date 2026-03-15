import { log } from "../ui/index.js";
import { showOutro } from "../ui/index.js";

export class SheltrError extends Error {
  constructor(
    message: string,
    public readonly code: string = "SHELTR_ERROR",
  ) {
    super(message);
    this.name = "SheltrError";
  }
}

export function handleError(error: unknown): never {
  if (error instanceof SheltrError) {
    log.error(error.message);
    showOutro();
    process.exit(1);
  }

  // Never leak internal error details to the user
  log.error("An unexpected error occurred.");

  if (process.env.DEBUG) {
    console.error(error);
  }

  showOutro();
  process.exit(1);
}

export function withErrorHandling<T extends (...args: never[]) => Promise<void>>(fn: T): T {
  return (async (...args: Parameters<T>) => {
    try {
      await fn(...args);
    } catch (error) {
      handleError(error);
    }
  }) as T;
}
