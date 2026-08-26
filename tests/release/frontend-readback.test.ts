import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { hashFrontendTree } from "../../scripts/release/verify-frontend-readback.mjs";
import { verifyPromotionState } from "../../scripts/release/verify-promotion-state.mjs";

const temporaryDirectories: string[] = [];

function temporaryTree() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "frontend-readback-test-"),
  );
  temporaryDirectories.push(root);
  fs.mkdirSync(path.join(root, "assets"));
  fs.writeFileSync(path.join(root, "index.html"), "<main>release</main>\n");
  fs.writeFileSync(path.join(root, "assets", "app.js"), "export default 1;\n");
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("frontend artifact readback hashing", () => {
  it("is deterministic and ignores only the authenticated clone metadata", () => {
    const source = temporaryTree();
    const readback = temporaryTree();
    fs.mkdirSync(path.join(readback, ".git"));
    fs.writeFileSync(
      path.join(readback, ".git", "config"),
      "credential material",
    );
    expect(hashFrontendTree(source)).toEqual(hashFrontendTree(readback));
  });

  it("changes when a deployed byte changes", () => {
    const source = temporaryTree();
    const readback = temporaryTree();
    fs.writeFileSync(
      path.join(readback, "assets", "app.js"),
      "export default 2;\n",
    );
    expect(hashFrontendTree(source).tree_sha256).not.toBe(
      hashFrontendTree(readback).tree_sha256,
    );
  });

  it("rejects provider state unless the complete artifact tree matches", () => {
    const digest = "a".repeat(64);
    const evidence = { stage: "frontend", commit_sha: "b".repeat(40) };
    expect(() =>
      verifyPromotionState({
        evidence,
        stage: "frontend",
        sourceText: JSON.stringify({
          remote_head: "c".repeat(40),
          artifact_tree_sha256: digest,
          readback_tree_sha256: digest,
          file_count: 2,
        }),
      }),
    ).not.toThrow();
    expect(() =>
      verifyPromotionState({
        evidence,
        stage: "frontend",
        sourceText: JSON.stringify({
          remote_head: "c".repeat(40),
          artifact_tree_sha256: digest,
          readback_tree_sha256: "d".repeat(64),
          file_count: 2,
        }),
      }),
    ).toThrow(/differs from the pinned artifact/i);
  });
});
