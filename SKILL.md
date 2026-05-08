---
name: codex-task-queue
description: Prepare and run project work as a Codex task queue. Use when a user wants Codex to inspect a repository, create or validate executable product documentation, generate a small-task queue, run READY tasks in fresh Codex sessions, keep native session history, and commit each successful task with Git.
---

# Codex Task Queue

Use this skill to turn a project into a repeatable Codex work queue. The skill is intentionally conservative: inspect first, generate drafts only when the repository has enough material, and run only explicit READY tasks.

## Workflow

1. Run `doctor` from the target project to inspect Codex CLI, Git, product docs, task queue, and working tree state.
2. If `docs/PRODUCT.md` or `docs/TASK_QUEUE.md` is missing, run `init`.
   - If repository material is enough, `init` writes draft docs and stops. Ask the user to review and confirm before running tasks.
   - If material is not enough, stop and ask for the missing product details listed by the script.
3. If the project is not a Git repository, explain that task commits need Git. Only initialize Git after the user confirms; use `init --yes` when confirmation is already explicit.
4. Before running, ask how many tasks to run: one task, a specific number, or until blocked.
5. Run tasks with `run --max N` or `run --until-blocked`. The runner always executes the first `READY` task only, then rereads the queue.

## Commands

Run from the target project root:

```bash
node /path/to/codex-task-queue/scripts/codex-task-queue.mjs doctor
node /path/to/codex-task-queue/scripts/codex-task-queue.mjs init
node /path/to/codex-task-queue/scripts/codex-task-queue.mjs next
node /path/to/codex-task-queue/scripts/codex-task-queue.mjs run --max 1
node /path/to/codex-task-queue/scripts/codex-task-queue.mjs history
```

Useful options:

- `--cwd <dir>`: operate on a project other than the current directory.
- `--yes`: confirm Git initialization and baseline commit when no Git repository exists.
- `--runner auto|app-server|exec`: default `auto`; prefer visible `codex app-server`, fall back to `codex exec --json`.
- `--no-commit`: run without automatic task commits.
- `--allow-dirty-start`: include an existing dirty tree in the task commit.
- `--no-native-session-required`: diagnosis only; do not use for normal queue runs.

## Required Project Files

Default files:

- `docs/PRODUCT.md`: executable product document.
- `docs/TASK_QUEUE.md`: ordered queue with `READY`, `BLOCKED`, and `DONE` tasks.
- `docs/SESSION_RUNBOOK.md`: rules each automated Codex task must follow.
- `.codex-queue/`: last assistant messages from automated runs.
- `docs/QUEUE_RUN_LOG.md`: append-only run log.
- `docs/QUEUE_NATIVE_SESSIONS.md`: native Codex session ids and resume commands.

Read `references/queue-format.md` before manually editing queue files or adapting the format.

## Safety Rules

- Do not run implementation tasks from a draft product document. If `PRODUCT.md` or `TASK_QUEUE.md` says `DRAFT`, ask the user to confirm and update the docs first.
- Do not skip ahead in the queue. Execute only the first `READY` task.
- Do not run with a dirty Git tree unless the user explicitly accepts mixing those changes into the next task commit.
- Treat `codex app-server` as the preferred visible-thread path, but keep `exec` fallback available because app-server is experimental.
- If a task cannot proceed without a product or implementation decision, it should write a blocker in its handoff and leave the next task blocked.
