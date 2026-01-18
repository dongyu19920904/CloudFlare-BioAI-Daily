import assert from "node:assert/strict";
import { resolveBlogDate } from "../src/utils/blogDate.js";

assert.equal(resolveBlogDate("2026-01-18", "2026-01-19"), "2026-01-18");
assert.equal(resolveBlogDate(null, "2026-01-19"), "2026-01-19");
assert.equal(resolveBlogDate(undefined, "2026-01-19"), "2026-01-19");

console.log("blogDate tests passed");
