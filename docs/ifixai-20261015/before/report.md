# Recorded trajectory assurance

Decision: **BLOCK**

Policy: BioAI source-gate local contracts; not a deployed-agent score. Retained events: 42.

Passive audit of collector-declared facts; not runtime prevention or certification.

## Findings

- PERMISSION\_DENIED at event-13: No direct role grant or valid delegated authority permits this completed action.. Witnesses: event-13
- PERMISSION\_DENIED at event-27: No direct role grant or valid delegated authority permits this completed action.. Witnesses: event-27
- PERMISSION\_DENIED at event-31: No direct role grant or valid delegated authority permits this completed action.. Witnesses: event-31

## Coverage

- graph: EVALUATED
- permission: EVALUATED
- approval: NOT_EVALUATED
- delegation: NOT_EVALUATED
- budget: EVALUATED
- citation: EVALUATED

## Limitations

- Capture completeness, collector identity, actor identity, human approval and costs are caller declarations, not authenticated facts.
- This passive audit inspects already-recorded actions and does not prevent execution or reverse effects.
- Recorded dependency edges establish declared lineage, not physical causality or completeness of unobserved activity.
- Citations verify recorded source identity and content digests, not semantic entailment, factual truth or licensing.
- Integer costs use caller-defined units; this is not billing proof or currency conversion.
- Checksums provide integrity, not authenticity, production certification or deployment authorization.

Bundle SHA-256: `d53e56dc81a53fc1da495b629e3c0caa98acb1cfd246e4649de2656ae410f2e3`
