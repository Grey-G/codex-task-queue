# Launch Copy

Use this file as the source of truth for public launch messaging. The core positioning should stay consistent across channels:

```text
Codex Task Queue turns product docs, development docs, and bug lists into executable workflow docs, then runs independent READY tasks with parallel Codex subagents in separate Git worktrees.
```

## Positioning Rules

- Lead with "docs to workflows, workflows to subagents."
- Say "workflow layer for Codex", not "task queue script".
- Emphasize generated workflow docs, reviewable tasks, parallel subagents, Git worktrees, handoffs, and resumability.
- Avoid overclaiming full autonomy. The project is intentionally review-first and confirmation-first.
- Keep the promise practical: make AI coding work structured, reviewable, resumable, auditable, and parallel.

## GitHub Description

```text
Turn product and development docs into executable Codex workflows, then run them with parallel subagents.
```

## One-Liner

```text
Codex Task Queue is a workflow layer for Codex: it turns product/dev docs into executable workflow docs, then runs independent tasks with parallel subagents.
```

## Short Pitch

```text
Codex Task Queue turns product docs, development docs, and bug lists into executable workflow docs, then runs independent READY tasks with parallel Codex subagents in separate Git worktrees.
```

## Longer Pitch

```text
Codex is useful for one-off coding tasks, but larger repo work needs a workflow.

Codex Task Queue turns product docs, development docs, and bug lists into executable workflow docs: PRODUCT, TASK_QUEUE, PATCH_QUEUE, and SESSION_RUNBOOK. After review, it runs independent READY tasks with parallel Codex subagents in separate Git worktrees, preserving handoffs, commits, queue state, and native Codex session history.

The goal is to make AI coding work reviewable, resumable, auditable, and parallel.
```

## Hacker News

Title options:

```text
Show HN: Codex Task Queue - turn repo docs into parallel Codex workflows
```

```text
Show HN: A workflow layer for Codex with docs, queues, handoffs, and subagents
```

```text
Show HN: Turn product docs into executable Codex workflows
```

Post body:

```text
Hi HN,

I built Codex Task Queue, a workflow layer for Codex.

The problem I kept running into: Codex is good at one-off changes, but larger repository work becomes hard to review, resume, and parallelize if it lives in a single chat.

This tool turns product docs, development docs, and bug lists into executable workflow docs:

- docs/PRODUCT.md
- docs/TASK_QUEUE.md
- docs/PATCH_QUEUE.md
- docs/SESSION_RUNBOOK.md

After review, it runs independent READY tasks with parallel Codex subagents in separate Git worktrees. Each task keeps a handoff, commit boundary, queue state, and native Codex session history.

The goal is not unchecked autonomy. The goal is structured AI coding work: draft first, review first, then run scoped tasks that can be audited later.

Repo: https://github.com/Grey-G/codex-task-queue
```

## X / Twitter

Short version:

```text
I built Codex Task Queue: a workflow layer for Codex.

It turns product/dev docs and bug lists into executable workflow docs, then runs independent READY tasks with parallel Codex subagents in separate Git worktrees.

Docs to workflows. Workflows to subagents.

https://github.com/Grey-G/codex-task-queue
```

Thread:

```text
1/ I built Codex Task Queue, a workflow layer for Codex.

Codex is great for one-off changes, but larger repo work needs structure: docs, task boundaries, handoffs, commits, and resumability.
```

```text
2/ Codex Task Queue turns product docs, development docs, and bug lists into executable workflow docs:

- PRODUCT.md
- TASK_QUEUE.md
- PATCH_QUEUE.md
- SESSION_RUNBOOK.md
```

```text
3/ After review, it runs independent READY tasks with parallel Codex subagents in separate Git worktrees.

Each task gets a scoped prompt, a handoff, and a commit boundary.
```

```text
4/ The goal is not unchecked autonomy.

The goal is AI coding work that is reviewable, resumable, auditable, and parallel.

Repo:
https://github.com/Grey-G/codex-task-queue
```

## LinkedIn

```text
I built Codex Task Queue, a workflow layer for Codex.

Codex is useful for one-off coding tasks, but larger repository work often needs more structure than a single chat can provide. Product docs, development docs, and bug lists need to become reviewable implementation steps. Independent work should be able to run in parallel without mixing changes. Every automated task should leave a handoff, validation notes, and a commit boundary.

Codex Task Queue handles that workflow:

- turns product/dev docs and bug lists into executable workflow docs;
- generates PRODUCT, TASK_QUEUE, PATCH_QUEUE, and SESSION_RUNBOOK documents;
- runs independent READY tasks with parallel Codex subagents;
- isolates work in separate Git worktrees;
- preserves handoffs, queue state, commits, and native Codex session history.

The goal is to make AI coding work reviewable, resumable, auditable, and parallel.

Repo: https://github.com/Grey-G/codex-task-queue
```

## Reddit

Suggested communities:

```text
r/OpenAI
r/ChatGPTCoding
r/programming
r/softwaredevelopment
r/LocalLLaMA, only if framed around workflow ideas rather than OpenAI-specific tooling
```

Title options:

```text
I built a workflow layer for Codex that turns docs into parallel subagent tasks
```

```text
Codex Task Queue: product docs -> workflow docs -> parallel Codex subagents
```

Post body:

```text
I built Codex Task Queue, a small workflow layer for Codex.

It takes product docs, development docs, bug lists, and repo context, then generates workflow docs like PRODUCT.md, TASK_QUEUE.md, PATCH_QUEUE.md, and SESSION_RUNBOOK.md.

After review, independent READY tasks can run with parallel Codex subagents in separate Git worktrees. Each task preserves a handoff, commit boundary, queue state, and native Codex session history.

The main idea is to avoid treating larger AI coding work as one long chat. The workflow is draft-first and review-first, then execution happens through scoped tasks.

Repo: https://github.com/Grey-G/codex-task-queue

I would be interested in feedback from people using Codex or similar coding agents on larger repo tasks.
```

## Chinese Post

```text
我做了一个 Codex 工作流工具：Codex Task Queue。

它的核心不是“跑任务”，而是把产品文档、开发文档、bug 列表和仓库上下文，自动整理成可执行的工作流文档，比如 PRODUCT.md、TASK_QUEUE.md、PATCH_QUEUE.md、SESSION_RUNBOOK.md。

确认后，它会把互相独立的 READY 任务分配给多个 Codex 子 agent，在不同 Git worktree 里并行执行。每个任务都会留下 handoff、commit 边界、队列状态和 Codex session 历史。

我想解决的问题是：不要把复杂 AI 编程工作塞进一个长聊天里，而是把它变成可审查、可恢复、可追踪、可并行的工作流。

Repo: https://github.com/Grey-G/codex-task-queue
```

## Product Hunt / Directory Copy

Tagline:

```text
Turn repo docs into parallel Codex workflows.
```

Description:

```text
Codex Task Queue turns product docs, development docs, and bug lists into executable workflow docs, then runs independent READY tasks with parallel Codex subagents in separate Git worktrees. Built for reviewable, resumable, auditable AI coding work.
```

## GitHub Release Intro

```text
Codex Task Queue is a workflow layer for Codex. It turns product and development docs into executable workflow docs, then runs independent READY tasks with parallel Codex subagents in separate Git worktrees.

This release focuses on making the tool easier to try: install directly from GitHub, run `codex-task-queue doctor`, and use the shorter CLI everywhere.
```

## Boilerplate Links

```text
Repo: https://github.com/Grey-G/codex-task-queue
Install: npm install -g github:Grey-G/codex-task-queue
Run once: npx --yes github:Grey-G/codex-task-queue doctor
```
