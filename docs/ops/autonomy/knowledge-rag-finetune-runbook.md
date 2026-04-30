# Knowledge RAG + Fine-Tune Prep Runbook

## Purpose

Run a deterministic pipeline that:

1. syncs local `knowledge/` docs into Alice runtime knowledge (RAG),
2. builds a supervised knowledge SFT dataset,
3. validates dataset quality gates before training/promotion.

## Prerequisites

- Milaidy API running and reachable (default `http://127.0.0.1:3000`)
- `MILAIDY_API_TOKEN` exported when API auth is enabled
- run from repo root:
  - `/Volumes/OWC Envoy Pro FX/desktop_dump/new/Work/555/milaidy`

## Standard command

```bash
npm run autonomy:knowledge:pipeline -- \
  --knowledge-root knowledge \
  --out-dir docs/ops/autonomy/reports \
  --label alice-knowledge-$(date +%Y%m%d-%H%M%S) \
  --seed alice-knowledge-sft-v1 \
  --base http://127.0.0.1:3000 \
  --prune
```

Notes:

- `--prune` removes remote docs under managed roots that are no longer present locally.
- add `--skip-sync` to rebuild/validate dataset only.

## Individual steps

```bash
# 1) Idempotent corpus sync (RAG)
npm run knowledge:sync -- knowledge --base http://127.0.0.1:3000 --prune

# 2) Build knowledge SFT dataset
npm run autonomy:knowledge:sft:build -- \
  knowledge \
  --out-dir docs/ops/autonomy/reports \
  --label alice-knowledge-manual \
  --seed alice-knowledge-sft-v1

# 3) Validate quality gates
npm run autonomy:knowledge:sft:validate -- \
  --manifest docs/ops/autonomy/reports/alice-knowledge-manual.manifest.json \
  --report-dir docs/ops/autonomy/reports
```

## Outputs

- `<label>.manifest.json` — reproducibility manifest
- `<label>.train.jsonl` / `.val.jsonl` / `.test.jsonl` — SFT splits
- `<label>.gate-report.md` + `.gate-report.json` — pass/fail policy report

## Failure policy

- Treat any gate failure as a release blocker.
- Do not promote or run fine-tuning on failed artifacts.
- Fix corpus quality issues, rerun pipeline with a new label.
