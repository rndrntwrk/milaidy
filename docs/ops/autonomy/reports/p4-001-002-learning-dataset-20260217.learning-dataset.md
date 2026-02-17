# Learning Dataset Extraction Report

- Label: `p4-001-002-learning-dataset-20260217`
- Created at: `2026-02-17T23:10:33.952Z`
- Source file: `/Volumes/OWC Envoy Pro FX/milaidy/milaidy/scripts/autonomy/fixtures/learning-dataset.sample.events.json`
- Source events parsed: `10`
- Dataset id: `p4-learning-v1`
- Extracted examples: `3`
- Mean reward: `0.3667`
- Outcomes: success=`1`, partial=`1`, fail=`1`

| Example ID | Request ID | Tool | Outcome | Verification | Policy | Safety | Reward |
|---|---|---|---|---|---|---|---:|
| trace-135358b11513 | req-learning-1 | READ_FILE | success | aligned | compliant | none | 0.9500 |
| trace-a0765286b365 | req-learning-2 | WRITE_FILE | fail | unknown | non_compliant | medium | 0.0000 |
| trace-eb1df0688ce6 | req-learning-3 | TRANSFER | partial | conflict | compliant | high | 0.1500 |

