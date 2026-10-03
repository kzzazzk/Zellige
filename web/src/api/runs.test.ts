import { describe, expect, it } from "vitest";
import { createClient } from "./client";
import { createProfile, profileDefinition } from "./runs";
import { apiFixture } from "../test/apiFixture";

describe("runtime profile definitions", () => {
  it("maps Codex local and preserves existing kinds", () => {
    expect(profileDefinition("codex")).toEqual({ mode: "code", harness: "codex", workspace: ".", sandbox: "workspace-write" });
    for (const kind of ["general", "code", "research", "personal"]) {
      expect(profileDefinition(kind)).toEqual({ mode: kind });
    }
  });
  it("accepts a definition directly without rewriting it", async () => {
    const api = apiFixture();
    const definition = { harness: "codex", workspace: "child", sandbox: "read-only" };
    await createProfile(createClient(() => "secret"), "Custom", definition);
    expect(api.profiles[0].version.definition).toEqual(definition);
  });
});
