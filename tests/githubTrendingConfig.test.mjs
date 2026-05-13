import test from "node:test";
import assert from "node:assert/strict";

import GithubTrendingDataSource from "../src/dataSources/github-trending.js";
import { getISODate, setFetchDate } from "../src/helpers.js";

const originalFetch = globalThis.fetch;
const originalFetchDate = getISODate();

test("github trending obeys env filters, query limit, date placeholders, and partial failures", async () => {
  const fetchedUrls = [];
  globalThis.fetch = async (url) => {
    const urlText = String(url);
    fetchedUrls.push(urlText);

    if (urlText.includes("fail-query")) {
      return {
        ok: false,
        status: 500,
        statusText: "Server Error",
        text: async () => "temporary GitHub failure",
      };
    }

    return {
      ok: true,
      json: async () => ({
        items: [
          {
            full_name: "lab/aging-clock",
            html_url: "https://github.com/lab/aging-clock",
            description: "Small but active aging clock project",
            owner: { login: "lab" },
            language: "Python",
            stargazers_count: 1,
            forks_count: 0,
            updated_at: "2026-03-16T00:00:00Z",
            pushed_at: "2026-03-16T00:00:00Z",
          },
        ],
      }),
    };
  };

  setFetchDate("2026-03-17");

  try {
    const projects = await GithubTrendingDataSource.fetch({
      PROJECTS_API_URL: [
        "https://api.github.com/search/repositories?q=fail-query+pushed:>={date_minus_240}",
        "https://api.github.com/search/repositories?q=aging-clock+pushed:>={date_minus_240}",
        "https://api.github.com/search/repositories?q=should-not-run+pushed:>={date_minus_240}",
      ].join("|"),
      PROJECT_MIN_STARS: "1",
      PROJECT_ACTIVE_DAYS: "240",
      PROJECT_MAX_QUERIES_PER_RUN: "2",
      OPEN_TRANSLATE: "false",
    });

    assert.equal(fetchedUrls.length, 2);
    assert.ok(fetchedUrls.every((url) => !url.includes("{date_minus_240}")));
    assert.ok(fetchedUrls.every((url) => url.includes("2025-07-20")));
    assert.equal(projects.length, 1);
    assert.equal(projects[0].name, "lab/aging-clock");
    assert.equal(projects[0].description_zh, "Small but active aging clock project");
  } finally {
    setFetchDate(originalFetchDate);
    globalThis.fetch = originalFetch;
  }
});
