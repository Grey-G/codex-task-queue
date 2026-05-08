#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';

const VERSION = '0.1.0';
const COMMANDS = new Set(['doctor', 'init', 'next', 'run', 'history', 'help']);
const DEFAULT_IGNORES = new Set([
  '.git',
  '.codex-queue',
  'node_modules',
  'dist',
  'build',
  '.next',
  '.cache',
  '.dart_tool',
  'DerivedData',
  'Library',
  'Temp',
]);

function parseArgs(argv) {
  const args = {
    command: null,
    cwd: process.cwd(),
    runner: process.env.CODEX_TASK_QUEUE_RUNNER || 'auto',
    max: null,
    untilBlocked: false,
    dryRun: false,
    autoCommit: process.env.CODEX_TASK_QUEUE_AUTO_COMMIT !== '0',
    allowDirtyStart: false,
    requireNativeSession: process.env.CODEX_TASK_QUEUE_REQUIRE_NATIVE_SESSION !== '0',
    approval: process.env.CODEX_TASK_QUEUE_APPROVAL || 'never',
    sandbox: process.env.CODEX_TASK_QUEUE_SANDBOX || 'workspace-write',
    model: process.env.CODEX_TASK_QUEUE_MODEL || '',
    yes: false,
    commitPrefix: process.env.CODEX_TASK_QUEUE_COMMIT_PREFIX || 'queue',
    timeoutMs: Number(process.env.CODEX_TASK_QUEUE_TURN_TIMEOUT_MS || 60 * 60 * 1000),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!args.command && COMMANDS.has(arg)) {
      args.command = arg;
    } else if (arg === '--cwd' || arg === '-C') {
      args.cwd = argv[++i] || args.cwd;
    } else if (arg.startsWith('--cwd=')) {
      args.cwd = arg.slice('--cwd='.length);
    } else if (arg === '--runner') {
      args.runner = argv[++i] || args.runner;
    } else if (arg.startsWith('--runner=')) {
      args.runner = arg.slice('--runner='.length);
    } else if (arg === '--max') {
      args.max = Number(argv[++i] || '1');
    } else if (arg.startsWith('--max=')) {
      args.max = Number(arg.slice('--max='.length));
    } else if (arg === '--until-blocked') {
      args.untilBlocked = true;
      args.max = Number.POSITIVE_INFINITY;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--no-commit') {
      args.autoCommit = false;
    } else if (arg === '--allow-dirty-start') {
      args.allowDirtyStart = true;
    } else if (arg === '--no-native-session-required') {
      args.requireNativeSession = false;
    } else if (arg === '--approval' || arg === '-a') {
      args.approval = argv[++i] || args.approval;
    } else if (arg.startsWith('--approval=')) {
      args.approval = arg.slice('--approval='.length);
    } else if (arg === '--sandbox') {
      args.sandbox = argv[++i] || args.sandbox;
    } else if (arg.startsWith('--sandbox=')) {
      args.sandbox = arg.slice('--sandbox='.length);
    } else if (arg === '--model' || arg === '-m') {
      args.model = argv[++i] || '';
    } else if (arg.startsWith('--model=')) {
      args.model = arg.slice('--model='.length);
    } else if (arg === '--yes' || arg === '-y') {
      args.yes = true;
    } else if (arg === '--commit-prefix') {
      args.commitPrefix = argv[++i] || args.commitPrefix;
    } else if (arg.startsWith('--commit-prefix=')) {
      args.commitPrefix = arg.slice('--commit-prefix='.length);
    } else if (arg === '--help' || arg === '-h') {
      args.command = 'help';
    } else {
      fail(`Unknown argument: ${arg}`, 2);
    }
  }

  args.command = args.command || 'doctor';
  args.cwd = path.resolve(args.cwd);

  if (!['auto', 'app-server', 'exec'].includes(args.runner)) {
    fail('Invalid --runner value. Expected auto, app-server, or exec.', 2);
  }
  if (args.max !== null && args.max !== Number.POSITIVE_INFINITY && (!Number.isInteger(args.max) || args.max < 1)) {
    fail('Invalid --max value. Expected a positive integer.', 2);
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    args.timeoutMs = 60 * 60 * 1000;
  }

  return args;
}

