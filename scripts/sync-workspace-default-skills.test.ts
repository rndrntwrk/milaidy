import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveWorkspaceDefaultSkillsSourceDir,
  syncWorkspaceDefaultSkills,
} from "./sync-workspace-default-skills.mjs";

const tempDirs: string[] = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-skills-"));
  tempDirs.push(dir);
  return dir;
}

function writeSkill(
  repoRoot: string,
  skillId: string,
  body = "# test skill\n",
) {
  const skillDir = path.join(
    repoRoot,
    "eliza",
    "packages",
    "skills",
    "skills",
    skillId,
  );
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${skillId}\ndescription: test\n---\n\n${body}`,
    "utf8",
  );
  fs.writeFileSync(path.join(skillDir, "notes.md"), "notes", "utf8");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("sync-workspace-default-skills", () => {
  it("prefers the repo-local bundled skills tree", () => {
    const repoRoot = makeTempDir();
    writeSkill(repoRoot, "eliza-cloud");

    const sourceDir = resolveWorkspaceDefaultSkillsSourceDir(repoRoot);

    expect(sourceDir).toBe(
      path.join(repoRoot, "eliza", "packages", "skills", "skills"),
    );
  });

  it("copies bundled skills into the hidden workspace defaults dir", () => {
    const repoRoot = makeTempDir();
    writeSkill(repoRoot, "eliza-cloud");
    writeSkill(repoRoot, "elizaos");

    const result = syncWorkspaceDefaultSkills({ repoRoot });

    expect(result.syncedSkillIds).toEqual(["eliza-cloud", "elizaos"]);
    expect(
      fs.readFileSync(
        path.join(repoRoot, "skills", ".defaults", "eliza-cloud", "SKILL.md"),
        "utf8",
      ),
    ).toContain("name: eliza-cloud");
    expect(
      fs.existsSync(
        path.join(repoRoot, "skills", ".defaults", "elizaos", "notes.md"),
      ),
    ).toBe(true);
  });
});
