import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

const script = path.resolve('scripts/codex-task-queue.mjs');

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`);
}

function makeProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-task-queue-test-'));
  write(path.join(root, 'docs', 'PRODUCT.md'), `# Product

Goal: test parallel queue runner behavior in a temporary Git repository.
Users: developers who need predictable automated task execution.
Scope: local queue execution, dependency scheduling, branch creation, worktree cleanup, and coordinator-owned queue state.
Out of scope: production deployment or external services.
Acceptance: independent tasks can run through fake workers, dependent tasks are unlocked after prerequisites, and successful worktrees are removed after merge.
Constraints: this sample uses only local files and fake workers.
`);
  write(path.join(root, 'docs', 'SESSION_RUNBOOK.md'), '# Session Runbook\n');
  write(path.join(root, 'docs', 'TASK_QUEUE.md'), `# Queue

## T1 First

Status: READY
Prerequisites: none
Allowed paths: \`src/a.js\`, \`docs/handoffs/T1.md\`, \`docs/TASK_QUEUE.md\`
Deliverable: a

Goal:
A.

## T2 Second

Status: READY
Prerequisites: none
Allowed paths: \`src/b.js\`, \`docs/handoffs/T2.md\`, \`docs/TASK_QUEUE.md\`
Deliverable: b

Goal:
B.

## T3 Depends

Status: BLOCKED
Prerequisites: T1, T2
Allowed paths: \`src/c.js\`, \`docs/handoffs/T3.md\`, \`docs/TASK_QUEUE.md\`
Deliverable: c

Goal:
C.

## T4 Needs Decision

Status: BLOCKED
Prerequisites: none
Allowed paths: \`src/d.js\`, \`docs/handoffs/T4.md\`, \`docs/TASK_QUEUE.md\`
Deliverable: d

Goal:
D.
`);
  execFileSync('git', ['init', '-b', 'main'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'initial'], { cwd: root, stdio: 'ignore' });
  return root;
}

test('parallel fake run creates a main branch, completes dependencies, and removes task worktrees', () => {
  const root = makeProject();
  execFileSync('node', [
    script,
    'run',
    '--cwd',
    root,
    '--max',
    '3',
    '--max-parallel',
    '2',
    '--no-native-session-required',
  ], {
    env: { ...process.env, CODEX_TASK_QUEUE_FAKE_RUNNER: '1' },
    stdio: 'pipe',
  });

  const branch = execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
  assert.match(branch, /^codex\/queue\/\d{8}-\d{6}-\d{3}\/main$/);

  const queue = fs.readFileSync(path.join(root, 'docs', 'TASK_QUEUE.md'), 'utf8');
  assert.match(queue, /## T1 First[\s\S]*?Status: DONE/);
  assert.match(queue, /## T2 Second[\s\S]*?Status: DONE/);
  assert.match(queue, /## T3 Depends[\s\S]*?Status: DONE/);
  assert.match(queue, /## T4 Needs Decision[\s\S]*?Status: BLOCKED/);

  const worktrees = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: root, encoding: 'utf8' });
  assert.equal((worktrees.match(/^worktree /gm) || []).length, 1);

  const state = JSON.parse(fs.readFileSync(path.join(root, '.codex-queue', 'parallel-state.json'), 'utf8'));
  assert.equal(state.maxParallel, 2);
  assert.equal(state.tasks.T1.status, 'DONE');
  assert.equal(state.tasks.T2.status, 'DONE');
  assert.equal(state.tasks.T3.status, 'DONE');
  assert.equal(state.tasks.T4, undefined);
});
