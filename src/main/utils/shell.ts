import { execSync } from 'child_process';

/**
 * 获取默认 shell，带回退逻辑
 *
 * Windows: pwsh.exe (PowerShell 7+) > powershell.exe (PowerShell 5.1) > cmd.exe
 * macOS: zsh
 * Linux: bash
 */
export function getDefaultShell(): string {
  if (process.platform === 'win32') {
    // 1. 优先检查 pwsh.exe（PowerShell 7+）
    try {
      execSync('where pwsh.exe', { stdio: 'ignore' });
      return 'pwsh.exe';
    } catch {
      // pwsh.exe 不存在，继续检查
    }

    // 2. 检查 powershell.exe（PowerShell 5.1）
    try {
      execSync('where powershell.exe', { stdio: 'ignore' });
      return 'powershell.exe';
    } catch {
      // powershell.exe 不存在，继续检查
    }

    // 3. 最后回退到 cmd.exe
    return 'cmd.exe';
  } else if (process.platform === 'darwin') {
    return 'zsh';
  } else {
    // Linux
    return 'bash';
  }
}
