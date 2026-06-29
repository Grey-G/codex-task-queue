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
   - Remove draft status only after the user confirms the patch list and make independent first patches READY.
4. If the project is not a Git repository, explain that task commits need Git. Only initialize Git after the user confirms; use `init --yes` when confirmation is already explicit.
5. If the user asks to start or run the queue, do not implement the queue task directly in the current assistant turn. Use the runner as the coordinator; it starts worker Codex sessions and the current assistant monitors the queue, handoffs, commits, and failures.
6. If the user does not specify a run count, default to running until the queue is blocked or complete.
7. Queue execution is parallel by default: each run creates a main task branch, schedules READY tasks in Git worktrees, and squashes each successful worker result into one coordinator commit when that task completes. `--max-parallel 1` still uses worker worktrees; it only limits concurrency to one worker.
8. Use `run --max 1` only when the user explicitly wants one task, `run --max N` for a bounded batch, or plain `run` / `run --until-blocked` to keep running.

## Commands

Run from the target project root:

```bash
node /path/to/codex-task-queue/scripts/codex-task-queue.mjs doctor
node /path/to/codex-task-queue/scripts/codex-task-queue.mjs init
node /path/to/codex-task-queue/scripts/codex-task-queue.mjs init --mode maintenance
node /path/to/codex-task-queue/scripts/codex-task-queue.mjs doctor --mode maintenance
node /path/to/codex-task-queue/scripts/codex-task-queue.mjs next
node /path/to/codex-task-queue/scripts/codex-task-queue.mjs run
node /path/to/codex-task-queue/scripts/codex-task-queue.mjs run --max 1
node /path/to/codex-task-queue/scripts/codex-task-queue.mjs history
```

Useful options:

- `--cwd <dir>`: operate on a project other than the current directory.
- `--mode project|maintenance`: default `project`; use `maintenance` for `docs/PATCH_QUEUE.md`.
- `--maintenance`: alias for `--mode maintenance`.
- `--yes`: confirm Git initialization and baseline commit when no Git repository exists.
- `--runner auto|app-server|exec`: default `auto`; prefer visible `codex app-server`. It does not use invisible `exec` fallback unless `--allow-exec-fallback` is also set.
- `--allow-exec-fallback`: allow `auto` to fall back to `codex exec --json` only if `app-server` fails before task execution starts.
- `--max <n>`: run a bounded number of tasks; use `--max 1` when you explicitly want only one task.
- `--max-parallel <n>`: default `5`; cap concurrent worker worktrees. `--max-parallel 1` still uses a worker worktree.
- `--no-parallel`: use the legacy serial execution loop on the run's main task branch.
- `--until-blocked`: run until no READY task remains or a task fails. This is also the default when no run count is specified.
- `--no-commit`: run without automatic task commits.
- `--allow-dirty-start`: include an existing dirty tree in the task commit.
- `--no-native-session-required`: diagnosis only; do not use for normal queue runs.
- `--model <model>`: default `gpt-5.5`; can also be set with `CODEX_TASK_QUEUE_MODEL`.
- `--reasoning-effort <effort>`: default `xhigh` for extra-high reasoning; can also be set with `CODEX_TASK_QUEUE_REASONING_EFFORT`.
- `--service-tier <tier>` / `--speed <tier>`: default `standard`; can also be set with `CODEX_TASK_QUEUE_SERVICE_TIER`.
- `--codex <path>`: Codex CLI path; defaults to the Desktop app CLI on macOS when present, otherwise `codex` from `PATH`.

## Required Project Files

Project mode files:

- `docs/PRODUCT.md`: executable product document.
- `docs/TASK_QUEUE.md`: ordered queue with `READY`, `RUNNING`, `BLOCKED`, and `DONE` tasks.
- `docs/SESSION_RUNBOOK.md`: rules each automated Codex task must follow.
- `.codex-queue/`: last assistant messages from automated runs.
- `docs/QUEUE_RUN_LOG.md`: append-only run log.
- `docs/QUEUE_NATIVE_SESSIONS.md`: native Codex session ids and resume commands.

Maintenance mode files:

- `docs/PATCH_QUEUE.md`: ordered patch queue with `READY`, `RUNNING`, `BLOCKED`, and `DONE` tasks, issue evidence, expected behavior, validation, severity, and narrow allowed paths.
- `docs/SESSION_RUNBOOK.md`: shared execution rules.
- `docs/handoffs/<task-id>.md`: one handoff per patch task.
- `.codex-queue/`, `docs/QUEUE_RUN_LOG.md`, and `docs/QUEUE_NATIVE_SESSIONS.md`: same history files as project mode.

Read `references/queue-format.md` before manually editing queue files or adapting the format.

## Safety Rules

- Do not run implementation tasks from a draft product document. If `PRODUCT.md` or `TASK_QUEUE.md` says `DRAFT`, ask the user to confirm and update the docs first.
- Do not run maintenance tasks from a draft patch queue. If `PATCH_QUEUE.md` says `DRAFT`, ask the user to confirm the issue list and update the queue first.
- In default parallel mode, execute only tasks whose prerequisites are satisfied; independent READY tasks may run concurrently in separate worktrees.
- In `--no-parallel` mode, still create the run's main task branch, but do not skip ahead in the queue. Execute only the first `READY` task in the current checkout.
- Do not run with a dirty Git tree unless the user explicitly accepts mixing those changes into the next task commit.
- Treat `Allowed paths` as a hard scope fence, especially in maintenance mode where unrelated code is often nearby.
- Stop any long-running process started by a task before finishing. If a process must remain running, record its command, PID or port, and reason in the handoff.
- Treat `codex app-server` as the preferred visible-thread path. Do not silently fall back to `exec`; fallback must be explicit with `--allow-exec-fallback`, and direct `--runner exec` should be treated as a deliberate non-visible run.
- If a task cannot proceed without a product decision, reproduction evidence, or implementation decision, it should write a blocker in its handoff and leave the next task blocked.