function pathsFor(root) {
  const docs = path.join(root, 'docs');
  return {
    root,
    docs,
    product: path.join(docs, 'PRODUCT.md'),
    queue: path.join(docs, 'TASK_QUEUE.md'),
    runbook: path.join(docs, 'SESSION_RUNBOOK.md'),
    handoffs: path.join(docs, 'handoffs'),
    outDir: path.join(root, '.codex-queue'),
    runLog: path.join(docs, 'QUEUE_RUN_LOG.md'),
    nativeSessions: path.join(docs, 'QUEUE_NATIVE_SESSIONS.md'),
  };
}

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function rel(root, filePath) {
  return filePath.startsWith(root) ? path.relative(root, filePath) || '.' : filePath;
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readMaybe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`);
}

function appendText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, content);
}

function fileExists(filePath) {
  return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function dirExists(dirPath) {
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

function runCommand(command, commandArgs, options = {}) {
  return spawnSync(command, commandArgs, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    input: options.input,
  });
}

function git(root, gitArgs) {
  return runCommand('git', gitArgs, { cwd: root });
}

function isGitRepo(root) {
  const result = git(root, ['rev-parse', '--is-inside-work-tree']);
  return result.status === 0 && result.stdout.trim() === 'true';
}

function gitStatusShort(root) {
  const result = git(root, ['status', '--short']);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || 'git status failed');
  }
  return result.stdout.trim();
}

function commandVersion(command, commandArgs) {
  const result = runCommand(command, commandArgs, { cwd: process.cwd() });
  if (result.status !== 0) {
    return { ok: false, text: result.stderr.trim() || result.stdout.trim() || 'not found' };
  }
  return { ok: true, text: result.stdout.trim() || result.stderr.trim() };
}

function markdownEscape(value) {
  return String(value ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
}

function listFiles(root, options = {}) {
  const {
    maxDepth = 4,
    maxFiles = 200,
    predicate = () => true,
  } = options;
  const results = [];

  function walk(dir, depth) {
    if (results.length >= maxFiles || depth > maxDepth || !dirExists(dir)) {
      return;
    }

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxFiles) {
        return;
      }
      if (DEFAULT_IGNORES.has(entry.name)) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && predicate(fullPath)) {
        results.push(fullPath);
      }
    }
  }

  walk(root, 0);
  return results;
}

function readSnippet(filePath, maxChars = 12000) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return text.slice(0, maxChars);
  } catch {
    return '';
  }
}

function analyzeProjectMaterials(root) {
  const docs = path.join(root, 'docs');
  const manifestNames = [
    'package.json',
    'pyproject.toml',
    'Cargo.toml',
    'pubspec.yaml',
    'go.mod',
    'pom.xml',
    'build.gradle',
    'settings.gradle',
  ];
  const manifestFiles = manifestNames
    .map((name) => path.join(root, name))
    .filter(fileExists);
  const readmeFiles = listFiles(root, {
    maxDepth: 1,
    maxFiles: 20,
    predicate: (file) => /^readme(\.|$)/i.test(path.basename(file)),
  });
  const docFiles = dirExists(docs)
    ? listFiles(docs, {
      maxDepth: 2,
      maxFiles: 40,
      predicate: (file) => file.endsWith('.md') && !/QUEUE_|TASK_QUEUE|handoffs/i.test(file),
    })
    : [];
  const sourceDirs = ['src', 'app', 'apps', 'packages', 'lib', 'server', 'client', 'web', 'mobile']
    .map((name) => path.join(root, name))
    .filter(dirExists)
    .map((dir) => path.basename(dir));
  const sampleSourceFiles = listFiles(root, {
    maxDepth: 3,
    maxFiles: 40,
    predicate: (file) => /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|swift|kt|java|dart|cs)$/.test(file),
  });

  let packageInfo = null;
  const packageJson = path.join(root, 'package.json');
  if (fileExists(packageJson)) {
    try {
      packageInfo = JSON.parse(readText(packageJson));
    } catch {
      packageInfo = null;
    }
  }

  const evidenceFiles = [...readmeFiles, ...docFiles, ...manifestFiles].slice(0, 20);
  const evidenceText = evidenceFiles.map((file) => readSnippet(file, 6000)).join('\n\n');
  const materialChars = evidenceText.trim().length;
  const enough = materialChars >= 500
    || (manifestFiles.length > 0 && sourceDirs.length > 0)
    || (sampleSourceFiles.length >= 8 && sourceDirs.length > 0);

  const missing = [];
  if (!enough) {
    missing.push('A short product goal or README that explains what the project should do.');
    missing.push('The primary users or audience.');
    missing.push('One or more core user workflows.');
    missing.push('Acceptance criteria for the first useful milestone.');
  }

  return {
    root,
    enough,
    missing,
    packageInfo,
    manifestFiles,
    readmeFiles,
    docFiles,
    sourceDirs,
    sampleSourceFiles,
    evidenceFiles,
    materialChars,
  };
}

function productDocCandidates(root) {
  const explicit = [
    path.join(root, 'docs', 'PRODUCT.md'),
    path.join(root, 'docs', 'PRD.md'),
    path.join(root, 'docs', 'REQUIREMENTS.md'),
    path.join(root, 'docs', 'DECISIONS.md'),
    path.join(root, 'PRODUCT.md'),
    path.join(root, 'PRD.md'),
    path.join(root, 'REQUIREMENTS.md'),
    path.join(root, 'README.md'),
  ].filter(fileExists);
  const docs = path.join(root, 'docs');
  const discovered = dirExists(docs)
    ? listFiles(docs, {
      maxDepth: 2,
      maxFiles: 40,
      predicate: (file) => {
        const name = path.basename(file).toLowerCase();
        return file.endsWith('.md')
          && /(product|prd|requirement|decision|roadmap|spec|需求|产品|决策)/i.test(name)
          && !/task_queue|queue_|handoff/i.test(name);
      },
    })
    : [];
  return [...new Set([...explicit, ...discovered])];
}

function productDocStatus(filePath) {
  const root = path.dirname(path.dirname(filePath));
  let actualPath = filePath;
  if (!fileExists(actualPath)) {
    actualPath = productDocCandidates(root).find((candidate) => candidate !== filePath) || filePath;
  }
  if (!fileExists(actualPath)) {
    return { exists: false, filePath: actualPath, draft: false, executable: false, reasons: ['missing executable product document'] };
  }
  const text = readMaybe(actualPath);
  const draft = /status:\s*draft|draft - user confirmation|required before run/i.test(text);
  const checks = [
    /goal|objective|purpose|目标|目的/i.test(text),
    /user|audience|customer|用户|受众/i.test(text),
    /scope|in scope|out of scope|non-goal|范围|边界/i.test(text),
    /acceptance|success criteria|验收|成功标准/i.test(text),
    /constraint|assumption|risk|约束|假设|风险/i.test(text),
  ];
  const passed = checks.filter(Boolean).length;
  const executable = !draft && text.trim().length >= 300 && passed >= 2;
  const reasons = [];
  if (draft) reasons.push('docs/PRODUCT.md is marked DRAFT');
  if (text.trim().length < 300) reasons.push('docs/PRODUCT.md is too short to guide execution');
  if (passed < 2) reasons.push('product document lacks enough goal/user/scope/acceptance/constraint coverage');
  return { exists: true, filePath: actualPath, draft, executable, reasons };
}

function queueStatus(filePath) {
  if (!fileExists(filePath)) {
    return { exists: false, draft: false, valid: false, ready: null, reasons: ['missing docs/TASK_QUEUE.md'] };
  }
  const text = readMaybe(filePath);
  const draft = /queue status:\s*draft|draft - user confirmation|required before run/i.test(text);
  const hasSections = /^##\s+.+$/m.test(text);
  const hasStatuses = /^Status:\s*(READY|BLOCKED|DONE)\s*$/gm.test(text);
  const ready = getReadyTask(text);
  const valid = !draft && hasSections && hasStatuses;
  const reasons = [];
  if (draft) reasons.push('docs/TASK_QUEUE.md is marked DRAFT');
  if (!hasSections) reasons.push('docs/TASK_QUEUE.md has no task sections');
  if (!hasStatuses) reasons.push('docs/TASK_QUEUE.md has no READY/BLOCKED/DONE statuses');
  return { exists: true, draft, valid, ready, reasons };
}

function getReadyTask(queueText) {
  const sections = queueText
    .split(/\n(?=## )/g)
    .filter((section) => section.startsWith('## '));
  const ready = sections.find((section) => /^Status:\s*READY\s*$/m.test(section));
  if (!ready) {
    return null;
  }
  const title = ready.match(/^##\s+(.+)$/m)?.[1]?.trim() || 'Unknown task';
  return {
    id: title.split(/\s+/)[0] || 'UNKNOWN',
    title,
    body: ready.trim(),
  };
}

function ensureRunnableProject(root) {
  const paths = pathsFor(root);
  const product = productDocStatus(paths.product);
  const queue = queueStatus(paths.queue);
  const missing = [];
  if (!product.executable) missing.push(...product.reasons);
  if (!queue.valid) missing.push(...queue.reasons);
  if (!fileExists(paths.runbook)) missing.push('missing docs/SESSION_RUNBOOK.md');
  if (missing.length) {
    throw new Error([
      'Project is not ready for automated task execution.',
      ...missing.map((item) => `- ${item}`),
      '',
      'Run `codex-task-queue init` first, then confirm draft docs before running tasks.',
    ].join('\n'));
  }
  return { paths, product, queue };
}

function generateProductDraft(analysis) {
  const packageName = analysis.packageInfo?.name || path.basename(analysis.root);
  const description = analysis.packageInfo?.description || 'No package description was found.';
  const scripts = analysis.packageInfo?.scripts
    ? Object.keys(analysis.packageInfo.scripts).slice(0, 12).join(', ')
    : 'No package scripts detected.';
  const evidence = analysis.evidenceFiles.length
    ? analysis.evidenceFiles.map((file) => `- ${rel(analysis.root, file)}`).join('\n')
    : '- Source tree and manifests only.';
  const dirs = analysis.sourceDirs.length ? analysis.sourceDirs.join(', ') : 'No standard source directories detected.';

  return `# Product Document

Status: DRAFT - user confirmation required before queue execution

## Summary

Project: ${packageName}

Observed description: ${description}

This draft was generated from repository material. Review and replace assumptions before running automated implementation tasks.

## Users And Audience

- Primary user: TODO confirm.
- Secondary users or operators: TODO confirm.

## Goals

- Preserve the existing project intent inferred from repository files.
- Define the first executable milestone in small tasks that a single Codex session can complete.
- Keep changes reviewable through one Git commit per task.

## In Scope

- Work that can be validated locally from the repository.
- Small implementation, documentation, or test tasks with explicit allowed paths.
- Queue-driven Codex sessions that write handoffs and update task status.

## Out Of Scope

- Production deployment unless a task explicitly defines it.
- External account, payment, or secret configuration unless supplied by the user.
- Large refactors without a queue task and acceptance criteria.

## Repository Evidence

Detected source directories: ${dirs}

Detected package scripts: ${scripts}

Evidence files:

${evidence}

## Acceptance Criteria

- The user confirms this product document is accurate enough to execute.
- docs/TASK_QUEUE.md contains one first READY task and later tasks are BLOCKED.
- Each task has prerequisites, allowed paths, deliverables, must-include items, and do-not items.
- The project is a Git repository before task execution starts.

## Open Questions

- What is the first user-visible outcome that should be implemented?
- Which files or modules are safe for the first task to edit?
- Which validation command proves the first milestone works?
- Are there external inputs, secrets, accounts, or design assets needed before work starts?
`;
}

function generateTaskQueueDraft(analysis) {
  const packageName = analysis.packageInfo?.name || path.basename(analysis.root);
  return `# Codex Task Queue

Queue status: DRAFT - user confirmation required before run

Status values:

- READY: the next session can execute this task now.
- BLOCKED: wait until prerequisites are DONE or user input is supplied.
- DONE: task completed and handoff written.

Queue policy:

- Do not run this draft queue until the product document is confirmed.
- After confirmation, set Queue status to CONFIRMED and make exactly one first task READY.
- Keep each task small enough for one Codex session and one Git commit.

## A1 Confirm Product Contract

Status: BLOCKED
Prerequisites: user confirms docs/PRODUCT.md
Allowed paths: \`docs/PRODUCT.md\`, \`docs/TASK_QUEUE.md\`, \`docs/handoffs/A1.md\`
Deliverable: confirmed \`docs/PRODUCT.md\` and executable \`docs/TASK_QUEUE.md\`

Goal:
Review the generated product document for ${packageName}, replace TODO assumptions with concrete product decisions, and unlock the first implementation task.

Must include:

- Product goal, users, scope, non-goals, acceptance criteria, and constraints.
- A first READY implementation or verification task.
- Later tasks left BLOCKED.

Do not:

- Implement product code.
- Skip user confirmation.

## B1 First Implementation Slice

Status: BLOCKED
Prerequisites: A1
Allowed paths: TODO define narrow implementation paths, \`docs/handoffs/B1.md\`, \`docs/TASK_QUEUE.md\`
Deliverable: TODO define first useful deliverable

Goal:
Implement the first confirmed product slice.

Must include:

- TODO define expected behavior.
- TODO define validation command.

Do not:

- Broaden scope beyond the confirmed slice.
- Execute later tasks.
`;
}

