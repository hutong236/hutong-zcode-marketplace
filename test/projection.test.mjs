import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWorkItem } from "../cmdb-dev/scripts/lib/state-machine.mjs";
import { writeProjection } from "../cmdb-dev/scripts/lib/projection.mjs";

test("projection refresh updates frontmatter without replacing the note body", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmdb-projection-"));
  const item = createWorkItem({
    id: "REQ-55",
    issue_number: 55,
    title: "Projection",
    risk_level: "low",
    delivery_required: false,
    delivery_reason: "Documentation only",
    skip_allowed: true,
  });
  const file = writeProjection(root, item, { plannerSummary: "Original summary", acceptanceCriteria: ["Visible"] });
  fs.appendFileSync(file, "\nHuman-maintained note.\n");
  writeProjection(root, { ...item, status: "ready", revision: 2 });
  const content = fs.readFileSync(file, "utf8");
  assert.match(content, /status: "ready"/);
  assert.match(content, /Human-maintained note\./);
  assert.match(content, /Original summary/);
});
