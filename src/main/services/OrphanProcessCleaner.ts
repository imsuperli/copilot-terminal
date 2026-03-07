import { execSync } from 'child_process';
import { platform } from 'os';

/**
 * OrphanProcessCleaner - 孤儿进程清理服务
 *
 * 定期扫描并清理可能泄漏的孤儿进程（bash.exe, cygpath.exe 等）
 * 这些进程通常是由短生命周期的工具（如 ccstatusline）启动但未正确清理的
 */
export class OrphanProcessCleaner {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private knownPtyPids = new Set<number>();

  /**
   * 启动清理服务
   * @param intervalMs 清理间隔（毫秒），默认 30 秒
   */
  start(intervalMs: number = 30000): void {
    if (this.isRunning) {
      console.log('[OrphanProcessCleaner] Already running');
      return;
    }

    if (platform() !== 'win32') {
      console.log('[OrphanProcessCleaner] Only supported on Windows');
      return;
    }

    this.isRunning = true;
    console.log(`[OrphanProcessCleaner] Starting with interval ${intervalMs}ms`);

    // 立即执行一次清理
    this.cleanup();

    // 定期清理
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }

  /**
   * 停止清理服务
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.isRunning = false;
    console.log('[OrphanProcessCleaner] Stopped');
  }

  /**
   * 注册 PTY 进程 PID（用于识别合法进程）
   */
  registerPtyPid(pid: number): void {
    this.knownPtyPids.add(pid);
  }

  /**
   * 注销 PTY 进程 PID
   */
  unregisterPtyPid(pid: number): void {
    this.knownPtyPids.delete(pid);
  }

  /**
   * 执行清理操作
   */
  private cleanup(): void {
    try {
      const orphanProcesses = this.findOrphanProcesses();

      if (orphanProcesses.length === 0) {
        return;
      }

      console.log(`[OrphanProcessCleaner] Found ${orphanProcesses.length} orphan processes`);

      for (const proc of orphanProcesses) {
        this.killProcess(proc.pid, proc.name);
      }
    } catch (error) {
      console.error('[OrphanProcessCleaner] Cleanup error:', error);
    }
  }

  /**
   * 查找孤儿进程
   */
  private findOrphanProcesses(): Array<{ pid: number; name: string; parentPid: number }> {
    try {
      // 查询所有可疑进程（bash.exe, cygpath.exe, sh.exe, git.exe）
      const suspiciousProcessNames = ['bash.exe', 'cygpath.exe', 'sh.exe'];

      const orphans: Array<{ pid: number; name: string; parentPid: number }> = [];

      for (const processName of suspiciousProcessNames) {
        const processes = this.getProcessesByName(processName);

        for (const proc of processes) {
          // 检查是否是孤儿进程
          if (this.isOrphanProcess(proc.pid, proc.parentPid)) {
            orphans.push(proc);
          }
        }
      }

      return orphans;
    } catch (error) {
      console.error('[OrphanProcessCleaner] Error finding orphan processes:', error);
      return [];
    }
  }

  /**
   * 获取指定名称的所有进程
   */
  private getProcessesByName(processName: string): Array<{ pid: number; name: string; parentPid: number }> {
    try {
      const output = execSync(
        `wmic process where "name='${processName}'" get ProcessId,ParentProcessId,Name /format:csv`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      );

      const lines = output.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('Node'));
      const processes: Array<{ pid: number; name: string; parentPid: number }> = [];

      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length >= 4) {
          const name = parts[1]?.trim();
          const parentPid = parseInt(parts[2]?.trim() || '0', 10);
          const pid = parseInt(parts[3]?.trim() || '0', 10);

          if (name && !isNaN(pid) && !isNaN(parentPid) && pid > 0) {
            processes.push({ pid, name, parentPid });
          }
        }
      }

      return processes;
    } catch (error) {
      return [];
    }
  }

  /**
   * 判断是否是孤儿进程
   */
  private isOrphanProcess(pid: number, parentPid: number): boolean {
    // 1. 检查父进程是否存在
    if (!this.isProcessAlive(parentPid)) {
      return true; // 父进程已死，这是孤儿进程
    }

    // 2. 检查父进程是否是我们的 PTY 进程树的一部分
    if (this.isInPtyProcessTree(parentPid)) {
      return false; // 父进程是合法的 PTY 进程树的一部分
    }

    // 3. 检查进程的运行时间（如果运行时间很短，可能是正常的临时进程）
    const uptimeSeconds = this.getProcessUptimeSeconds(pid);
    if (uptimeSeconds < 5) {
      return false; // 运行时间少于 5 秒，可能是正常进程
    }

    // 4. 检查 CPU 使用率（如果 CPU 使用率很高，可能是泄漏的进程）
    // 注意：这个检查比较昂贵，暂时跳过

    return true; // 默认认为是孤儿进程
  }

  /**
   * 检查进程是否存活
   */
  private isProcessAlive(pid: number): boolean {
    try {
      execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 检查进程是否在 PTY 进程树中
   */
  private isInPtyProcessTree(pid: number): boolean {
    // 递归向上查找父进程，直到找到 PTY 进程或到达根进程
    let currentPid = pid;
    const visited = new Set<number>();

    while (currentPid > 0 && !visited.has(currentPid)) {
      visited.add(currentPid);

      // 检查是否是已知的 PTY 进程
      if (this.knownPtyPids.has(currentPid)) {
        return true;
      }

      // 获取父进程 PID
      const parentPid = this.getParentPid(currentPid);
      if (parentPid === 0 || parentPid === currentPid) {
        break; // 到达根进程或循环
      }

      currentPid = parentPid;
    }

    return false;
  }

  /**
   * 获取父进程 PID
   */
  private getParentPid(pid: number): number {
    try {
      const output = execSync(
        `wmic process where "ProcessId=${pid}" get ParentProcessId /format:csv`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      );

      const lines = output.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('Node'));
      if (lines.length > 0) {
        const parts = lines[0].split(',');
        if (parts.length >= 2) {
          const parentPid = parseInt(parts[1]?.trim() || '0', 10);
          return isNaN(parentPid) ? 0 : parentPid;
        }
      }
    } catch {
      // Ignore
    }
    return 0;
  }

  /**
   * 获取进程运行时间（秒）
   */
  private getProcessUptimeSeconds(pid: number): number {
    try {
      const output = execSync(
        `wmic process where "ProcessId=${pid}" get CreationDate /format:csv`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      );

      const lines = output.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('Node'));
      if (lines.length > 0) {
        const parts = lines[0].split(',');
        if (parts.length >= 2) {
          const creationDate = parts[1]?.trim();
          if (creationDate) {
            // CreationDate 格式: 20240307123456.123456+480
            const year = parseInt(creationDate.substring(0, 4), 10);
            const month = parseInt(creationDate.substring(4, 6), 10) - 1;
            const day = parseInt(creationDate.substring(6, 8), 10);
            const hour = parseInt(creationDate.substring(8, 10), 10);
            const minute = parseInt(creationDate.substring(10, 12), 10);
            const second = parseInt(creationDate.substring(12, 14), 10);

            const creationTime = new Date(year, month, day, hour, minute, second).getTime();
            const now = Date.now();
            return Math.floor((now - creationTime) / 1000);
          }
        }
      }
    } catch {
      // Ignore
    }
    return 0;
  }

  /**
   * 终止进程
   */
  private killProcess(pid: number, name: string): void {
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      console.log(`[OrphanProcessCleaner] Killed orphan process: ${name} (PID ${pid})`);
    } catch (error) {
      console.log(`[OrphanProcessCleaner] Failed to kill process ${pid}: already exited`);
    }
  }
}