function generateRunbook() {
  return `# Session Runbook

Every automated Codex task must follow these rules:

1. Read \`docs/PRODUCT.md\`, \`docs/SESSION_RUNBOOK.md\`, and \`docs/TASK_QUEUE.md\`.
2. Execute only the first task with \`Status: READY\`.
3. Respect the task's \`Allowed paths\`.
4. Do not perform later tasks.
5. If the task is blocked by missing product or implementation decisions, write the blocker in \`docs/handoffs/<task-id>.md\` and leave later tasks blocked.
6. On completion, write \`docs/handoffs/<task-id>.md\`.
7. Update \`docs/TASK_QUEUE.md\`: mark the current task \`DONE\`, keep completed deliverables clear, and unlock at most one next task as \`READY\`.
8. Run focused validation and record the exact commands in the handoff.
9. End with a concise summary of changed files, validation, and the next READY task.
`;
}

async function promptYesNo(question, defaultNo = true) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultNo ? ' [y/N] ' : ' [Y/n] ';
  const answer = await new Promise((resolve) => rl.question(`${question}${suffix}`, resolve));
  rl.close();
  const normalized = answer.trim().toLowerCase();
  if (!normalized) return !defaultNo;
  return normalized === 'y' || normalized === 'yes';
}

async function promptRunCount(args) {
  if (args.max !== null || args.untilBlocked) {
    return args;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    fail('Run count is required in non-interactive mode. Pass --max 1, --max N, or --until-blocked.', 2);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    rl.question('How many READY tasks should run? Enter 1, a number, or until-blocked: ', resolve);
  });
  rl.close();
  const normalized = answer.trim().toLowerCase();
  if (normalized === 'until-blocked' || normalized === 'until blocked' || normalized === 'all') {
    args.untilBlocked = true;
    args.max = Number.POSITIVE_INFINITY;
  } else if (!normalized) {
    args.max = 1;
  } else {
    const count = Number(normalized);
    if (!Number.isInteger(count) || count < 1) {
      fail('Invalid run count. Expected 1, a positive integer, or until-blocked.', 2);
    }
    args.max = count;
  }
  return args;
}

