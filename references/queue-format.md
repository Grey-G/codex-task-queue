# Queue Format Reference

Use project mode for new product slices and maintenance mode for bug or patch batches.

Project mode files:

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

Maintenance mode files:

- `docs/PATCH_QUEUE.md`
- `docs/SESSION_RUNBOOK.md`
- `docs/handoffs/<task-id>.md`

`docs/PATCH_QUEUE.md` should not require a product document. Each patch task carries its own evidence and acceptance checks:

```markdown
## P1 Fix Settings Push Toggle Crash

Status: READY
Type: bugfix
Severity: medium
Prerequisites: none
Allowed paths: `src/settings/**`, `tests/settings/**`, `docs/handoffs/P1.md`, `docs/PATCH_QUEUE.md`
Deliverable: Settings push toggle no longer crashes when permission state is missing

Issue / Evidence:
Opening Settings crashes when the notification permission API returns null.

Expected:
Settings remains usable and shows the notification toggle as off.

Validation:
`npm test -- settings`

Goal:
Fix only the named crash.

Must include:

- Null-safe permission handling.
- Focused validation for the Settings path.

Do not:

- Change login, gallery, advertising, or unrelated settings behavior.
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
- Patch tasks should include `Issue / Evidence`, `Expected`, and `Validation` fields whenever possible.
- For loose bug lists, create a `P0` triage task first, then split the work into independent patch tasks.
- A task must stop any long-running process it started. If it intentionally leaves one running, the handoff must record the command, PID or port, and reason.
