import test from "node:test";
import assert from "node:assert/strict";
import { buildOpportunityTasks } from "../src/opportunityRouting.js";

test("every unverified lead receives automatic evidence and demand tasks, not a fake delivery", () => {
  const record = { opportunity_id: "opp_one", source_urls: ["https://example.com/news"], primary_source_candidates: [{ doi: "10.1/x" }], source_verified: false, demand_verified: false, risk_flags: [] };
  const tasks = buildOpportunityTasks([record]);
  assert.deepEqual(tasks.map((item) => item.kind), ["verify_claims", "validate_demand"]);
  assert.ok(tasks.every((item) => item.status === "pending_automation"));
});

test("GitHub project routes to repository screening and independent failure does not affect another lead", () => {
  const tasks = buildOpportunityTasks([
    { opportunity_id: "opp_repo", source_urls: ["https://github.com/example/tool"], source_verified: false, demand_verified: false },
    { opportunity_id: "opp_news", source_urls: [], source_verified: false, demand_verified: false },
  ]);
  assert.deepEqual(tasks.map((item) => item.kind), ["inspect_repository", "validate_demand", "discover_primary_source", "validate_demand"]);
  assert.equal(new Set(tasks.map((item) => item.task_id)).size, tasks.length);
});

test("delivery and media tasks appear only after evidence and demand verification", () => {
  const tasks = buildOpportunityTasks([{ opportunity_id: "opp_ready", source_urls: ["https://github.com/example/tool"], repository_verified: true, demand_verified: true, risk_flags: [] }]);
  assert.deepEqual(tasks.map((item) => item.kind), ["inspect_repository", "validate_demand", "deliver_project", "produce_media"]);
  assert.deepEqual(tasks.slice(0, 2).map((item) => item.status), ["completed", "completed"]);
  assert.deepEqual(tasks.at(-1).depends_on, ["opp_ready:deliver_project"]);
  assert.deepEqual(buildOpportunityTasks([]), []);
});

test("inactive or unlicensed repositories are visibly blocked rather than queued for adaptation", () => {
  const tasks = buildOpportunityTasks([
    { opportunity_id: "opp_no_license", source_urls: ["https://github.com/example/a"], state: "blocked_license_unknown", demand_verified: false },
    { opportunity_id: "opp_archived", source_urls: ["https://github.com/example/b"], state: "blocked_repository_inactive", demand_verified: false },
  ]);
  assert.deepEqual(tasks.map((item) => item.status), ["blocked_license_unknown", "pending_automation", "blocked_repository_inactive", "pending_automation"]);
  assert.ok(tasks.every((item) => !["deliver_project", "produce_media"].includes(item.kind)));
});
