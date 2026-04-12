import path from 'path';
import type { PluginRuntime } from '../../../../shared/types/plugin';
import type { LanguageRuntimeAdapter, RuntimeSpawnContext, SpawnedRuntimeProcess } from './shared';
import {
  buildRuntimeEnvironment,
  findExecutableOnPath,
  resolvePluginPath,
  resolveRuntimeArgs,
  resolveRuntimeCwd,
  spawnRuntimeProcess,
} from './shared';

export class JavaRuntimeAdapter implements LanguageRuntimeAdapter {
  supports(runtime: PluginRuntime): boolean {
    return runtime.type === 'java';
  }

  async spawn(runtime: PluginRuntime, context: RuntimeSpawnContext): Promise<SpawnedRuntimeProcess> {
    const env = buildRuntimeEnvironment(runtime, context);
    const command = resolveJavaExecutable(context.settings, env);
    const entryPath = resolvePluginPath(runtime.entry, context.pluginInstallPath);
    const args = entryPath.toLowerCase().endsWith('.jar')
      ? ['-jar', entryPath, ...resolveRuntimeArgs(runtime, context)]
      : [entryPath, ...resolveRuntimeArgs(runtime, context)];

    return spawnRuntimeProcess(command, args, {
      cwd: resolveRuntimeCwd(runtime, context),
      env,
    });
  }
}

function resolveJavaExecutable(settings: Record<string, unknown>, env: NodeJS.ProcessEnv): string {
  const javaHome = typeof settings['java.home'] === 'string'
    ? settings['java.home']
    : typeof settings.javaHome === 'string'
      ? settings.javaHome
      : null;

  if (javaHome) {
    const candidatePath = path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    return candidatePath;
  }

  return findExecutableOnPath('java', env) ?? 'java';
}
