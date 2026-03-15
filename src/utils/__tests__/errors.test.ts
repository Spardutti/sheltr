import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../ui/index.js", () => ({
  showIntro: vi.fn(),
  showOutro: vi.fn(),
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockExit = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

import { SheltrError, handleError, withErrorHandling } from "../errors.js";

beforeEach(() => {
  mockExit.mockClear();
});

describe("SheltrError", () => {
  it("creates_error_with_message_and_code", () => {
    const err = new SheltrError("test message", "TEST_CODE");

    expect(err.message).toBe("test message");
    expect(err.code).toBe("TEST_CODE");
    expect(err.name).toBe("SheltrError");
    expect(err).toBeInstanceOf(Error);
  });

  it("uses_default_code_when_not_provided", () => {
    const err = new SheltrError("test");

    expect(err.code).toBe("SHELTR_ERROR");
  });
});

describe("withErrorHandling", () => {
  it("calls_wrapped_function_with_arguments", async () => {
    const fn = vi.fn();
    const wrapped = withErrorHandling(fn);

    await wrapped("arg1", "arg2");

    expect(fn).toHaveBeenCalledWith("arg1", "arg2");
  });

  it("exits_on_SheltrError", async () => {
    const fn = vi.fn().mockRejectedValue(new SheltrError("fail", "TEST"));
    const wrapped = withErrorHandling(fn);

    await wrapped();

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("exits_on_unexpected_error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("unexpected"));
    const wrapped = withErrorHandling(fn);

    await wrapped();

    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it("does_not_exit_on_success", async () => {
    const fn = vi.fn();
    const wrapped = withErrorHandling(fn);

    await wrapped();

    expect(mockExit).not.toHaveBeenCalled();
  });
});
