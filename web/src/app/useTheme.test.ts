import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useTheme } from "./useTheme";

describe("useTheme", () => {
  it("loads light mode and persists toggles on the document", () => {
    localStorage.setItem("zellige-theme", "light");
    const { result } = renderHook(useTheme);
    expect(result.current.dark).toBe(false);
    expect(document.documentElement).not.toHaveClass("dark");
    act(() => result.current.toggleTheme());
    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("zellige-theme")).toBe("dark");
  });

  it("defaults to dark and still toggles when storage throws", () => {
    const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Unavailable");
    });
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Unavailable");
    });
    try {
      const { result } = renderHook(useTheme);
      expect(result.current.dark).toBe(true);
      act(() => result.current.toggleTheme());
      expect(document.documentElement).not.toHaveClass("dark");
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });
});
