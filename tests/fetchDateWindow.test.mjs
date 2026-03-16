import assert from "node:assert/strict";
import { getISODate, isDateWithinLastDays, setFetchDate } from "../src/helpers.js";

const samplePublishedAt = "2026-03-12T11:28:26.018Z";
const originalFetchDate = getISODate();

setFetchDate("2026-03-13");
assert.equal(
  isDateWithinLastDays(samplePublishedAt, 3),
  true,
  "reruns should filter relative to the requested report date, not the wall clock",
);

setFetchDate("2026-03-16");
assert.equal(
  isDateWithinLastDays(samplePublishedAt, 3),
  false,
  "a 3-day window should still exclude stale items on sparse weekends",
);
assert.equal(
  isDateWithinLastDays(samplePublishedAt, 5),
  true,
  "a 5-day window should keep enough BioAI items to avoid empty dailies after low-activity weekends",
);

setFetchDate(originalFetchDate);

console.log("fetchDateWindow tests passed");
