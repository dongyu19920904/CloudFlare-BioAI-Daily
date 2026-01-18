import assert from "node:assert/strict";
import { buildAstroPaperFrontMatter, escapeYamlString } from "../src/utils/frontmatter.js";

const title = "Hello \"World\"";
const description = "Test \"quote\" and 'single'";

assert.equal(escapeYamlString(title), "'Hello \"World\"'");
assert.equal(escapeYamlString(description), "'Test \"quote\" and ''single''' ".trim());

const frontmatter = buildAstroPaperFrontMatter(title, description, "2026-01-18", ["ai-daily"]);

assert.ok(frontmatter.includes("title: 'Hello \"World\"'"), "title should use single-quoted YAML");
assert.ok(frontmatter.includes("description: 'Test \"quote\" and ''single'''"), "description should escape single quotes");
assert.ok(!frontmatter.includes('description: "'), "description should not use double-quoted YAML");

console.log("frontmatter tests passed");
