import { execFileSync } from 'child_process';
import { platform } from 'os';

/**
 * 获取最新的系统环境变量
 *
 * Windows: 从注册表读取最新的用户和系统环境变量
 * macOS/Linux: 使用 process.env（这些平台的环境变量继承机制不同）
 *
 * @returns 合并后的环境变量对象
 */
export function getLatestEnvironmentVariables(): NodeJS.ProcessEnv {
  if (platform() === 'win32') {
    return getWindowsEnvironmentVariables();
  }

  // macOS 和 Linux 直接使用 process.env
  // 这些平台的环境变量通常在登录时设置，不会像 Windows 那样动态更新
  return process.env;
}

/**
 * Windows: 从注册表读取最新的环境变量，并与 process.env 合并
 *
 * 策略：
 * 1. 以 process.env 为基础（确保所有系统关键变量都存在）
 * 2. 从注册表读取用户和系统环境变量
 * 3. 用注册表中的值覆盖 process.env 中的同名变量（获取最新值）
 * 4. 特殊处理 PATH：合并系统 PATH 和用户 PATH
 *
 * 这样既能获取最新的环境变量，又不会丢失关键的系统变量
 */
function getWindowsEnvironmentVariables(): NodeJS.ProcessEnv {
  try {
    // 1. 从 process.env 开始（确保所有关键系统变量都存在）
    const env: NodeJS.ProcessEnv = { ...process.env };

    // 2. 使用 PowerShell/.NET 读取注册表，避免 reg query 在非 UTF-8 代码页下产生 mojibake
    const registryEnv = readWindowsRegistryEnvironment();
    const systemEnv = materializeRegistryEnvironment(registryEnv.system ?? {}, env);
    const userEnv = materializeRegistryEnvironment(registryEnv.user ?? {}, {
      ...env,
      ...systemEnv,
    });

    // 4. 用注册表中的值覆盖 process.env（获取最新值）
    // 但排除 PATH，因为 PATH 需要特殊处理
    for (const [key, value] of Object.entries(systemEnv)) {
      if (key.toUpperCase() !== 'PATH') {
        env[key] = value;
      }
    }

    for (const [key, value] of Object.entries(userEnv)) {
      if (key.toUpperCase() !== 'PATH') {
        env[key] = value;
      }
    }

    // 5. 特殊处理 PATH：合并系统 PATH + 用户 PATH
    const systemPath = systemEnv.Path || systemEnv.PATH || '';
    const userPath = userEnv.Path || userEnv.PATH || '';

    if (systemPath || userPath) {
      // 合并注册表中的 PATH
      const registryPath = [systemPath, userPath].filter(Boolean).join(';');

      // 使用注册表中的 PATH（最新值）
      env.PATH = registryPath;
      env.Path = registryPath;
    }
    // 如果注册表中没有 PATH，保留 process.env 中的 PATH

    return env;
  } catch (error) {
    console.error('[Environment] Failed to read registry environment variables:', error);
    // 出错时回退到 process.env
    return process.env;
  }
}

interface RegistryValueRecord {
  type?: string;
  value?: string;
}

interface RegistryEnvironmentPayload {
  system?: Record<string, RegistryValueRecord>;
  user?: Record<string, RegistryValueRecord>;
}

/**
 * 从 Windows 注册表读取环境变量
 *
 * 通过 powershell.exe + .NET Registry API 读取，避免 reg.exe 输出依赖当前代码页。
 */
function readWindowsRegistryEnvironment(): RegistryEnvironmentPayload {
  const command = [
    '$utf8NoBom = New-Object System.Text.UTF8Encoding($false)',
    '$OutputEncoding = [Console]::OutputEncoding = $utf8NoBom',
    'function Get-RegistryEnv([Microsoft.Win32.RegistryHive]$Hive, [string]$SubKey) {',
    '  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($Hive, [Microsoft.Win32.RegistryView]::Default)',
    '  $key = $base.OpenSubKey($SubKey)',
    '  $result = @{}',
    '  if ($null -eq $key) {',
    '    $base.Close()',
    '    return $result',
    '  }',
    '  foreach ($name in $key.GetValueNames()) {',
    '    $value = $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)',
    '    if ($null -eq $value) { continue }',
    '    $result[$name] = @{ type = $key.GetValueKind($name).ToString(); value = [string]$value }',
    '  }',
    '  $key.Close()',
    '  $base.Close()',
    '  return $result',
    '}',
    "$payload = @{ system = Get-RegistryEnv ([Microsoft.Win32.RegistryHive]::LocalMachine) 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'; user = Get-RegistryEnv ([Microsoft.Win32.RegistryHive]::CurrentUser) 'Environment' }",
    '$payload | ConvertTo-Json -Compress -Depth 4',
  ].join('; ');

  const output = execFileSync(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    },
  );

  return JSON.parse(output) as RegistryEnvironmentPayload;
}

function materializeRegistryEnvironment(
  registryEnv: Record<string, RegistryValueRecord>,
  baseEnv: NodeJS.ProcessEnv,
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [name, record] of Object.entries(registryEnv)) {
    if (!record || typeof record.value !== 'string') {
      continue;
    }

    if (record.type === 'ExpandString') {
      env[name] = expandEnvironmentVariables(record.value, { ...baseEnv, ...env });
    } else {
      env[name] = record.value;
    }
  }

  return env;
}

/**
 * 展开环境变量引用（如 %USERPROFILE%\AppData）
 *
 * @param value 包含 %变量% 的字符串
 * @param env 当前环境变量上下文
 * @returns 展开后的字符串
 */
function expandEnvironmentVariables(value: string, env: Record<string, string | undefined>): string {
  return value.replace(/%([^%]+)%/g, (match, varName) => {
    // 优先使用当前上下文中的变量
    if (env[varName]) {
      return env[varName];
    }
    // 回退到 process.env
    if (process.env[varName]) {
      return process.env[varName];
    }
    // 无法展开，保留原样
    return match;
  });
}
