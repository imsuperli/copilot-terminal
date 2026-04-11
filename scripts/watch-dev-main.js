const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.join(__dirname, '..');
const distMainPath = path.join(repoRoot, 'dist', 'main');
const distPreloadPath = path.join(repoRoot, 'dist', 'preload');
const readyMarkerPath = path.join(repoRoot, 'dist', '.dev-main-ready');
const readyLine = 'Found 0 errors. Watching for file changes.';

for (const target of [distMainPath, distPreloadPath, readyMarkerPath]) {
  fs.rmSync(target, { recursive: true, force: true });
}

fs.mkdirSync(path.dirname(readyMarkerPath), { recursive: true });

const tscEntrypoint = require.resolve('typescript/bin/tsc');
const tscProcess = spawn(
  process.execPath,
  [tscEntrypoint, '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'],
  {
    cwd: repoRoot,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  },
);

let didMarkReady = false;

const markReady = () => {
  if (didMarkReady) {
    return;
  }

  didMarkReady = true;
  fs.writeFileSync(readyMarkerPath, `${new Date().toISOString()}\n`, 'utf8');
  process.stdout.write(`[dev-main] Initial TypeScript build ready: ${readyMarkerPath}\n`);
};

const cleanupReadyMarker = () => {
  fs.rmSync(readyMarkerPath, { force: true });
};

const forwardStream = (stream, writer) => {
  let buffered = '';

  stream.on('data', (chunk) => {
    buffered += chunk.toString();

    const lines = buffered.split(/\r?\n/);
    buffered = lines.pop() ?? '';

    for (const line of lines) {
      writer.write(`${line}\n`);

      if (line.includes(readyLine)) {
        markReady();
      }
    }
  });

  stream.on('end', () => {
    if (!buffered) {
      return;
    }

    writer.write(buffered);

    if (buffered.includes(readyLine)) {
      markReady();
    }
  });
};

forwardStream(tscProcess.stdout, process.stdout);
forwardStream(tscProcess.stderr, process.stderr);

const shutdown = (signal) => {
  cleanupReadyMarker();

  if (!tscProcess.killed) {
    tscProcess.kill(signal);
  }
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

tscProcess.on('exit', (code, signal) => {
  cleanupReadyMarker();

  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
