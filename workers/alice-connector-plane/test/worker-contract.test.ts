import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

test("keeps provider credentials in one private Worker behind state and Task 5 service bindings", async () => {
  const root = new URL("..", import.meta.url);
  const [entrypoint, config] = await Promise.all([
    readFile(new URL("src/index.ts", root), "utf8"),
    readFile(new URL("wrangler.jsonc", root), "utf8"),
  ]);
  expect(entrypoint).toContain("DISCORD_API_TOKEN");
  expect(entrypoint).toContain("DISCORD_APPLICATION_ID");
  expect(entrypoint).toContain("TELEGRAM_BOT_TOKEN");
  expect(entrypoint).toContain("ALICE_STATE_PLANE");
  expect(entrypoint).toContain("ALICE_CONTROL");
  expect(config).toMatch(/"workers_dev"\s*:\s*false/);
  expect(config).toMatch(/"routes"\s*:\s*\[\s*\]/);
  expect(config).toContain('"ALICE_STATE_PLANE"');
  expect(config).toContain('"ALICE_CONTROL"');
  expect(config).toContain('"new_sqlite_classes"');
  expect(config).not.toContain("alice.rndrntwrk.com");
});
