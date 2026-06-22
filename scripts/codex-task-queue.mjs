#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';

const VERSION = '0.5.2';
const DEFAULT_MODEL = 'gpt-5.5';
const DEFAULT_REASONING_EFFORT = 'xhigh';
const DEFAULT_SERVICE_TIER = 'standard';
const DEFAULT_MACOS_CODEX = '/Applications/Codex.app/Contents/Resources/codex';
const DEFAULT_MAX_PARALLEL = 5;
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
    mode: process.env.CODEX_TASK_QUEUE_MODE || 'project',
    runner: process.env.CODEX_TASK_QUEUE_RUNNER || 'auto',
    allowExecFallback: process.env.CODEX_TASK_QUEUE_ALLOW_EXEC_FALLBACK === '1',
    max: null,
    parallel: process.env.CODEX_TASK_QUEUE_PARALLEL !== '0',
    maxParallel: Number(process.env.CODEX_TASK_QUEUE_MAX_PARALLEL || DEFAULT_MAX_PARALLEL),
    untilBlocked: false,
    dryRun: false,
    autoCommit: process.env.CODEX_TASK_QUEUE_AUTO_COMMIT !== '0',
    allowDirtyStart: false,
    requireNativeSession: process.env.CODEX_TASK_QUEUE_REQUIRE_NATIVE_SESSION !== '0',
    approval: process.env.CODEX_TASK_QUEUE_APPROVAL || 'never',
    sandbox: process.env.CODEX_TASK_QUEUE_SANDBOX || 'workspace-write',
    model: process.env.CODEX_TASK_QUEUE_MODEL || DEFAULT_MODEL,
    reasoningEffort: process.env.CODEX_TASK_QUEUE_REASONING_EFFORT || process.env.CODEX_TASK_QUEUE_MODEL_REASONING_EFFORT || DEFAULT_REASONING_EFFORT,
    serviceTier: process.env.CODEX_TASK_QUEUE_SERVICE_TIER || process.env.CODEX_TASK_QUEUE_SPEED || DEFAULT_SERVICE_TIER,
    codexCommand: process.env.CODEX_TASK_QUEUE_CODEX || process.env.CODEX_CLI_PATH || '',
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
    } else if (arg === '--mode') {
      args.mode = argv[++i] || args.mode;
    } else if (arg.startsWith('--mode=')) {
      args.mode = arg.slice('--mode='.length);
    } else if (arg === '--maintenance') {
      args.mode = 'maintenance';
    } else if (arg === '--runner') {
      args.runner = argv[++i] || args.runner;
    } else if (arg.startsWith('--runner=')) {
      args.runner = arg.slice('--runner='.length);
    } else if (arg === '--allow-exec-fallback') {
      args.allowExecFallback = true;
    } else if (arg === '--max') {
      args.max = Number(argv[++i] || '1');
    } else if (arg.startsWith('--max=')) {
      args.max = Number(arg.slice('--max='.length));
    } else if (arg === '--max-parallel') {
      args.maxParallel = Number(argv[++i] || String(DEFAULT_MAX_PARALLEL));
    } else if (arg.startsWith('--max-parallel=')) {
      args.maxParallel = Number(arg.slice('--max-parallel='.length));
    } else if (arg === '--parallel') {
      args.parallel = true;
    } else if (arg === '--no-parallel') {
      args.parallel = false;
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
    } else if (arg === '--reasoning-effort') {
      args.reasoningEffort = argv[++i] || '';
    } else if (arg.startsWith('--reasoning-effort=')) {
      args.reasoningEffort = arg.slice('--reasoning-effort='.length);
    } else if (arg === '--service-tier') {
      args.serviceTier = argv[++i] || '';
    } else if (arg.startsWith('--service-tier=')) {
      args.serviceTier = arg.slice('--service-tier='.length);
    } else if (arg === '--speed') {
      args.serviceTier = argv[++i] || '';
    } else if (arg.startsWith('--speed=')) {
      args.serviceTier = arg.slice('--speed='.length);
    } else if (arg === '--codex') {
      args.codexCommand = argv[++i] || '';
    } else if (arg.startsWith('--codex=')) {
      args.codexCommand = arg.slice('--codex='.length);
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
  args.mode = String(args.mode || 'project').toLowerCase();
  args.codexCommand = args.codexCommand || defaultCodexCommand();

  if (!['project', 'maintenance'].includes(args.mode)) {
    fail('Invalid --mode value. Expected project or maintenance.', 2);
  }
  if (!['auto', 'app-server', 'exec'].includes(args.runner)) {
    fail('Invalid --runner value. Expected auto, app-server, or exec.', 2);
  }
  if (args.max !== null && args.max !== Number.POSITIVE_INFINITY && (!Number.isInteger(args.max) || args.max < 1)) {
    fail('Invalid --max value. Expected a positive integer.', 2);
  }
  if (!Number.isInteger(args.maxParallel) || args.maxParallel < 1) {
    fail('Invalid --max-parallel value. Expected a positive integer.', 2);
  }
  if (!Number.isFinite(args.timeoutMs) || args.timeoutMs <= 0) {
    args.timeoutMs = 60 * 60 * 1000;
  }

  return args;
}

function queueFileNameFor(mode = 'project') {
  return mode === 'maintenance' ? 'PATCH_QUEUE.md' : 'TASK_QUEUE.md';
}

function queueLabelFor(mode = 'project') {
  return `docs/${queueFileNameFor(mode)}`;
}

