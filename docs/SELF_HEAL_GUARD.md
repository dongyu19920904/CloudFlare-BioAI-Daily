# Daily Self-Heal Guard

This repo includes `.github/workflows/daily-self-heal.yml`.

## What It Does

1. Checks whether `daily/YYYY-MM-DD.md` exists in `dongyu19920904/BioAI-Daily-Web`.
2. If missing, triggers Worker endpoint `/testTriggerScheduled?date=...&sync=1`.
3. Polls GitHub raw file URL for recovery.
4. If still missing, creates a GitHub Issue alert and fails workflow.

## Schedule

- `35 18 * * *` (UTC)
- `20 19 * * *` (UTC)

Date is computed with `Asia/Shanghai`.

## Required Configuration

- Optional secret: `TEST_TRIGGER_SECRET`
  - Must match Worker env `TEST_TRIGGER_SECRET`.
  - If unset, workflow falls back to `test-secret-key-change-me`.
- Optional variable: `WORKER_BASE_URL`
  - Example: `https://cloudflare-bioai-daily.sabrinamisan090.workers.dev`
  - If unset, workflow uses the default URL above.

## Manual Run

Run workflow manually with optional input:

- `target_date`: `YYYY-MM-DD`

If omitted, it uses current date in `Asia/Shanghai`.
