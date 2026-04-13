import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';

describe('official.java-jdtls proxy', () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirectories.map(async (directoryPath) => {
      await fs.remove(directoryPath);
    }));
    tempDirectories.length = 0;
  });

  it.each([
    ['java home directory', (javaHomePath: string) => javaHomePath],
    ['java bin directory', (javaHomePath: string) => path.join(javaHomePath, 'bin')],
    ['java executable path', (javaHomePath: string) => path.join(javaHomePath, 'bin', 'java')],
  ])('uses the configured JDK 21 runtime when java.home is a %s', async (_label, resolveJavaHome) => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-terminal-java-proxy-'));
    tempDirectories.push(tempDir);

    const oldJavaHomePath = path.join(tempDir, 'jdk-8');
    const newJavaHomePath = path.join(tempDir, 'jdk-21');
    await writeFakeJavaExecutable(oldJavaHomePath, 8, 'JAVA_8_RUNTIME');
    await writeFakeJavaExecutable(newJavaHomePath, 21, 'JAVA_21_RUNTIME');

    const launcherJarPath = path.join(tempDir, 'launcher.jar');
    await fs.writeFile(launcherJarPath, 'fake-launcher', { mode: 0o755 });
    await fs.chmod(launcherJarPath, 0o755);

    const proxyPath = path.join(
      process.cwd(),
      'plugin-marketplace',
      'plugins',
      'official.java-jdtls',
      'bin',
      'jdtls-proxy.cjs',
    );

    const result = await runProxy(proxyPath, {
      PATH: `${path.join(oldJavaHomePath, 'bin')}${path.delimiter}${process.env.PATH ?? ''}`,
      JAVA_HOME: oldJavaHomePath,
      COPILOT_TERMINAL_PROJECT_ROOT: tempDir,
      COPILOT_TERMINAL_WORKSPACE_STORAGE: path.join(tempDir, 'workspace-storage'),
      COPILOT_TERMINAL_PLUGIN_SETTINGS: JSON.stringify({
        'java.home': resolveJavaHome(newJavaHomePath),
        'jdtls.command': launcherJarPath,
      }),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('JAVA_21_RUNTIME');
    expect(result.stdout).not.toContain('JAVA_8_RUNTIME');
    expect(result.stderr).toBe('');
  });
});

async function writeFakeJavaExecutable(
  javaHomePath: string,
  majorVersion: number,
  marker: string,
): Promise<void> {
  const binDirectoryPath = path.join(javaHomePath, 'bin');
  await fs.ensureDir(binDirectoryPath);

  const executablePath = path.join(binDirectoryPath, 'java');
  await fs.writeFile(executablePath, `#!/usr/bin/env sh
if [ "$1" = "-version" ]; then
  echo "openjdk version \\"${majorVersion}.0.1\\"" >&2
  exit 0
fi
echo "${marker}"
exit 0
`, { mode: 0o755 });
  await fs.chmod(executablePath, 0o755);
}

async function runProxy(
  proxyPath: string,
  envOverrides: NodeJS.ProcessEnv,
): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}> {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [proxyPath], {
      env: {
        ...process.env,
        ...envOverrides,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', reject);
    child.on('exit', (exitCode) => {
      resolve({
        exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}