async function ensureGitForRun(root, args) {
  if (args.dryRun) {
    return;
  }
  if (isGitRepo(root)) {
    return;
  }
  if (!args.autoCommit) {
    console.warn('No Git repository detected. Continuing because --no-commit is set.');
    return;
  }
  const confirmed = args.yes || await promptYesNo('No Git repository detected. Initialize Git and create a baseline commit?');
  if (!confirmed) {
    fail('Git is required for automatic task commits. Rerun with --yes after user confirmation, or pass --no-commit.', 1);
  }
  initGitBaseline(root);
}

function initGitBaseline(root) {
  const init = git(root, ['init', '-b', 'main']);
  if (init.status !== 0) {
    const fallback = git(root, ['init']);
    if (fallback.status !== 0) {
      throw new Error(fallback.stderr.trim() || fallback.stdout.trim() || 'git init failed');
    }
  }

  const ignorePath = path.join(root, '.gitignore');
  if (!fileExists(ignorePath)) {
    writeText(ignorePath, [
      '.DS_Store',
      '.codex-queue/',
      'node_modules/',
      'dist/',
      'build/',
      '.cache/',
      '',
    ].join('\n'));
  }

  const add = git(root, ['add', '-A']);
  if (add.status !== 0) {
    throw new Error(add.stderr.trim() || add.stdout.trim() || 'git add failed');
  }
  const commit = git(root, [
    'commit',
    '--allow-empty',
    '-m',
    'chore: initialize project baseline',
    '-m',
    'Baseline commit created by codex-task-queue before automated task execution.',
  ]);
  if (commit.status !== 0) {
    throw new Error(commit.stderr.trim() || commit.stdout.trim() || 'git baseline commit failed');
  }
  console.log('Initialized Git repository and created baseline commit.');
}

function ensureCleanTaskStart(root, args, task) {
  if (!args.autoCommit || args.dryRun || !isGitRepo(root)) {
    return;
  }
  const status = gitStatusShort(root);
  if (status && !args.allowDirtyStart) {
    throw new Error([
      `Refusing to start ${task.title} with a dirty Git working tree.`,
      'Commit or stash existing changes first, or rerun with --allow-dirty-start to include them in the next task commit.',
      '',
      status,
    ].join('\n'));
  }
}

function appendRunLog(root, { task, status, outputPath = '', note = '' }) {
  const paths = pathsFor(root);
  if (!fileExists(paths.runLog)) {
    writeText(paths.runLog, '# Queue Run Log\n\n| Time | Task | Status | Last Message | Note |\n|---|---|---|---|---|\n');
  }
  const line = [
    new Date().toISOString(),
    task?.title || '',
    status,
    outputPath ? `\`${rel(root, outputPath)}\`` : '',
    markdownEscape(note),
  ].join(' | ');
  appendText(paths.runLog, `| ${line} |\n`);
}

