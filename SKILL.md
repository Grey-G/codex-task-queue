---
name: codex-task-queue
description: Prepare and run Codex work queues for new project slices or existing-project maintenance. Use when a user wants Codex to inspect a repository, create or validate executable product docs, generate a READY task queue, triage many bugs or patches into a patch queue, run tasks in fresh Codex sessions, keep native session history, and commit each successful task with Git.
---

# Codex Task Queue

Use this skill to turn repository work into a repeatable Codex queue. The skill is intentionally conservative: inspect first, generate drafts before execution, and run only explicit READY tasks.

Choose the mode first:

- **Project mode**: new project, larger feature, milestone, or product-slice work. Uses `docs/PRODUCT.md` plus `docs/TASK_QUEUE.md`.
- **Maintenance mode**: batches of bugs, warnings, UI tweaks, small refactors, or unrelated patches in an existing repo. Uses `docs/PATCH_QUEUE.md` and does not require `docs/PRODUCT.md`.

## Workflow

1. Run `doctor` from the target project to inspect Codex CLI, Git, queue docs, runbook, and working tree state.
2. For product or feature work, use project mode. If `docs/PRODUCT.md` or `docs/TASK_QUEUE.md` is missing, run `init`.
   - If repository material is enough, `init` writes draft docs and stops. Ask the user to review and confirm before running tasks.
   - If material is not enough, stop and ask for the missing product details listed by the script.
3. For bug or patch batches, use maintenance mode. If `docs/PATCH_QUEUE.md` is missing, run `init --mode maintenance`.
   - Fill the draft with the user's bug list, warnings, repro notes, screenshots, or failing commands.
   - Remove draft status only after the user confirms the patch list and make exactly one first patch READY.
4. If the project is not a Git repository, explain that task commits need Git. Only initialize Git after the user confirms; use `init --yes` when confirmation is already explicit.
5. Before running, ask how many tasks to run: one task, a specific number, or until blocked.
6. Run tasks with `run --max N` or `run --until-blocked`. The runner always executes the first `READY` task only, then rereads the active queue.

## Commands

Run from the target project root:

```bash
node /path/to/codex-task-queue/scripts/codex-task-queue.mjs doctor
node /path/to/codex-task-queue/scripts/codex-task-queue.mjs init
node /path/to/codex-task-queue/scripts/codex-task-queue.mjs init --mode maintenance
node /path/to/codex-task-queue/scripts/codex-task-queue.mjs doctor --mode maintenance
node /path/to/codex-task-queue/scripts/codex-task-queue.mjs next
node /path/to/codex-task-queue/scripts/codex-task-queue.mjs run --max 1
node /path/to/codex-task-queue/scripts/codex-task-queue.mjs history
```

Useful options:

- `--cwd <dir>`: operate on a project other than the current directory.
- `--mode project|maintenance`: default `project`; use `maintenance` for `docs/PATCH_QUEUE.md`.
- `--maintenance`: alias for `--mode maintenance`.
- `--yes`: confirm Git initialization and baseline commit when no Git repository exists.
- `--runner auto|app-server|exec`: default `auto`; prefer visible `codex app-server`, fall back to `codex exec --json`.
- `--no-commit`: run without automatic task commits.
- `--allow-dirty-start`: include an existing dirty tree in the task commit.
- `--no-native-session-required`: diagnosis only; do not use for normal queue runs.

## Required Project Files

Project mode files:

- `docs/PRODUCT.md`: executable product document.
- `docs/TASK_QUEUE.md`: ordered queue with `READY`, `BLOCKED`, and `DONE` tasks.
- `docs/SESSION_RUNBOOK.md`: rules each automated Codex task must follow.
- `.codex-queue/`: last assistant messages from automated runs.
- `docs/QUEUE_RUN_LOG.md`: append-only run log.
- `docs/QUEUE_NATIVE_SESSIONS.md`: native Codex session ids and resume commands.

Maintenance mode files:

- `docs/PATCH_QUEUE.md`: ordered patch queue with issue evidence, expected behavior, validation, severity, and narrow allowed paths.
- `docs/SESSION_RUNBOOK.md`: shared execution rules.
- `docs/handoffs/<task-id>.md`: one handoff per patch task.
- `.codex-queue/`, `docs/QUEUE_RUN_LOG.md`, and `docs/QUEUE_NATIVE_SESSIONS.md`: same history files as project mode.

Read `references/queue-format.md` before manually editing queue files or adapting the format.

## Safety Rules

- Do not run implementation tasks from a draft product document. If `PRODUCT.md` or `TASK_QUEUE.md` says `DRAFT`, ask the user to confirm and update the docs first.
- Do not run maintenance tasks from a draft patch queue. If `PATCH_QUEUE.md` says `DRAFT`, ask the user to confirm the issue list and update the queue first.
- Do not skip ahead in the queue. Execute only the first `READY` task.
- Do not run with a dirty Git tree unless the user explicitly accepts mixing those changes into the next task commit.
- Treat `Allowed paths` as a hard scope fence, especially in maintenance mode where unrelated code is often nearby.
- Treat `codex app-server` as the preferred visible-thread path, but keep `exec` fallback available because app-server is experimental.
- If a task cannot proceed without a product decision, reproduction evidence, or implementation decision, it should write a blocker in its handoff and leave the next task blocked.
