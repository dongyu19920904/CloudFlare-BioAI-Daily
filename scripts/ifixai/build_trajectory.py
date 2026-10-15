"""Convert actual local Node probe results, not production logs, to iFixAi JSONL."""
import json
import sys
from pathlib import Path

from ifixai.trajectory.integrity import canonical_digest
from ifixai.trajectory.models import (
    ActionPayload, ActorPolicy, AuditPolicy, BudgetRule, Citation, EndPayload,
    OutputPayload, PermissionRule, SourcePayload, StartPayload, TraceEvent,
)

observed_path, destination = map(Path, sys.argv[1:3])
observed = json.loads(observed_path.read_text(encoding="utf-8"))
if observed.get("production_trajectory") is not False or observed.get("model_calls") != 0:
    raise ValueError("Only explicitly offline probe observations are supported")
destination.mkdir(parents=True, exist_ok=False)
tenant = "bioai-offline-source-gate"
trace_id = canonical_digest(observed)[:32]
events = []

def emit(payload):
    sequence = len(events) + 1
    event = TraceEvent(
        event_id=f"event-{sequence}", trace_id=trace_id, tenant_id=tenant,
        sequence=sequence, time_ns=sequence,
        parents=(events[-1].event_id,) if events else (), payload=payload,
    )
    events.append(event)
    return event

emit(StartPayload(label=observed["scope"]))
actors = {"source-gate": ActorPolicy(roles=("validator",))}
budgets = []
for row in observed["observations"]:
    actor = f"draft-generator-{row['id']}"
    actors[actor] = ActorPolicy(roles=("offline-generator",))
    budgets.append(BudgetRule(scope="actor", actor_id=actor, limit_units=2))
    source = emit(SourcePayload(actor_id="source-gate", resource=f"fixtures:{row['id']}", content_digest=row["fixture_sha256"]))
    for attempt in range(row["generation_calls"]):
        emit(ActionPayload(actor_id=actor, action="generate_fixed_draft", resource=f"fixtures:{row['id']}", arguments_digest=canonical_digest({"attempt": attempt + 1}), cost_units=1))
    kind = "publishable" if row["expected_publishable"] else "blocked"
    action = "accept" if row["observed_publishable"] else "reject"
    emit(ActionPayload(actor_id="source-gate", action=action, resource=f"draft:{kind}:{row['id']}", arguments_digest=canonical_digest(row)))
    emit(OutputPayload(actor_id="source-gate", citations=(Citation(source_event_id=source.event_id, content_digest=source.payload.content_digest),), label=f"Local decision for {row['id']}; expected={row['expected_publishable']}; observed={row['observed_publishable']}"))
emit(EndPayload(complete=True, declared_events=len(events) + 1))
policy = AuditPolicy(
    name="BioAI source-gate local contracts; not a deployed-agent score", tenant_id=tenant,
    trusted_collectors=("bioai-local-node-probes",), actors=actors,
    permissions=(
        PermissionRule(role="offline-generator", action="generate_fixed_draft", resource_scope="fixtures:*"),
        PermissionRule(role="validator", action="accept", resource_scope="draft:publishable:*"),
        PermissionRule(role="validator", action="reject", resource_scope="draft:blocked:*"),
    ), budgets=tuple(budgets), require_citations=True,
)
header = {"schema_version": "1", "trace_id": trace_id, "tenant_id": tenant, "collector_id": "bioai-local-node-probes", "capture_complete": True, "source_format": "jsonl"}
(destination / "policy.json").write_text(policy.model_dump_json(indent=2), encoding="utf-8")
(destination / "trace.jsonl").write_text("\n".join([json.dumps(header), *(event.model_dump_json() for event in events)]) + "\n", encoding="utf-8")
print(f"Converted {len(observed['observations'])} actual local probes; production/model coverage excluded")
