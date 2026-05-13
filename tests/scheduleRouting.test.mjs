import test from "node:test";
import assert from "node:assert/strict";

import { resolveScheduledModeFromCron } from "../src/scheduleRouting.js";

const env = {
  DAILY_CRON_SCHEDULE: "0 11 * * *",
  OPPORTUNITY_CRON_SCHEDULE: "30 11 * * *",
  PROJECT_OPPORTUNITY_CRON_SCHEDULE: "30 11 * * *",
  PROJECT_OPPORTUNITY_SHARED_WITH_OPPORTUNITY_CRON: "true",
};

test("resolveScheduledModeFromCron routes the daily cron to daily", () => {
  assert.equal(resolveScheduledModeFromCron("0 11 * * *", env), "daily");
});

test("resolveScheduledModeFromCron shares the opportunity cron with project opportunity", () => {
  assert.equal(resolveScheduledModeFromCron("30 11 * * *", env), "opportunity-batch");
});

test("resolveScheduledModeFromCron can route a separate project-opportunity cron", () => {
  assert.equal(
    resolveScheduledModeFromCron("45 11 * * *", {
      ...env,
      PROJECT_OPPORTUNITY_CRON_SCHEDULE: "45 11 * * *",
      PROJECT_OPPORTUNITY_SHARED_WITH_OPPORTUNITY_CRON: "false",
    }),
    "project-opportunity"
  );
});

test("resolveScheduledModeFromCron keeps the existing blog cron route", () => {
  assert.equal(resolveScheduledModeFromCron("0 10 * * *", env), "blog");
});
