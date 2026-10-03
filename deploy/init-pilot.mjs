// Generate a local, untracked server secret without printing it or replacing it.
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";

const directory = new URL("../.runtime/", import.meta.url);
await mkdir(directory, { recursive: true, mode: 0o700 });
try {
  await writeFile(
    new URL("pilot.env", directory),
    `ZELLIGE_API_TOKEN=${randomBytes(32).toString("base64url")}\n`,
    { flag: "wx", mode: 0o600 },
  );
  console.log("Pilot key created in .runtime/pilot.env (not printed).");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("Existing pilot key preserved.");
}
