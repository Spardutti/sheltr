import { log } from "../ui/index.js";

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
    process.exit(1);
  }

  // Never leak internal error details to the user
  log.error("An unexpected error occurred.");

  if (process.env.DEBUG) {
    console.error(error);
  }

  process.exit(1);
}
