# Queue Format Reference

Use these project-local files by default:

- `docs/PRODUCT.md`
- `docs/TASK_QUEUE.md`
- `docs/SESSION_RUNBOOK.md`
- `docs/handoffs/<task-id>.md`

`docs/PRODUCT.md` should be executable: it must describe the product goal, users or audience, in-scope behavior, out-of-scope behavior, acceptance criteria, and any constraints that affect implementation.

`docs/TASK_QUEUE.md` should use one section per task:

```markdown
## A1 Short Task Title

Status: READY
Prerequisites: none
Allowed paths: `docs/ARCHITECTURE.md`, `docs/handoffs/A1.md`, `docs/TASK_QUEUE.md`
Deliverable: `docs/ARCHITECTURE.md`

Goal:
Define the smallest useful architecture contract.

Must include:

- Clear component responsibilities.
- Acceptance checks.

Do not:

- Implement runtime code.
- Execute later tasks.
```

Status values:

- `READY`: the first runnable task.
- `BLOCKED`: waiting for prerequisites, user input, or prior tasks.
- `DONE`: completed with a handoff.

Queue rules:

- Exactly one task should normally be `READY`.
- The runner executes only the first `READY` task.
- Each task should fit in one Codex session and one Git commit.
- Each completed task writes `docs/handoffs/<task-id>.md`, marks itself `DONE`, and unlocks the next task by setting it to `READY`.
- Draft queues must include `Queue status: DRAFT` and should not contain executable `READY` implementation tasks.
