# Phase 0 Alert Thresholds and Paging Policy (2026-02-17)

Checklist target: `P0-017`

## Implementation

Alert thresholds and escalation policy are defined and codified in:

- `docs/ops/autonomy/alert-thresholds.md`
- `deploy/prometheus/alerts.yml`

Coverage includes kernel liveness, safe-mode entry, pipeline failure rates,
invariant failures, role failure rates, drift/ICS quality degradation, and
event-store/quarantine pressure.

## Validation

Executed:

```bash
node -e "const fs=require('fs');const t=fs.readFileSync('deploy/prometheus/alerts.yml','utf8');const required=['AutonomyKernelDown','SafeModeActive','PipelineFailureRateHigh','InvariantFailuresPresent','RoleFailureRateHigh','BaselinePersonaDriftHigh','BaselineInstructionCompletionLow'];for(const r of required){if(!t.includes('alert: '+r)) throw new Error('missing '+r);}if(!/severity:\\s+critical/.test(t)) throw new Error('missing critical severity rules');if(!/severity:\\s+warning/.test(t)) throw new Error('missing warning severity rules');console.log('alert-rules-validation-ok');"
```

Result:

- `alert-rules-validation-ok`