function appendNativeSessionLog(root, { task, session, outputPath = '' }) {
  const paths = pathsFor(root);
  if (!session) {
    appendRunLog(root, { task, status: 'native-session-missing', note: 'No new Codex native session file detected' });
    return false;
  }
  if (!fileExists(paths.nativeSessions)) {
    writeText(paths.nativeSessions, '# Queue Native Codex Sessions\n\n| Time | Task | Session ID | Source | Raw Session File | Resume Command | Last Message |\n|---|---|---|---|---|---|---|\n');
  }
  const resumeCommand = session.source === 'exec'
    ? `codex resume --include-non-interactive ${session.id}`
    : `codex resume ${session.id}`;
  const line = [
    new Date().toISOString(),
    task?.title || '',
    `\`${session.id}\``,
    session.source || session.originator || '',
    `\`${session.filePath}\``,
    `\`${resumeCommand}\``,
    outputPath ? `\`${rel(root, outputPath)}\`` : '',
  ].map(markdownEscape).join(' | ');
  appendText(paths.nativeSessions, `| ${line} |\n`);
  appendRunLog(root, { task, status: 'native-session-recorded', note: session.id });
  return true;
}

function outputPathFor(root, iteration, task) {
  const safeTask = task.id.replace(/[^a-zA-Z0-9_-]+/g, '_');
  return path.join(pathsFor(root).outDir, `${String(iteration).padStart(2, '0')}-${safeTask}-last-message.md`);
}

function buildTaskPrompt(root, task, productPath) {
  const productDoc = productPath ? rel(root, productPath) : 'docs/PRODUCT.md';
  return `Continue this project through codex-task-queue.

This run was started by the automatic queue runner. Execute only the current task, not later tasks.

Read first:
1. ${productDoc}
2. docs/SESSION_RUNBOOK.md
3. docs/TASK_QUEUE.md

Current task:

${task.body}

Execution rules:
1. Strictly respect the task's Allowed paths.
2. Do not do follow-up tasks opportunistically.
3. If required product or implementation details are missing, write the blocker in docs/handoffs/${task.id}.md and stop.
4. When complete, write docs/handoffs/${task.id}.md.
5. Update docs/TASK_QUEUE.md: mark the current task DONE, fill the deliverable state, and unlock at most one next task as READY.
6. End with changed files, validation commands, and the next READY task.
`;
}

function parseSessionMeta(filePath) {
  try {
    const firstLine = readText(filePath).split('\n')[0];
    if (!firstLine) return null;
    const parsed = JSON.parse(firstLine);
    if (parsed?.type !== 'session_meta' || !parsed.payload?.id) return null;
    return {
      id: String(parsed.payload.id),
      cwd: String(parsed.payload.cwd ?? ''),
      originator: String(parsed.payload.originator ?? ''),
      source: String(parsed.payload.source ?? ''),
      cliVersion: String(parsed.payload.cli_version ?? ''),
      timestamp: String(parsed.payload.timestamp ?? ''),
      filePath,
    };
  } catch {
    return null;
  }
}

function nativeSessionRoot() {
  return path.join(os.homedir(), '.codex', 'sessions');
}

