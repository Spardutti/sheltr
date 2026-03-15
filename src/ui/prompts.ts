import * as p from "@clack/prompts";

function assertNotCancelled<T>(value: T | symbol): asserts value is T {
  if (p.isCancel(value)) {
    p.cancel("Operation cancelled.");
    process.exit(0);
  }
}

export async function askText(opts: {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  validate?: (value: string) => string | Error | undefined;
}): Promise<string> {
  const value = await p.text(opts);
  assertNotCancelled(value);
  return value;
}

export async function askConfirm(opts: {
  message: string;
  active?: string;
  inactive?: string;
  initialValue?: boolean;
}): Promise<boolean> {
  const value = await p.confirm(opts);
  assertNotCancelled(value);
  return value;
}

export async function askSelect<T extends { value: string; label: string }>(opts: {
  message: string;
  options: T[];
  initialValue?: string;
}): Promise<string> {
  const value = await p.select(opts);
  assertNotCancelled(value);
  return value as string;
}

export async function askMultiselect<T extends { value: string; label: string }>(opts: {
  message: string;
  options: T[];
  required?: boolean;
}): Promise<string[]> {
  const value = await p.multiselect(opts);
  assertNotCancelled(value);
  return value as string[];
}

export async function withSpinner<T>(opts: {
  start: string;
  stop?: string;
  task: () => Promise<T>;
}): Promise<T> {
  const s = p.spinner();
  s.start(opts.start);
  try {
    const result = await opts.task();
    s.stop(opts.stop ?? "Done");
    return result;
  } catch (err) {
    s.stop("Failed");
    throw err;
  }
}