function pathsFor(root, mode = 'project') {
  const docs = path.join(root, 'docs');
  return {
    root,
    docs,
    product: path.join(docs, 'PRODUCT.md'),
    queue: path.join(docs, queueFileNameFor(mode)),
    runbook: path.join(docs, 'SESSION_RUNBOOK.md'),
    handoffs: path.join(docs, 'handoffs'),
    outDir: path.join(root, '.codex-queue'),
    parallelState: path.join(root, '.codex-queue', 'parallel-state.json'),
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

function defaultCodexCommand() {
  return fileExists(DEFAULT_MACOS_CODEX) ? DEFAULT_MACOS_CODEX : 'codex';
}

function codexConfigArg(key, value) {
  return `${key}=${JSON.stringify(value)}`;
}

function appendCodexConfigArgs(commandArgs, args) {
  if (args.reasoningEffort) {
    commandArgs.push('-c', codexConfigArg('model_reasoning_effort', args.reasoningEffort));
  }
  if (args.serviceTier) {
    commandArgs.push('-c', codexConfigArg('service_tier', args.serviceTier));
  }
}

function threadStartConfig(args) {
  const config = {};
  if (args.reasoningEffort) config.model_reasoning_effort = args.reasoningEffort;
  if (args.serviceTier) config.service_tier = args.serviceTier;
  return Object.keys(config).length ? config : null;
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

function gitRequire(root, gitArgs, description = 'git command failed') {
  const result = git(root, gitArgs);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || description);
  }
  return result.stdout.trim();
}

function currentBranch(root) {
  const branch = git(root, ['branch', '--show-current']);
  if (branch.status === 0 && branch.stdout.trim()) return branch.stdout.trim();
  return gitRequire(root, ['rev-parse', '--short', 'HEAD'], 'failed to determine current git ref');
}

function gitRef(root, ref = 'HEAD') {
  return gitRequire(root, ['rev-parse', ref], `failed to resolve ${ref}`);
}

function branchExists(root, branch) {
  return git(root, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0;
}

function ensureBranchNameAvailable(root, branch) {
  if (branchExists(root, branch)) {
    throw new Error(`Branch already exists: ${branch}`);
  }
}

function checkoutNewBranch(root, branch, startPoint = 'HEAD') {
  ensureBranchNameAvailable(root, branch);
  gitRequire(root, ['switch', '-c', branch, startPoint], `failed to create branch ${branch}`);
}

function checkoutBranch(root, branch) {
  gitRequire(root, ['switch', branch], `failed to switch to branch ${branch}`);
}

function mergeBranch(root, branch, message) {
  return git(root, ['merge', '--no-ff', '--no-edit', '-m', message, branch]);
}

function unmergedFiles(root) {
  const result = git(root, ['diff', '--name-only', '--diff-filter=U']);
  if (result.status !== 0) return [];
  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

function worktreeRootFor(root, runId) {
  return path.join(path.dirname(root), '.codex-task-worktrees', path.basename(root), runId);
}

function addWorktree(root, worktreePath, branch, startPoint) {
  fs.mkdirSync(path.dirname(worktreePath), { recursive: true });
  ensureBranchNameAvailable(root, branch);
  gitRequire(root, ['worktree', 'add', '-b', branch, worktreePath, startPoint], `failed to add worktree for ${branch}`);
}

function removeWorktree(root, worktreePath) {
  const result = git(root, ['worktree', 'remove', '--force', worktreePath]);
  if (result.status !== 0) {
    console.warn(result.stderr.trim() || result.stdout.trim() || `Failed to remove worktree ${worktreePath}`);
    return false;
  }
  return true;
}

function commitAll(root, subject, body = '') {
  const status = gitStatusShort(root);
  if (!status) return false;
  gitRequire(root, ['add', '-A'], 'git add failed');
  const args = ['commit', '-m', subject];
  if (body) args.push('-m', body);
  gitRequire(root, args, 'git commit failed');
  return true;
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
      predicate: (file) => file.endsWith('.md') && !/QUEUE_|TASK_QUEUE|PATCH_QUEUE|handoffs/i.test(file),
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
          && !/task_queue|patch_queue|queue_|handoff/i.test(name);
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

function queueStatus(filePath, queueName = 'docs/TASK_QUEUE.md') {
  if (!fileExists(filePath)) {
    return { exists: false, draft: false, valid: false, ready: null, reasons: [`missing ${queueName}`] };
  }
  const text = readMaybe(filePath);
  const draft = /queue status:\s*draft|draft - user confirmation|required before run/i.test(text);
  const hasSections = /^##\s+.+$/m.test(text);
  const hasStatuses = /^Status:\s*(READY|RUNNING|BLOCKED|DONE)\s*$/gm.test(text);
  const ready = getReadyTask(text);
  const valid = !draft && hasSections && hasStatuses;
  const reasons = [];
  if (draft) reasons.push(`${queueName} is marked DRAFT`);
  if (!hasSections) reasons.push(`${queueName} has no task sections`);
  if (!hasStatuses) reasons.push(`${queueName} has no READY/RUNNING/BLOCKED/DONE statuses`);
  return { exists: true, draft, valid, ready, reasons };
}

function markdownSections(queueText) {
  return queueText
    .split(/\n(?=## )/g)
    .filter((section) => section.startsWith('## '));
}

function parseTaskField(section, fieldName) {
  const escaped = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return section.match(new RegExp(`^${escaped}:\\s*(.+)$`, 'mi'))?.[1]?.trim() || '';
}

function parseAllowedPaths(section) {
  const raw = parseTaskField(section, 'Allowed paths');
  if (!raw) return [];
  const backticked = [...raw.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim()).filter(Boolean);
  if (backticked.length) return backticked;
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

function parseQueueTasks(queueText) {
  const sections = markdownSections(queueText);
  const firstPass = sections.map((section, index) => {
    const title = section.match(/^##\s+(.+)$/m)?.[1]?.trim() || `Task ${index + 1}`;
    return {
      id: title.split(/\s+/)[0] || `TASK${index + 1}`,
      title,
      body: section.trim(),
      section,
      index,
      status: (parseTaskField(section, 'Status') || 'BLOCKED').toUpperCase(),
      rawPrerequisites: parseTaskField(section, 'Prerequisites') || 'none',
      allowedPaths: parseAllowedPaths(section),
    };
  });
  const ids = new Set(firstPass.map((task) => task.id));
  return firstPass.map((task) => {
    const raw = task.rawPrerequisites.trim();
    if (!raw || /^none$/i.test(raw)) {
      return { ...task, dependencyIds: [], hasNonTaskPrerequisites: false };
    }
    let remainder = raw;
    const dependencyIds = [];
    for (const id of ids) {
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)`).test(raw)) {
        dependencyIds.push(id);
        remainder = remainder.replace(new RegExp(`(^|[^A-Za-z0-9_-])${escaped}([^A-Za-z0-9_-]|$)`, 'g'), ' ');
      }
    }
    remainder = remainder.replace(/\b(and|or)\b/gi, ' ').replace(/[,\s]+/g, ' ').trim();
    return {
      ...task,
      dependencyIds: dependencyIds.sort((a, b) => {
        const ai = firstPass.find((candidate) => candidate.id === a)?.index ?? 0;
        const bi = firstPass.find((candidate) => candidate.id === b)?.index ?? 0;
        return ai - bi;
      }),
      hasNonTaskPrerequisites: Boolean(remainder),
    };
  });
}

function getReadyTask(queueText) {
  const ready = markdownSections(queueText).find((section) => /^Status:\s*READY\s*$/m.test(section));
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

function updateQueueTaskStatuses(queueText, statusById) {
  return queueText
    .split(/\n(?=## )/g)
    .map((part) => {
      if (!part.startsWith('## ')) return part;
      const title = part.match(/^##\s+(.+)$/m)?.[1]?.trim() || '';
      const id = title.split(/\s+/)[0] || '';
      const status = statusById.get(id);
      if (!status) return part;
      if (/^Status:\s*.+$/mi.test(part)) {
        return part.replace(/^Status:\s*.+$/mi, `Status: ${status}`);
      }
      return part.replace(/^##\s+.+$/m, (heading) => `${heading}\n\nStatus: ${status}`);
    })
    .join('\n');
}

function ensureRunnableProject(root, args = {}) {
  const mode = args.mode || 'project';
  const paths = pathsFor(root, mode);
  const product = mode === 'project'
    ? productDocStatus(paths.product)
    : { exists: false, filePath: null, draft: false, executable: true, reasons: [] };
  const queue = queueStatus(paths.queue, queueLabelFor(mode));
  const missing = [];
  if (mode === 'project' && !product.executable) missing.push(...product.reasons);
  if (!queue.valid) missing.push(...queue.reasons);
  if (!fileExists(paths.runbook)) missing.push('missing docs/SESSION_RUNBOOK.md');
  if (missing.length) {
    throw new Error([
      'Workspace is not ready for automated task execution.',
      ...missing.map((item) => `- ${item}`),
      '',
      `Run \`codex-task-queue init --mode ${mode}\` first, then confirm draft docs before running tasks.`,
    ].join('\n'));
  }
  return { paths, product, queue, mode };
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
- docs/TASK_QUEUE.md contains executable task sections with READY/BLOCKED/DONE status.
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
- RUNNING: claimed by the parallel coordinator.
- BLOCKED: wait until prerequisites are DONE or user input is supplied.
- DONE: task completed and handoff written.

Queue policy:

- Do not run this draft queue until the product document is confirmed.
- After confirmation, set Queue status to CONFIRMED and make all independent first tasks READY.
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
- Later dependent tasks left BLOCKED with explicit prerequisites.

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

function generatePatchQueueDraft(analysis) {
  const packageName = analysis.packageInfo?.name || path.basename(analysis.root);
  const scripts = analysis.packageInfo?.scripts
    ? Object.keys(analysis.packageInfo.scripts).slice(0, 12).join(', ')
    : 'No package scripts detected.';
  const evidence = analysis.evidenceFiles.length
    ? analysis.evidenceFiles.map((file) => `- ${rel(analysis.root, file)}`).join('\n')
    : '- Add issue reports, failing logs, screenshots, warnings, or reproduction notes before execution.';

  return `# Codex Patch Queue

Queue status: DRAFT - user confirmation required before run

Use this queue for maintenance work: bug fixes, warning cleanup, small UI adjustments, targeted refactors, test fixes, or batches of unrelated patches.

Detected project: ${packageName}

Detected package scripts: ${scripts}

Evidence files seen during initialization:

${evidence}

Status values:

- READY: the next session can execute this patch now.
- RUNNING: claimed by the parallel coordinator.
- BLOCKED: wait until prerequisites, evidence, or user input are supplied.
- DONE: patch completed and handoff written.

Patch policy:

- This queue does not require \`docs/PRODUCT.md\`; each task must carry its own issue evidence and acceptance checks.
- Keep independent first patch tasks READY after the draft is confirmed.
- Keep each patch small enough for one Codex session and one Git commit.
- Use \`Allowed paths\` as a hard scope fence.
- Prefer fixing the named issue over opportunistic cleanup.

## P0 Triage Patch List

Status: BLOCKED
Type: triage
Severity: n/a
Prerequisites: user supplies or confirms the issue list
Allowed paths: \`docs/PATCH_QUEUE.md\`, \`docs/handoffs/P0.md\`
Deliverable: prioritized patch tasks in \`docs/PATCH_QUEUE.md\`

Issue / Evidence:
Replace this section with the raw bug list, warnings, screenshots, failing commands, or reproduction notes.

Goal:
Turn a loose maintenance backlog into small executable patch tasks, then unlock independent first patches as READY.

Must include:

- One task per independent bug, warning group, or patch.
- Repro or evidence for each patch where available.
- Expected behavior and validation command for each patch.
- Narrow allowed paths for each patch.

Do not:

- Implement runtime code.
- Bundle unrelated fixes into one patch task.
- Execute later tasks.

## P1 First Patch

Status: BLOCKED
Type: patch
Severity: TODO
Prerequisites: P0 or direct user confirmation of this task
Allowed paths: TODO narrow file paths, \`docs/handoffs/P1.md\`, \`docs/PATCH_QUEUE.md\`
Deliverable: TODO define the concrete fixed behavior

Issue / Evidence:
TODO include reproduction steps, error text, screenshot path, warning text, or user report.

Expected:
TODO describe the exact behavior after the patch.

Validation:
TODO include the focused command or manual check that proves the patch.

Goal:
Fix only the named issue.

Must include:

- Defensive handling for the reported failure mode.
- Focused tests or validation when feasible.
- A handoff summarizing changed files, validation, and residual risk.

Do not:

- Refactor unrelated code.
- Change behavior outside the allowed paths.
- Execute later tasks.
`;
}

function generateRunbook() {
  return `# Session Runbook

Every automated Codex task must follow these rules:

1. Read the active queue context:
   - Project mode: \`docs/PRODUCT.md\`, \`docs/SESSION_RUNBOOK.md\`, and \`docs/TASK_QUEUE.md\`.
   - Maintenance mode: \`docs/SESSION_RUNBOOK.md\`, \`docs/PATCH_QUEUE.md\`, and any evidence files named by the current patch task.
2. In parallel mode, execute only tasks whose prerequisites are satisfied. In serial mode, execute only the first task with \`Status: READY\`.
3. Respect the task's \`Allowed paths\`.
4. Do not perform later tasks or opportunistic cleanup.
5. If the task is blocked by missing product decisions, reproduction evidence, or implementation decisions, write the blocker in \`docs/handoffs/<task-id>.md\` and leave later tasks blocked.
6. On completion, write \`docs/handoffs/<task-id>.md\`.
7. Serial mode updates the active queue file directly. Parallel workers must not update queue status; the coordinator marks tasks \`DONE\` and unlocks runnable dependents.
8. Run focused validation and record the exact commands in the handoff.
9. Stop any long-running process started by the task, such as dev servers, watchers, simulators, tunnels, or background test commands. If a process must remain running, record its command, PID or port, and reason in the handoff.
10. End with a concise summary of changed files, validation, process cleanup, and the next READY task.
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

function applyRunCountDefault(args) {
  if (args.max !== null || args.untilBlocked) {
    return args;
  }
  args.untilBlocked = true;
  args.max = Number.POSITIVE_INFINITY;
  console.log('No run count specified. Defaulting to --until-blocked.');
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

function appendNativeSessionLog(root, { task, session, outputPath = '', codexCommand = 'codex', branch = '', worktree = '' }) {
  const paths = pathsFor(root);
  if (!session) {
    appendRunLog(root, { task, status: 'native-session-missing', note: 'No new Codex native session file detected' });
    return false;
  }
  const header = '# Queue Native Codex Sessions\n\n| Time | Task | Session ID | Source | Branch | Worktree | Raw Session File | Resume Command | Last Message |\n|---|---|---|---|---|---|---|---|---|\n';
  if (!fileExists(paths.nativeSessions)) {
    writeText(paths.nativeSessions, header);
  } else {
    const existing = readText(paths.nativeSessions);
    if (!existing.includes('| Branch | Worktree |')) {
      writeText(paths.nativeSessions, existing.replace(
        /^# Queue Native Codex Sessions\n\n\| Time \| Task \| Session ID \| Source \| Raw Session File \| Resume Command \| Last Message \|\n\|---\|---\|---\|---\|---\|---\|---\|\n/,
        header,
      ));
    }
  }
  const resumeCommand = session.source === 'exec'
    ? `${codexCommand} resume --include-non-interactive ${session.id}`
    : `${codexCommand} resume ${session.id}`;
  const line = [
    new Date().toISOString(),
    task?.title || '',
    `\`${session.id}\``,
    session.source || session.originator || '',
    branch ? `\`${branch}\`` : '',
    worktree ? `\`${worktree}\`` : '',
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

function buildTaskPrompt(root, task, context = {}) {
  const mode = context.mode || 'project';
  const queueDoc = queueLabelFor(mode);
  const productDoc = context.productPath ? rel(root, context.productPath) : 'docs/PRODUCT.md';
  const readFirst = mode === 'maintenance'
    ? [
      '1. docs/SESSION_RUNBOOK.md',
      `2. ${queueDoc}`,
      '3. Any evidence files listed in the current patch task',
    ].join('\n')
    : [
      `1. ${productDoc}`,
      '2. docs/SESSION_RUNBOOK.md',
      `3. ${queueDoc}`,
    ].join('\n');
  const opener = mode === 'maintenance'
    ? 'Continue this repository through codex-task-queue maintenance mode.'
    : 'Continue this project through codex-task-queue.';
  const blockedReason = mode === 'maintenance'
    ? 'required reproduction, evidence, or implementation details are missing'
    : 'required product or implementation details are missing';

  return `${opener}

This run was started by the automatic queue runner. Execute only the current task, not later tasks.

Read first:
${readFirst}

Current task:

${task.body}

Execution rules:
1. Strictly respect the task's Allowed paths.
2. Do not do follow-up tasks opportunistically.
3. If ${blockedReason}, write the blocker in docs/handoffs/${task.id}.md and stop.
4. When complete, write docs/handoffs/${task.id}.md.
5. Update ${queueDoc}: mark the current task DONE, fill the deliverable state, and unlock at most one next task as READY.
6. Stop any long-running process started by this task. If a process must remain running, record its command, PID or port, and reason in the handoff.
7. End with changed files, validation commands, process cleanup, and the next READY task.
`;
}

function buildParallelTaskPrompt(root, task, context = {}) {
  const mode = context.mode || 'project';
  const queueDoc = queueLabelFor(mode);
  const productDoc = context.productPath ? rel(root, context.productPath) : 'docs/PRODUCT.md';
  const readFirst = mode === 'maintenance'
    ? [
      '1. docs/SESSION_RUNBOOK.md',
      `2. ${queueDoc}`,
      '3. Any evidence files listed in the current patch task',
    ].join('\n')
    : [
      `1. ${productDoc}`,
      '2. docs/SESSION_RUNBOOK.md',
      `3. ${queueDoc}`,
    ].join('\n');
  return `Continue this repository through codex-task-queue parallel worker mode.

This run is coordinated by the queue runner. Execute only the current task in this worktree.

Read first:
${readFirst}

Current task:

${task.body}

Execution rules:
1. Strictly respect the task's Allowed paths.
2. Do not do follow-up tasks opportunistically.
3. Do not edit ${queueDoc}; the coordinator owns queue state in parallel mode.
4. If required product decisions, reproduction evidence, or implementation details are missing, write the blocker in docs/handoffs/${task.id}.md and stop.
5. When complete, write docs/handoffs/${task.id}.md.
6. Stop any long-running process started by this task. If a process must remain running, record its command, PID or port, and reason in the handoff.
7. End with changed files, validation commands, process cleanup, and any blocker or residual risk.
`;
}

function buildConflictResolutionPrompt(task, conflictFiles, mergedBranch) {
  return `Continue this codex-task-queue parallel run by resolving a Git merge conflict.

The coordinator attempted to merge ${mergedBranch} for task ${task.title}. Resolve the current merge conflicts in this worktree, then run focused validation relevant to the conflicting files.

Conflict files:
${conflictFiles.map((file) => `- ${file}`).join('\n') || '- unknown'}

Rules:
1. Resolve only the merge conflict and any directly necessary compile/test fallout.
2. Do not broaden product scope or run later queue tasks.
3. Do not edit queue status unless it is required to resolve a conflict marker in the queue file.
4. Leave a short note in docs/handoffs/${task.id}.md if the conflict resolution changes risk or validation.
5. End with files changed and validation commands.
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
  appendCodexConfigArgs(cmd, args);
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
  console.log(`${args.codexCommand} ${cmd.join(' ')}`);
  const result = runCommand(args.codexCommand, cmd, {
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
    const appServerArgs = ['app-server', '--config', 'plugins={}'];
    appendCodexConfigArgs(appServerArgs, args);
    const child = spawn(args.codexCommand, appServerArgs, {
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
              serviceTier: args.serviceTier || null,
              config: threadStartConfig(args),
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
              model: args.model || null,
              serviceTier: args.serviceTier || null,
              effort: args.reasoningEffort || null,
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

    console.log(`${args.codexCommand} ${appServerArgs.join(' ')}`);
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
  const outputRoot = args.outputRoot || root;
  const outputPath = outputPathFor(outputRoot, iteration, task);
  console.log(`\n=== Running ${task.title} ===`);
  console.log(`Last message: ${rel(outputRoot, outputPath)}`);

  if (args.dryRun) {
    console.log('\n--- Prompt preview ---\n');
    console.log(prompt);
    return { status: 0, outputPath, skipped: true };
  }

  if (process.env.CODEX_TASK_QUEUE_FAKE_RUNNER === '1') {
    writeText(outputPath, `Fake runner completed ${task.title}`);
    const handoffPath = path.join(root, 'docs', 'handoffs', `${task.id}.md`);
    writeText(handoffPath, [
      `# ${task.title}`,
      '',
      'Completed by CODEX_TASK_QUEUE_FAKE_RUNNER.',
      '',
    ].join('\n'));
    return { status: 0, outputPath, skipped: true };
  }

  if (args.runner === 'exec') {
    appendRunLog(root, {
      task,
      status: 'exec-runner',
      outputPath,
      note: 'explicit --runner exec non-visible run',
    });
    return runCodexExec(root, prompt, args, task, outputPath);
  }

  const appResult = await runCodexAppServer(root, prompt, args, task, outputPath);
  if (appResult.status === 0 || args.runner === 'app-server') {
    return appResult;
  }
  if (!appResult.safeToFallback) {
    return appResult;
  }
  if (!args.allowExecFallback) {
    console.error('app-server failed before task execution started. Refusing invisible exec fallback by default.');
    console.error('Rerun with --allow-exec-fallback for one-off fallback, or --runner exec for an explicit non-visible run.');
    return appResult;
  }
  console.error('app-server failed before task execution started; falling back to codex exec --json because --allow-exec-fallback is set.');
  appendRunLog(root, {
    task,
    status: 'exec-fallback',
    outputPath,
    note: 'app-server failed before task start; --allow-exec-fallback enabled',
  });
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
  codex-task-queue <doctor|init|next|run|history> [options]

Options:
  --cwd <dir>                    Target project root.
  --mode project|maintenance     Default: project. Use maintenance for patch queues.
  --maintenance                  Alias for --mode maintenance.
  --yes                          Confirm Git initialization and baseline commit.
  --runner auto|app-server|exec  Default: auto.
  --allow-exec-fallback          Let auto fall back to invisible codex exec when app-server cannot start.
  --max <n>                      Run up to n READY tasks. Use --max 1 for one task only.
  --max-parallel <n>             Default: ${DEFAULT_MAX_PARALLEL}. Worker limit; 1 still uses a worktree.
  --no-parallel                  Use the legacy serial loop in the current checkout.
  --until-blocked                Run until no READY task remains or a task fails. Default when no --max is passed.
  --dry-run                      Print prompts without starting Codex.
  --no-commit                    Disable automatic task commits.
  --allow-dirty-start            Include existing dirty tree in next task commit.
  --no-native-session-required   Do not fail when no native session id is detected.
  --approval <policy>            Default: never.
  --sandbox <mode>               Default: workspace-write.
  --model <model>                Default: ${DEFAULT_MODEL}.
  --reasoning-effort <effort>    Default: ${DEFAULT_REASONING_EFFORT}.
  --service-tier <tier>          Default: ${DEFAULT_SERVICE_TIER}.
  --speed <tier>                 Alias for --service-tier.
  --codex <path>                 Codex CLI path. Defaults to Desktop app CLI on macOS when present.
`);
}

function printDoctor(args) {
  const root = args.cwd;
  const paths = pathsFor(root, args.mode);
  const codex = commandVersion(args.codexCommand, ['--version']);
  const gitVersion = commandVersion('git', ['--version']);
  const product = args.mode === 'project' ? productDocStatus(paths.product) : null;
  const queue = queueStatus(paths.queue, queueLabelFor(args.mode));
  const gitRepo = isGitRepo(root);
  const dirty = gitRepo ? gitStatusShort(root) : '';

  console.log(`# codex-task-queue doctor\n`);
  console.log(`Project: ${root}`);
  console.log(`Mode: ${args.mode}`);
  console.log(`Node: ${process.version}`);
  console.log(`Codex command: ${args.codexCommand}`);
  console.log(`Codex CLI: ${codex.ok ? codex.text : `missing (${codex.text})`}`);
  console.log(`Model: ${args.model || '(Codex default)'}`);
  console.log(`Reasoning effort: ${args.reasoningEffort || '(Codex default)'}`);
  console.log(`Service tier: ${args.serviceTier || '(Codex default)'}`);
  console.log(`Git: ${gitVersion.ok ? gitVersion.text : `missing (${gitVersion.text})`}`);
  console.log(`Git repository: ${gitRepo ? 'yes' : 'no'}`);
  console.log(`Git working tree: ${gitRepo ? (dirty ? 'dirty' : 'clean') : 'not applicable'}`);
  console.log(`Runner: ${args.runner}`);
  console.log(`Parallel coordinator: ${args.parallel ? `enabled (max workers ${args.maxParallel})` : 'disabled (--no-parallel)'}`);
  console.log(`Exec fallback: ${args.allowExecFallback ? 'enabled' : 'disabled'}`);
  if (args.mode === 'project') {
    console.log(`Product doc: ${product.executable ? `executable (${rel(args.cwd, product.filePath)})` : product.exists ? `present but not executable (${rel(args.cwd, product.filePath)})` : 'missing'}`);
    for (const reason of product.reasons) console.log(`  - ${reason}`);
  } else {
    console.log('Product doc: not required in maintenance mode');
  }
  console.log(`Active queue (${queueLabelFor(args.mode)}): ${queue.valid ? 'valid' : queue.exists ? 'present but not runnable' : 'missing'}`);
  for (const reason of queue.reasons) console.log(`  - ${reason}`);
  console.log(`Runbook: ${fileExists(paths.runbook) ? 'present' : 'missing'}`);
  console.log(`First READY task: ${queue.ready ? queue.ready.title : 'none'}`);
  if (queue.exists) {
    const tasks = parseQueueTasks(readMaybe(paths.queue));
    printExternalPrereqHint(externalPrereqBlockedTasks(tasks, taskStatusById(tasks)));
  }
}

async function initProject(args) {
  const root = args.cwd;
  const paths = pathsFor(root, args.mode);
  const analysis = analyzeProjectMaterials(root);

  console.log(`# codex-task-queue init\n`);
  console.log(`Project: ${root}`);
  console.log(`Mode: ${args.mode}`);

  const writes = [];
  if (args.mode === 'maintenance') {
    if (!fileExists(paths.queue)) {
      writes.push([paths.queue, generatePatchQueueDraft(analysis)]);
    }
  } else {
    const standardProductExists = fileExists(paths.product);
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
    console.log('Queue files already exist.');
  } else if (args.mode === 'maintenance') {
    console.log('\nDraft patch queue was created. Fill or confirm the issue list, remove DRAFT status, and make independent first patch tasks READY before running maintenance tasks.');
  } else {
    console.log('\nDraft docs were created. Review them, remove DRAFT status after user confirmation, and make independent first tasks READY before running implementation tasks.');
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
  const { paths, product, mode } = ensureRunnableProject(args.cwd, args);
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
  console.log(buildTaskPrompt(args.cwd, task, { mode, productPath: product.filePath }));
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
        ? `${args.codexCommand} resume --include-non-interactive ${session.id}`
        : `${args.codexCommand} resume ${session.id}`;
      console.log(`  ${session.id}  ${command}`);
    }
  }
}

function isInternalQueuePath(filePath, mode) {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  return normalized === queueLabelFor(mode)
    || normalized === 'docs/SESSION_RUNBOOK.md'
    || normalized.startsWith('docs/handoffs/')
    || normalized.startsWith('.codex-queue/');
}

function conflictKey(filePath) {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.\//, '').trim();
  if (!normalized || /^todo\b/i.test(normalized)) return '*';
  if (normalized.includes('**')) return normalized.slice(0, normalized.indexOf('**')).replace(/\/+$/, '') || '*';
  if (normalized.includes('*')) return normalized.slice(0, normalized.indexOf('*')).replace(/\/+$/, '') || '*';
  return normalized.replace(/\/+$/, '');
}

function allowedPathKeys(task, mode) {
  const keys = task.allowedPaths
    .filter((item) => !isInternalQueuePath(item, mode))
    .map(conflictKey)
    .filter(Boolean);
  return keys.length ? keys : ['*'];
}

function pathKeysOverlap(left, right) {
  if (left.includes('*') || right.includes('*')) return true;
  return left.some((a) => right.some((b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)));
}

function taskPathConflict(left, right, mode) {
  return pathKeysOverlap(allowedPathKeys(left, mode), allowedPathKeys(right, mode));
}

function taskStatusById(tasks) {
  return new Map(tasks.map((task) => [task.id, task.status]));
}

function dependenciesDone(task, statusById) {
  return task.dependencyIds.every((id) => statusById.get(id) === 'DONE');
}

function externalPrereqBlockedTasks(tasks, statusById) {
  return tasks.filter((task) => (
    task.status === 'BLOCKED'
    && task.hasNonTaskPrerequisites
    && dependenciesDone(task, statusById)
  ));
}

function printExternalPrereqHint(tasks) {
  if (!tasks.length) return;
  console.log('Blocked tasks with non-task prerequisites will not auto-unlock:');
  for (const task of tasks.slice(0, 8)) {
    console.log(`  - ${task.id}: Prerequisites: ${task.rawPrerequisites}`);
  }
  console.log('Use task ids only for automatic unlocks, or mark the task READY after the external decision is satisfied.');
}

function createRunId() {
  return new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').replace(/\.(\d+)Z$/, '-$1');
}

function branchSegment(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'task';
}

function createMainTaskBranch(root, { allowDirty = false, requireClean = false } = {}) {
  const dirtyStatus = gitStatusShort(root);
  if (dirtyStatus && (requireClean || !allowDirty)) {
    throw new Error([
      'Queue runs require a clean Git working tree before creating the main task branch.',
      'Commit or stash existing changes first, or rerun serial mode with --allow-dirty-start to include them in the next task commit.',
      '',
      dirtyStatus,
    ].join('\n'));
  }
  const runId = createRunId();
  const baseBranch = currentBranch(root);
  const baseCommit = gitRef(root, 'HEAD');
  const branchPrefix = `codex/queue/${runId}`;
  const mainBranch = `${branchPrefix}/main`;
  checkoutNewBranch(root, mainBranch, 'HEAD');
  return { runId, baseBranch, baseCommit, branchPrefix, mainBranch, dirtyAtStart: Boolean(dirtyStatus) };
}

function isRunnableTask(task, statusById) {
  if (task.status === 'DONE' || task.status === 'RUNNING') return false;
  if (task.hasNonTaskPrerequisites) return task.status === 'READY' && dependenciesDone(task, statusById);
  if (task.dependencyIds.length === 0) return task.status === 'READY';
  return dependenciesDone(task, statusById);
}

function writeParallelState(root, state) {
  writeText(pathsFor(root, state.mode).parallelState, JSON.stringify(state, null, 2));
}

function updateParallelState(root, state, note = '') {
  state.updatedAt = new Date().toISOString();
  if (note) state.lastNote = note;
  writeParallelState(root, state);
}

function updateQueueStatuses(root, mode, updates, subject) {
  if (!updates.size) return false;
  const paths = pathsFor(root, mode);
  const current = readText(paths.queue);
  const next = updateQueueTaskStatuses(current, updates);
  if (next === current) return false;
  writeText(paths.queue, next);
  commitAll(root, subject);
  return true;
}

function syncAutoReadyTasks(root, mode) {
  const paths = pathsFor(root, mode);
  const tasks = parseQueueTasks(readText(paths.queue));
  const statuses = taskStatusById(tasks);
  const updates = new Map();
  for (const task of tasks) {
    if (task.status === 'BLOCKED' && task.dependencyIds.length > 0 && !task.hasNonTaskPrerequisites && dependenciesDone(task, statuses)) {
      updates.set(task.id, 'READY');
    }
  }
  updateQueueStatuses(root, mode, updates, 'queue: unlock ready tasks');
}

async function resolveMergeConflict(root, args, task, branch, mainRoot, iteration) {
  const conflictFiles = unmergedFiles(root);
  const resolverTask = {
    id: `resolve-${task.id}`,
    title: `Resolve merge conflict for ${task.title}`,
    body: '',
  };
  const prompt = buildConflictResolutionPrompt(task, conflictFiles, branch);
  const beforeNativeSessions = snapshotNativeSessions();
  const result = await runCodex(root, prompt, { ...args, outputRoot: mainRoot }, iteration, resolverTask);
  const nativeSession = findNewNativeSession(root, beforeNativeSessions);
  appendNativeSessionLog(mainRoot, {
    task: resolverTask,
    session: nativeSession,
    outputPath: result.outputPath,
    codexCommand: args.codexCommand,
    branch,
    worktree: root,
  });
  if (result.status !== 0 || unmergedFiles(root).length) {
    return false;
  }
  commitAll(root, `queue: resolve merge conflict for ${task.id}`, `Merged branch: ${branch}`);
  return true;
}

async function mergeWithResolution(root, args, task, branch, mainRoot, iteration) {
  const merge = mergeBranch(root, branch, `queue: merge ${task.id} ${task.title}`);
  if (merge.status === 0) return true;
  if (!unmergedFiles(root).length) {
    throw new Error(merge.stderr.trim() || merge.stdout.trim() || `failed to merge ${branch}`);
  }
  const resolved = await resolveMergeConflict(root, args, task, branch, mainRoot, iteration);
  if (resolved) return true;
  git(root, ['merge', '--abort']);
  return false;
}

async function prepareTaskWorktree(mainRoot, args, state, task, tasksById, iteration) {
  const worktreePath = path.join(state.worktreeRoot, branchSegment(task.id));
  const branch = `${state.branchPrefix}/${branchSegment(task.id)}`;
  const dependencyBranches = task.dependencyIds
    .map((id) => state.tasks[id]?.branch)
    .filter(Boolean);
  const startPoint = dependencyBranches.length === 1 ? dependencyBranches[0] : state.mainBranch;

  addWorktree(mainRoot, worktreePath, branch, startPoint);

  if (dependencyBranches.length > 1) {
    for (const dependencyBranch of dependencyBranches) {
      const dependencyTask = tasksById.get(Object.entries(state.tasks).find(([, info]) => info.branch === dependencyBranch)?.[0]) || task;
      const merged = await mergeWithResolution(worktreePath, args, dependencyTask, dependencyBranch, mainRoot, iteration);
      if (!merged) {
        return { ok: false, worktreePath, branch, reason: `could not resolve merge conflict from ${dependencyBranch}` };
      }
    }
  }

  return { ok: true, worktreePath, branch };
}

async function runParallelWorker(mainRoot, args, state, task, tasksById, iteration, context) {
  let prepared;
  try {
    prepared = await prepareTaskWorktree(mainRoot, args, state, task, tasksById, iteration);
  } catch (error) {
    return { task, ok: false, reason: error.message, setupFailed: true };
  }
  if (!prepared.ok) {
    return { task, ok: false, reason: prepared.reason, branch: prepared.branch, worktreePath: prepared.worktreePath };
  }

  const { branch, worktreePath } = prepared;
  state.tasks[task.id] = {
    ...(state.tasks[task.id] || {}),
    status: 'RUNNING',
    branch,
    worktree: worktreePath,
    startedAt: new Date().toISOString(),
    dependencies: task.dependencyIds,
  };
  updateParallelState(mainRoot, state, `started ${task.id}`);
  commitAll(mainRoot, `queue: record ${task.id} started`);

  const prompt = buildParallelTaskPrompt(worktreePath, task, context);
  const beforeNativeSessions = snapshotNativeSessions();
  const result = await runCodex(worktreePath, prompt, { ...args, outputRoot: mainRoot }, iteration, task);
  const nativeSession = findNewNativeSession(worktreePath, beforeNativeSessions);
  if (result.status !== 0) {
    return { task, ok: false, status: result.status, reason: `Codex exited ${result.status}`, branch, worktreePath, outputPath: result.outputPath, nativeSession };
  }

  commitAll(worktreePath, `queue: complete ${task.id} ${task.title.replace(new RegExp(`^${task.id}\\s+`), '').trim()}`.slice(0, 100), [
    `Task: ${task.title}`,
    '',
    'Committed automatically by codex-task-queue parallel worker.',
  ].join('\n'));

  return { task, ok: true, branch, worktreePath, outputPath: result.outputPath, nativeSession };
}

function printParallelDryRun(root, mode, maxParallel) {
  const paths = pathsFor(root, mode);
  const tasks = parseQueueTasks(readText(paths.queue));
  console.log(`# codex-task-queue parallel dry run\n`);
  console.log(`Max parallel: ${maxParallel}`);
  for (const task of tasks) {
    console.log(`- ${task.id}: ${task.status}; deps=${task.dependencyIds.join(',') || 'none'}; externalPrereqs=${task.hasNonTaskPrerequisites ? 'yes' : 'no'}; paths=${allowedPathKeys(task, mode).join(',')}`);
  }
}

async function runParallelQueue(args) {
  const root = args.cwd;
  applyRunCountDefault(args);
  const { paths, product, mode } = ensureRunnableProject(root, args);
  await ensureGitForRun(root, args);

  if (args.dryRun) {
    printParallelDryRun(root, mode, args.maxParallel);
    return;
  }
  if (!args.autoCommit) {
    fail('Parallel queue runs require automatic commits. Rerun without --no-commit, or use --no-parallel for serial execution on a main task branch.', 1);
  }
  const {
    runId,
    baseBranch,
    baseCommit,
    branchPrefix,
    mainBranch,
  } = createMainTaskBranch(root, { requireClean: true });
  const worktreeRoot = worktreeRootFor(root, runId);

  const state = {
    version: 1,
    mode,
    runId,
    baseBranch,
    baseCommit,
    mainBranch,
    branchPrefix,
    worktreeRoot,
    maxParallel: args.maxParallel,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tasks: {},
  };
  updateParallelState(root, state, 'parallel run started');
  appendRunLog(root, { task: null, status: 'parallel-start', note: `run ${runId}; main ${mainBranch}; max ${args.maxParallel}` });
  commitAll(root, `queue: start parallel run ${runId}`, `Base branch: ${baseBranch}\nBase commit: ${baseCommit}`);

  let completed = 0;
  let iteration = 0;
  const active = new Map();

  while (completed < args.max) {
    syncAutoReadyTasks(root, mode);
    const queueText = readText(paths.queue);
    const tasks = parseQueueTasks(queueText);
    const tasksById = new Map(tasks.map((task) => [task.id, task]));
    const statuses = taskStatusById(tasks);
    const runnable = tasks
      .filter((task) => !active.has(task.id))
      .filter((task) => isRunnableTask(task, statuses));

    for (const task of runnable) {
      if (active.size >= args.maxParallel || completed + active.size >= args.max) break;
      const activeTasks = [...active.values()].map((entry) => entry.task);
      const conflicting = activeTasks.find((activeTask) => taskPathConflict(task, activeTask, mode));
      if (conflicting) {
        appendRunLog(root, {
          task,
          status: 'path-overlap-serialized',
          note: `waiting for ${conflicting.id}; decoupling requires a narrow preprocessing task if this becomes a bottleneck`,
        });
        commitAll(root, `queue: record ${task.id} path overlap`);
        continue;
      }

      iteration += 1;
      updateQueueStatuses(root, mode, new Map([[task.id, 'RUNNING']]), `queue: mark ${task.id} running`);
      const promise = runParallelWorker(root, args, state, task, tasksById, iteration, { mode, productPath: product.filePath });
      active.set(task.id, { task, promise });
    }

    if (!active.size) {
      console.log('No runnable parallel tasks found. Queue is blocked or complete.');
      printExternalPrereqHint(externalPrereqBlockedTasks(tasks, statuses));
      updateParallelState(root, state, 'no runnable tasks');
      commitAll(root, 'queue: record parallel run idle');
      return;
    }

    const result = await Promise.race([...active.values()].map((entry) => entry.promise));
    active.delete(result.task.id);

    checkoutBranch(root, mainBranch);

    if (result.ok && !result.nativeSession && args.requireNativeSession) {
      result.ok = false;
      result.reason = 'No new Codex native session file detected';
    }

    if (!result.ok) {
      state.tasks[result.task.id] = {
        ...(state.tasks[result.task.id] || {}),
        status: 'BLOCKED',
        branch: result.branch || state.tasks[result.task.id]?.branch || null,
        worktree: result.worktreePath || state.tasks[result.task.id]?.worktree || null,
        blockedAt: new Date().toISOString(),
        reason: result.reason || `worker failed with ${result.status || 'unknown status'}`,
      };
      updateParallelState(root, state, `blocked ${result.task.id}`);
      appendRunLog(root, { task: result.task, status: 'blocked', outputPath: result.outputPath || '', note: state.tasks[result.task.id].reason });
      updateQueueStatuses(root, mode, new Map([[result.task.id, 'BLOCKED']]), `queue: block ${result.task.id}`);
      continue;
    }

    const merged = await mergeWithResolution(root, args, result.task, result.branch, root, iteration);
    if (!merged) {
      state.tasks[result.task.id] = {
        ...(state.tasks[result.task.id] || {}),
        status: 'BLOCKED',
        branch: result.branch,
        worktree: result.worktreePath,
        blockedAt: new Date().toISOString(),
        reason: `could not resolve merge conflict from ${result.branch}`,
      };
      updateParallelState(root, state, `merge blocked ${result.task.id}`);
      appendRunLog(root, { task: result.task, status: 'merge-blocked', outputPath: result.outputPath, note: state.tasks[result.task.id].reason });
      updateQueueStatuses(root, mode, new Map([[result.task.id, 'BLOCKED']]), `queue: block ${result.task.id}`);
      continue;
    }

    state.tasks[result.task.id] = {
      ...(state.tasks[result.task.id] || {}),
      status: 'DONE',
      branch: result.branch,
      worktree: result.worktreePath,
      completedAt: new Date().toISOString(),
    };
    updateParallelState(root, state, `completed ${result.task.id}`);
    appendRunLog(root, { task: result.task, status: 'completed', outputPath: result.outputPath, note: `branch ${result.branch}; worktree ${result.worktreePath}` });
    appendNativeSessionLog(root, {
      task: result.task,
      session: result.nativeSession,
      outputPath: result.outputPath,
      codexCommand: args.codexCommand,
      branch: result.branch,
      worktree: result.worktreePath,
    });
    updateQueueStatuses(root, mode, new Map([[result.task.id, 'DONE']]), `queue: mark ${result.task.id} done`);
    syncAutoReadyTasks(root, mode);
    removeWorktree(root, result.worktreePath);
    completed += 1;
  }

  console.log(`Reached max run count: ${args.max}`);
}

async function runSerialQueue(args) {
  const root = args.cwd;
  applyRunCountDefault(args);
  const { paths, product, mode } = ensureRunnableProject(root, args);
  await ensureGitForRun(root, args);
  let mainRun = null;
  if (!args.dryRun && args.autoCommit && isGitRepo(root)) {
    try {
      mainRun = createMainTaskBranch(root, { allowDirty: args.allowDirtyStart });
    } catch (error) {
      fail(error.message, 1);
    }
    console.log(`Created main task branch: ${mainRun.mainBranch}`);
    if (!mainRun.dirtyAtStart) {
      appendRunLog(root, { task: null, status: 'serial-start', note: `run ${mainRun.runId}; main ${mainRun.mainBranch}` });
      commitAll(root, `queue: start serial run ${mainRun.runId}`, `Base branch: ${mainRun.baseBranch}\nBase commit: ${mainRun.baseCommit}`);
    }
  }

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
      fail(`The same READY task is still first in queue: ${task.title}\nStopping to avoid an infinite loop. Check ${queueLabelFor(mode)} and the handoff.`, 1);
    }

    ensureCleanTaskStart(root, args, task);
    const prompt = buildTaskPrompt(root, task, { mode, productPath: product.filePath });
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
    const nativeRecorded = appendNativeSessionLog(root, {
      task,
      session: nativeSession,
      outputPath: result.outputPath,
      codexCommand: args.codexCommand,
      branch: mainRun?.mainBranch || currentBranch(root),
      worktree: root,
    });
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

async function runQueue(args) {
  if (args.parallel) {
    await runParallelQueue(args);
  } else {
    await runSerialQueue(args);
  }
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