function listNativeSessionFiles() {
  return listFiles(nativeSessionRoot(), {
    maxDepth: 6,
    maxFiles: 5000,
    predicate: (file) => file.endsWith('.jsonl'),
  }).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

function snapshotNativeSessions() {
  return new Set(listNativeSessionFiles());
}

function findNewNativeSession(root, beforeSet) {
  const candidates = listNativeSessionFiles()
    .filter((file) => !beforeSet.has(file))
    .map((file) => parseSessionMeta(file))
    .filter((meta) => meta && path.resolve(meta.cwd) === root)
    .sort((a, b) => fs.statSync(b.filePath).mtimeMs - fs.statSync(a.filePath).mtimeMs);
  return candidates[0] ?? null;
}

function recentNativeSessions(root, limit = 12) {
  return listNativeSessionFiles()
    .map((file) => parseSessionMeta(file))
    .filter((meta) => meta && path.resolve(meta.cwd) === root)
    .sort((a, b) => fs.statSync(b.filePath).mtimeMs - fs.statSync(a.filePath).mtimeMs)
    .slice(0, limit);
}

function runCodexExec(root, prompt, args, task, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const cmd = [
    '-a',
    args.approval,
    '--sandbox',
    args.sandbox,
  ];
  if (args.model) {
    cmd.push('--model', args.model);
  }
  cmd.push(
    'exec',
    '--cd',
    root,
    '--skip-git-repo-check',
    '--json',
    '--output-last-message',
    outputPath,
    '-',
  );
  console.log(`codex ${cmd.join(' ')}`);
  const result = runCommand('codex', cmd, {
    cwd: root,
    input: prompt,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  return { status: result.status ?? 1, outputPath, safeToFallback: false };
}

function requestForServerRequest(message) {
  if (!message?.id || !message?.method) {
    return null;
  }
  return {
    id: message.id,
    error: {
      code: 'UNSUPPORTED_QUEUE_SERVER_REQUEST',
      message: `codex-task-queue app-server runner cannot handle ${message.method}`,
    },
  };
}

function runCodexAppServer(root, prompt, args, task, outputPath) {
  return new Promise((resolve) => {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const child = spawn('codex', ['app-server', '--config', 'plugins={}'], {
      cwd: root,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    let nextId = 1;
    const ids = {
      initialize: nextId++,
      threadStart: nextId++,
      threadNameSet: nextId++,
      turnStart: nextId++,
    };
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let thread = null;
    let lastAgentMessage = '';
    let finished = false;
    let exitCode = 1;
    let turnStarted = false;
    const deltaByItem = new Map();
    const suppressedWarnings = new Set();

    function send(message) {
      if (!child.stdin.writable || child.stdin.destroyed) {
        return;
      }
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }

    function writeLastMessage() {
      writeText(outputPath, lastAgentMessage.trim() || '(no final assistant message captured)');
    }

    function finish(code, reason = '') {
      if (finished) {
        return;
      }
      finished = true;
      exitCode = code;
      writeLastMessage();
      if (thread?.id) {
        console.log(`App-server thread: ${thread.id}`);
        if (thread.path) {
          console.log(`App-server session file: ${thread.path}`);
        }
      }
      if (reason) {
        console.error(reason);
      }
      child.stdin.end();
      setTimeout(() => {
        if (!child.killed) child.kill();
      }, 5000).unref();
    }

    const timeout = setTimeout(() => {
      finish(124, `Timed out waiting for app-server turn after ${args.timeoutMs}ms`);
    }, args.timeoutMs);

    function handleStderrLine(line) {
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        process.stderr.write(`${line}\n`);
        return;
      }
      const message = parsed?.fields?.message || '';
      const target = parsed?.target || '';
      if (parsed?.level === 'WARN' && target.startsWith('codex_core')) {
        if (message.startsWith('failed to warm featured plugin ids cache')) {
          if (!suppressedWarnings.has('featured-plugin-cache')) {
            suppressedWarnings.add('featured-plugin-cache');
            console.error('Suppressed Codex warning: featured plugin cache warmup failed.');
          }
          return;
        }
        if (message.startsWith('ignoring interface.')) {
          if (!suppressedWarnings.has('plugin-interface-metadata')) {
            suppressedWarnings.add('plugin-interface-metadata');
            console.error('Suppressed Codex warning: plugin interface metadata validation.');
          }
          return;
        }
      }
      process.stderr.write(`${line}\n`);
    }

    child.stderr.on('data', (chunk) => {
      stderrBuffer += chunk;
      while (true) {
        const newlineIndex = stderrBuffer.indexOf('\n');
        if (newlineIndex === -1) break;
        const line = stderrBuffer.slice(0, newlineIndex);
        stderrBuffer = stderrBuffer.slice(newlineIndex + 1);
        if (line.trim()) handleStderrLine(line);
      }
    });

    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk;
      while (true) {
        const newlineIndex = stdoutBuffer.indexOf('\n');
        if (newlineIndex === -1) break;
        const raw = stdoutBuffer.slice(0, newlineIndex);
        stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
        if (!raw.trim()) continue;

        let message;
        try {
          message = JSON.parse(raw);
        } catch {
          console.log(raw);
          continue;
        }

        if (message.id === ids.initialize) {
          console.log(`Connected to ${message.result?.userAgent || 'codex app-server'}`);
          send({ method: 'initialized' });
          send({
            id: ids.threadStart,
            method: 'thread/start',
            params: {
              cwd: root,
              approvalPolicy: args.approval,
              sandbox: args.sandbox,
              model: args.model || null,
              ephemeral: false,
              sessionStartSource: 'startup',
            },
          });
          continue;
        }

        if (message.id === ids.threadStart) {
          thread = message.result?.thread || null;
          if (!thread?.id) {
            finish(1, 'app-server did not return a thread id');
            continue;
          }
          console.log(`Started visible Codex thread: ${thread.id}`);
          send({
            id: ids.threadNameSet,
            method: 'thread/name/set',
            params: {
              threadId: thread.id,
              name: `Queue: ${task.title}`,
            },
          });
          send({
            id: ids.turnStart,
            method: 'turn/start',
            params: {
              threadId: thread.id,
              cwd: root,
              approvalPolicy: args.approval,
              input: [
                {
                  type: 'text',
                  text: prompt,
                  text_elements: [],
                },
              ],
            },
          });
          continue;
        }

        if (message.id === ids.turnStart) {
          turnStarted = true;
          console.log(`Started turn: ${message.result?.turn?.id || 'unknown'}`);
          continue;
        }

        if (message.error && message.id) {
          finish(1, `app-server request ${message.id} failed: ${message.error.message || JSON.stringify(message.error)}`);
          continue;
        }

        if (message.method === 'item/agentMessage/delta') {
          const itemId = message.params?.itemId;
          const delta = message.params?.delta || '';
          if (itemId) {
            deltaByItem.set(itemId, `${deltaByItem.get(itemId) || ''}${delta}`);
            lastAgentMessage = deltaByItem.get(itemId);
          }
          continue;
        }

        if (message.method === 'item/completed') {
          const item = message.params?.item;
          if (item?.type === 'agentMessage') {
            lastAgentMessage = item.text || lastAgentMessage;
          } else if (item?.type === 'commandExecution') {
            console.log(`Command ${item.status}: ${item.command}`);
          } else if (item?.type === 'fileChange') {
            console.log(`File change ${item.status}: ${item.changes?.length || 0} entries`);
          }
          continue;
        }

        if (message.method === 'turn/completed') {
          const status = message.params?.turn?.status;
          if (status && status !== 'completed') {
            finish(1, `Turn finished with status ${status}`);
          } else {
            finish(0);
          }
          continue;
        }

        const unsupportedResponse = requestForServerRequest(message);
        if (unsupportedResponse) {
          console.error(`Unsupported app-server request: ${message.method}`);
          send(unsupportedResponse);
        }
      }
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      console.error(error.message);
      resolve({ status: 1, outputPath, safeToFallback: !turnStarted });
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (stderrBuffer.trim()) {
        handleStderrLine(stderrBuffer.trim());
      }
      if (!finished && code !== 0) {
        resolve({ status: code || 1, outputPath, safeToFallback: !turnStarted });
        return;
      }
      resolve({ status: exitCode, outputPath, safeToFallback: !turnStarted && exitCode !== 0 });
    });

    console.log('codex app-server --config plugins={}');
    send({
      id: ids.initialize,
      method: 'initialize',
      params: {
        clientInfo: {
          name: 'codex-task-queue',
          title: 'Codex Task Queue',
          version: VERSION,
        },
        capabilities: {
          experimentalApi: true,
        },
      },
    });
  });
}

async function runCodex(root, prompt, args, iteration, task) {
  const outputPath = outputPathFor(root, iteration, task);
  console.log(`\n=== Running ${task.title} ===`);
  console.log(`Last message: ${rel(root, outputPath)}`);

  if (args.dryRun) {
    console.log('\n--- Prompt preview ---\n');
    console.log(prompt);
    return { status: 0, outputPath, skipped: true };
  }

  if (args.runner === 'exec') {
    return runCodexExec(root, prompt, args, task, outputPath);
  }

  const appResult = await runCodexAppServer(root, prompt, args, task, outputPath);
  if (appResult.status === 0 || args.runner === 'app-server') {
    return appResult;
  }
  if (!appResult.safeToFallback) {
    return appResult;
  }
  console.error('app-server failed before task execution started; falling back to codex exec --json.');
  return runCodexExec(root, prompt, args, task, outputPath);
}

function commitTask(root, args, task) {
  if (!args.autoCommit) {
    appendRunLog(root, { task, status: 'commit-skipped', note: 'auto-commit disabled' });
    return;
  }
  if (!isGitRepo(root)) {
    throw new Error('auto-commit is enabled, but the workspace is not inside a Git repository');
  }
  const statusBefore = gitStatusShort(root);
  if (!statusBefore) {
    console.log('No Git changes to commit.');
    return;
  }
  const titleWithoutId = task.title.replace(new RegExp(`^${task.id}\\s+`), '').trim();
  const subject = `${args.commitPrefix}: complete ${task.id} ${titleWithoutId}`.slice(0, 100);
  const body = [
    `Task: ${task.title}`,
    '',
    'Committed automatically by codex-task-queue after the task completed successfully.',
  ].join('\n');

  appendRunLog(root, { task, status: 'committed', note: subject });
  const add = git(root, ['add', '-A']);
  if (add.status !== 0) {
    throw new Error(add.stderr.trim() || add.stdout.trim() || 'git add failed');
  }
  const commit = git(root, ['commit', '-m', subject, '-m', body]);
  if (commit.status !== 0) {
    throw new Error(commit.stderr.trim() || commit.stdout.trim() || 'git commit failed');
  }
  console.log(commit.stdout.trim());
}

function printHelp() {
  console.log(`codex-task-queue ${VERSION}

Usage:
  node scripts/codex-task-queue.mjs <doctor|init|next|run|history> [options]

Options:
  --cwd <dir>                    Target project root.
  --yes                          Confirm Git initialization and baseline commit.
  --runner auto|app-server|exec  Default: auto.
  --max <n>                      Run up to n READY tasks.
  --until-blocked                Run until no READY task remains or a task fails.
  --dry-run                      Print prompts without starting Codex.
  --no-commit                    Disable automatic task commits.
  --allow-dirty-start            Include existing dirty tree in next task commit.
  --no-native-session-required   Do not fail when no native session id is detected.
  --approval <policy>            Default: never.
  --sandbox <mode>               Default: workspace-write.
  --model <model>                Optional Codex model.
`);
}

function printDoctor(args) {
  const root = args.cwd;
  const paths = pathsFor(root);
  const codex = commandVersion('codex', ['--version']);
  const gitVersion = commandVersion('git', ['--version']);
  const product = productDocStatus(paths.product);
  const queue = queueStatus(paths.queue);
  const gitRepo = isGitRepo(root);
  const dirty = gitRepo ? gitStatusShort(root) : '';

  console.log(`# codex-task-queue doctor\n`);
  console.log(`Project: ${root}`);
  console.log(`Node: ${process.version}`);
  console.log(`Codex CLI: ${codex.ok ? codex.text : `missing (${codex.text})`}`);
  console.log(`Git: ${gitVersion.ok ? gitVersion.text : `missing (${gitVersion.text})`}`);
  console.log(`Git repository: ${gitRepo ? 'yes' : 'no'}`);
  console.log(`Git working tree: ${gitRepo ? (dirty ? 'dirty' : 'clean') : 'not applicable'}`);
  console.log(`Product doc: ${product.executable ? `executable (${rel(args.cwd, product.filePath)})` : product.exists ? `present but not executable (${rel(args.cwd, product.filePath)})` : 'missing'}`);
  for (const reason of product.reasons) console.log(`  - ${reason}`);
  console.log(`Task queue: ${queue.valid ? 'valid' : queue.exists ? 'present but not runnable' : 'missing'}`);
  for (const reason of queue.reasons) console.log(`  - ${reason}`);
  console.log(`Runbook: ${fileExists(paths.runbook) ? 'present' : 'missing'}`);
  console.log(`First READY task: ${queue.ready ? queue.ready.title : 'none'}`);
}

async function initProject(args) {
  const root = args.cwd;
  const paths = pathsFor(root);
  const analysis = analyzeProjectMaterials(root);
  const standardProductExists = fileExists(paths.product);

  console.log(`# codex-task-queue init\n`);
  console.log(`Project: ${root}`);

  const writes = [];
  if (!standardProductExists || !fileExists(paths.queue)) {
    if (!analysis.enough) {
      console.log('Not enough project material to generate executable product docs.');
      console.log('Please provide:');
      for (const item of analysis.missing) console.log(`- ${item}`);
      process.exit(2);
    }

    if (!standardProductExists) {
      writes.push([paths.product, generateProductDraft(analysis)]);
    }
    if (!fileExists(paths.queue)) {
      writes.push([paths.queue, generateTaskQueueDraft(analysis)]);
    }
  }
  if (!fileExists(paths.runbook)) {
    writes.push([paths.runbook, generateRunbook()]);
  }

  if (args.dryRun) {
    if (!writes.length) {
      console.log('No files would be created.');
    } else {
      console.log('Files that would be created:');
      for (const [file] of writes) console.log(`- ${rel(root, file)}`);
    }
    return;
  }

  for (const [file, content] of writes) {
    writeText(file, content);
    console.log(`Wrote ${rel(root, file)}`);
  }

  if (!writes.length) {
    console.log('Project queue files already exist.');
  } else {
    console.log('\nDraft docs were created. Review them, remove DRAFT status after user confirmation, and make exactly one first task READY before running implementation tasks.');
  }

  if (!isGitRepo(root)) {
    if (args.yes) {
      initGitBaseline(root);
    } else {
      console.log('\nNo Git repository detected.');
      console.log('Automatic task commits need Git. Rerun init with --yes after confirming Git initialization, or run with --no-commit later.');
    }
  }
}

function printNext(args) {
  const { paths, product } = ensureRunnableProject(args.cwd);
  const queueText = readText(paths.queue);
  const task = getReadyTask(queueText);
  if (!task) {
    console.log('No READY task found. Queue is blocked or complete.');
    return;
  }
  console.log(`Next task: ${task.title}`);
  console.log('');
  console.log('Prompt preview:');
  console.log('');
  console.log(buildTaskPrompt(args.cwd, task, product.filePath));
}

function printHistory(args) {
  const root = args.cwd;
  const paths = pathsFor(root);
  const lastMessages = listFiles(paths.outDir, {
    maxDepth: 1,
    maxFiles: 20,
    predicate: (file) => file.endsWith('.md'),
  });
  const handoffs = listFiles(paths.handoffs, {
    maxDepth: 1,
    maxFiles: 20,
    predicate: (file) => file.endsWith('.md'),
  });
  const nativeSessions = recentNativeSessions(root, 12);

  function printFiles(title, files) {
    console.log(`\n${title}`);
    if (!files.length) {
      console.log('  none');
      return;
    }
    for (const file of files) {
      console.log(`  ${rel(root, file)}  ${fs.statSync(file).mtime.toISOString()}`);
    }
  }

  printFiles('Queue last messages', lastMessages);
  printFiles('Task handoffs', handoffs);
  printFiles('Run logs', [paths.runLog, paths.nativeSessions].filter(fileExists));

  console.log('\nRecent native Codex sessions');
  if (!nativeSessions.length) {
    console.log('  none');
  } else {
    for (const session of nativeSessions) {
      const command = session.source === 'exec'
        ? `codex resume --include-non-interactive ${session.id}`
        : `codex resume ${session.id}`;
      console.log(`  ${session.id}  ${command}`);
    }
  }
}

async function runQueue(args) {
  const root = args.cwd;
  await promptRunCount(args);
  const { paths, product } = ensureRunnableProject(root);
  await ensureGitForRun(root, args);

  let previousTaskTitle = '';
  let completed = 0;

  while (completed < args.max) {
    const queueText = readText(paths.queue);
    const task = getReadyTask(queueText);
    if (!task) {
      console.log('No READY task found. Queue is blocked or complete.');
      return;
    }
    if (task.title === previousTaskTitle) {
      fail(`The same READY task is still first in queue: ${task.title}\nStopping to avoid an infinite loop. Check docs/TASK_QUEUE.md and the handoff.`, 1);
    }

    ensureCleanTaskStart(root, args, task);
    const prompt = buildTaskPrompt(root, task, product.filePath);
    const beforeNativeSessions = snapshotNativeSessions();
    const result = await runCodex(root, prompt, args, completed + 1, task);

    if (result.status !== 0) {
      appendRunLog(root, { task, status: `failed:${result.status}`, note: 'Codex run exited non-zero' });
      fail(`Codex run failed for ${task.title} with exit code ${result.status}`, result.status || 1);
    }

    if (args.dryRun) {
      return;
    }

    const afterQueue = readText(paths.queue);
    const nextTask = getReadyTask(afterQueue);
    const nativeSession = findNewNativeSession(root, beforeNativeSessions);
    completed += 1;
    appendRunLog(root, {
      task,
      status: 'completed',
      outputPath: result.outputPath,
      note: `${nativeSession ? `native ${nativeSession.id}; ` : 'native session not detected; '}${nextTask ? `next ${nextTask.title}` : 'no next READY task'}`,
    });
    const nativeRecorded = appendNativeSessionLog(root, { task, session: nativeSession, outputPath: result.outputPath });
    if (!nativeRecorded && args.requireNativeSession) {
      fail(`No Codex native session id was detected for ${task.title}.\nStopping because native session persistence is required. Rerun with --no-native-session-required only for diagnosis.`, 1);
    }

    commitTask(root, args, task);

    if (!nextTask) {
      console.log('No next READY task found. Queue is blocked or complete.');
      return;
    }
    if (nextTask.title === task.title) {
      fail(`Task did not advance: ${task.title}\nStopping to avoid repeatedly running the same task.`, 1);
    }
    previousTaskTitle = task.title;
    console.log(`Next READY task: ${nextTask.title}`);
  }

  console.log(`Reached max run count: ${args.max}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'help') {
    printHelp();
  } else if (args.command === 'doctor') {
    printDoctor(args);
  } else if (args.command === 'init') {
    await initProject(args);
  } else if (args.command === 'next') {
    printNext(args);
  } else if (args.command === 'history') {
    printHistory(args);
  } else if (args.command === 'run') {
    await runQueue(args);
  } else {
    fail(`Unknown command: ${args.command}`, 2);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
