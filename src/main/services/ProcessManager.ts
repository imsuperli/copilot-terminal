import { EventEmitter } from 'events';
import { platform, tmpdir } from 'os';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import * as path from 'path';
import { IProcessManager, TerminalConfig, ProcessHandle, ProcessInfo, ProcessStatus } from '../types/process';
import { Settings } from '../types/workspace';
import { StatusDetectorImpl, IStatusDetector } from './StatusDetector';
import { WindowStatus } from '../../shared/types/window';
import { getLatestEnvironmentVariables } from '../utils/environment';
import { ITmuxCompatService, TmuxPaneId } from '../../shared/types/tmux';
import { getTmuxShimDir } from '../utils/tmux-shim-path';
import { resolveShellProgram } from '../utils/shell';

type PaneHistoryEntry = {
  seq: number;
  data: string;
};

type PaneHistoryBuffer = {
  entries: PaneHistoryEntry[];
  totalLength: number;
  nextSeq: number;
  lastSeq: number;
};

// 灏濊瘯瀵煎叆 node-pty锛屽鏋滃け璐ュ垯浣跨敤 mock
let pty: any;
try {
  pty = require('node-pty');
} catch {
  pty = null;
}

/**
 * ProcessManager - 缁堢杩涚▼绠＄悊鏈嶅姟
 * 
 * 璐熻矗鍒涘缓銆佺洃鎺у拰缁堟缁堢杩涚▼
 * 浣跨敤 node-pty 杩涜璺ㄥ钩鍙?PTY 杩涚▼绠＄悊
 * 
 * NOTE: 褰撳墠瀹炵幇浣跨敤 mock PTY锛屽緟 node-pty 缂栬瘧鐜灏辩华鍚庢浛鎹负鐪熷疄瀹炵幇
 */
export class ProcessManager extends EventEmitter implements IProcessManager {
  private processes: Map<number, ProcessInfo>;
  private ptys: Map<number, any>;
  private ptyDisposables: Map<number, Array<{ dispose: () => void }>>;
  private processCleanupTimers: Map<number, NodeJS.Timeout>;
  private ptyOutputBuffers: Map<number, string[]>; // 缂撳瓨 PTY 鍒濆杈撳嚭
  private paneHistoryBuffers: Map<string, PaneHistoryBuffer>;
  private paneIndex: Map<string, number>; // "windowId:paneId" 鈫?pid 绱㈠紩锛岀敤浜?O(1) 鏌ユ壘
  private nextPid: number;
  private statusDetector: IStatusDetector;
  private cachedSpawnEnv: NodeJS.ProcessEnv | null;
  private cachedSpawnEnvAt: number;
  private readonly SPAWN_ENV_CACHE_TTL_MS = 30000;
  private readonly PANE_HISTORY_CHUNK_LIMIT = 2000;
  private readonly PANE_HISTORY_CHAR_LIMIT = 2_000_000;
  private readonly getSettings: (() => Settings | null | undefined) | null;
  private tmuxCompatService: ITmuxCompatService | null;
  private conPtyWarmupPromise: Promise<void> | null;
  private conPtyWarmupCompleted: boolean;

  constructor(getSettings?: () => Settings | null | undefined, tmuxCompatService?: ITmuxCompatService) {
    super();
    this.processes = new Map();
    this.ptys = new Map();
    this.ptyDisposables = new Map();
    this.processCleanupTimers = new Map();
    this.ptyOutputBuffers = new Map();
    this.paneHistoryBuffers = new Map();
    this.paneIndex = new Map();
    this.nextPid = 1000;  // Start from 1000 for mock PIDs
    this.statusDetector = new StatusDetectorImpl();
    this.cachedSpawnEnv = null;
    this.cachedSpawnEnvAt = 0;
    this.getSettings = getSettings ?? null;
    this.tmuxCompatService = tmuxCompatService ?? null;
    this.conPtyWarmupPromise = null;
    this.conPtyWarmupCompleted = false;
    // ??????? StatusDetector ??????? StatusPoller ??????
  }

  /**
   * 璁剧疆 TmuxCompatService锛堣В鍐冲惊鐜緷璧栵細ProcessManager 鍜?TmuxCompatService 浜掔浉寮曠敤锛?
   */
  setTmuxCompatService(service: ITmuxCompatService): void {
    this.tmuxCompatService = service;
  }

  async warmupConPtyDll(): Promise<void> {
    if (this.conPtyWarmupCompleted) {
      return;
    }

    if (this.conPtyWarmupPromise) {
      return this.conPtyWarmupPromise;
    }

    this.conPtyWarmupPromise = this.performConPtyDllWarmup().finally(() => {
      this.conPtyWarmupCompleted = true;
      this.conPtyWarmupPromise = null;
    });

    return this.conPtyWarmupPromise;
  }

  private async performConPtyDllWarmup(): Promise<void> {
    if (platform() !== 'win32' || !pty) {
      return;
    }

    if (!this.shouldUseBundledConptyDll()) {
      console.log('[ProcessManager] Skipping ConPTY DLL warmup because bundled conpty.dll is disabled');
      return;
    }

    const warmupStartAt = Date.now();
    console.log('[ProcessManager] Starting ConPTY DLL warmup...');

    try {
      const dummyPty = pty.spawn('cmd.exe', ['/c', 'exit'], {
        name: 'xterm-256color',
        cols: 80,
        rows: 30,
        cwd: process.cwd(),
        env: process.env,
        useConpty: true,
        useConptyDll: true,
      });

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          try {
            dummyPty.kill();
          } catch {}
          resolve();
        }, 1000);

        const disposable = dummyPty.onExit?.(() => {
          clearTimeout(timeout);
          resolve();
        });

        if (!disposable) {
          clearTimeout(timeout);
          setTimeout(resolve, 100);
        }
      });

      console.log(`[ProcessManager] ConPTY DLL warmup completed in ${Date.now() - warmupStartAt}ms`);
    } catch (error) {
      console.error('[ProcessManager] ConPTY DLL warmup failed:', error);
    }
  }

  /**
   * ????????
   */

  async spawnTerminal(config: TerminalConfig): Promise<ProcessHandle> {
    // Validate working directory
    if (!existsSync(config.workingDirectory)) {
      throw new Error(`Working directory does not exist: ${config.workingDirectory}`);
    }

    // Resolve the executable and args that will actually be passed to node-pty.
    const launchCommand = this.resolveLaunchCommand(config);

    await this.ensureTmuxRpcServer(config);


    // 鍒涘缓 PTY 杩涚▼锛堢湡瀹炴垨 mock锛?
    let ptyProcess: any;
    let pid: number;

    if (pty) {
      // 浣跨敤鐪熷疄鐨?node-pty
      ptyProcess = this.createRealPty(config, launchCommand.file, launchCommand.args);
      pid = ptyProcess.pid;
    } else {
      // 浣跨敤 mock PTY
      pid = this.nextPid++;
      ptyProcess = this.createMockPty(pid, config);
    }

    // Store process info
    const processInfo: ProcessInfo = {
      pid,
      status: ProcessStatus.Alive,
      workingDirectory: config.workingDirectory,
      command: launchCommand.command,
      windowId: config.windowId,
      paneId: config.paneId,
    };
    this.processes.set(pid, processInfo);
    this.ptys.set(pid, ptyProcess);

    // 缁存姢 paneIndex 绱㈠紩锛岀敤浜?O(1) 鏌ユ壘
    const paneKey = this.getPaneKey(config.windowId, config.paneId);
    this.paneIndex.set(paneKey, pid);

    // 鍒濆鍖栬緭鍑虹紦鍐插尯锛岀敤浜庣紦瀛樻棭鏈熻緭鍑猴紙閬垮厤绔炴€佹潯浠跺鑷存暟鎹涪澶憋級
    this.ptyOutputBuffers.set(pid, []);
    this.resetPaneHistory(config.paneId);

    // Start tracking this PID before registering listeners (avoids race condition)
    this.statusDetector.trackPid(pid);

    // 绔嬪嵆寮€濮嬬紦瀛?PTY 杈撳嚭锛堝湪浠讳綍璁㈤槄涔嬪墠锛?
    const bufferDisposable = ptyProcess.onData((data: string) => {
      const buffer = this.ptyOutputBuffers.get(pid);
      if (buffer) {
        buffer.push(data);
        // 闄愬埗缂撳啿鍖哄ぇ灏忥紝閬垮厤鍐呭瓨娉勬紡锛堝鍔犲埌 500 鏉℃秷鎭紝瑕嗙洊鏇村鍚姩杈撳嚭锛?
        if (buffer.length > 500) {
          buffer.shift();
        }
      }

      this.appendPaneHistory(config.paneId, data);
    });

    // Register PTY listeners for status detection and save disposables
    const disposables: Array<{ dispose: () => void }> = [];

    // 淇濆瓨缂撳啿鍖虹洃鍚櫒
    if (bufferDisposable && typeof bufferDisposable.dispose === 'function') {
      disposables.push(bufferDisposable);
    }

    const onDataDisposable = ptyProcess.onData((data: string) => {
      this.statusDetector.onPtyData(pid, data);
    });
    if (onDataDisposable && typeof onDataDisposable.dispose === 'function') {
      disposables.push(onDataDisposable);
    }

    const onExitDisposable = ptyProcess.onExit((event: { exitCode: number; signal?: number } | number) => {
      const exitCode = typeof event === 'number' ? event : event?.exitCode ?? 0;
      this.finalizeProcessExit(pid, exitCode);
    });
    if (onExitDisposable && typeof onExitDisposable.dispose === 'function') {
      disposables.push(onExitDisposable);
    }

    // Save disposables for cleanup
    this.ptyDisposables.set(pid, disposables);

    // Emit process-created event
    this.emit('process-created', processInfo);

    return {
      pid,
      pty: ptyProcess,
    };
  }

  /**
   * 缁堟鎸囧畾杩涚▼
   */
  async killProcess(pid: number): Promise<void> {
    const processInfo = this.processes.get(pid);
    if (!processInfo) {
      throw new Error(`Process not found: ${pid}`);
    }

    if (processInfo.status === ProcessStatus.Exited) {
      throw new Error(`Process already exited: ${pid}`);
    }

    this.disposePtyDisposables(pid);

    // 瀹為檯缁堟 PTY 杩涚▼
    const ptyProcess = this.ptys.get(pid);
    if (ptyProcess && typeof ptyProcess.kill === 'function') {
      try {
        if (platform() === 'win32') {
          // Windows: 浣跨敤 taskkill 寮哄埗缁堟杩涚▼鏍?
          this.killProcessTreeWindows(pid);
        } else {
          // Unix: 浣跨敤 SIGTERM 淇″彿娓╁拰鍦扮粓姝㈣繘绋?
          ptyProcess.kill('SIGTERM');
        }
      } catch (error) {
        // 蹇界暐閿欒锛屽洜涓鸿繘绋嬪彲鑳藉凡缁忛€€鍑?
        if (process.env.NODE_ENV === 'development') {
          console.log(`PTY process ${pid} already exited or kill failed`);
        }
      }
    }

    this.finalizeProcessExit(pid, 0);
  }

  /**
   * 鑾峰彇杩涚▼鐘舵€?
   */
  getProcessStatus(pid: number): ProcessInfo | null {
    return this.processes.get(pid) || null;
  }

  /**
   * 鍒楀嚭鎵€鏈夎繘绋?
   */
  listProcesses(): ProcessInfo[] {
    return Array.from(this.processes.values());
  }

  /**
   * 閫氳繃 windowId 鍜?paneId 鏌ユ壘 PID锛圤(1) 鏌ユ壘锛?
   *
   * @returns PID 鎴?null锛堝鏋滄湭鎵惧埌锛?
   */
  getPidByPane(windowId: string, paneId?: string): number | null {
    const paneKey = this.getPaneKey(windowId, paneId);
    return this.paneIndex.get(paneKey) ?? null;
  }

  /**
   * 鐢熸垚 paneIndex 鐨?key
   */
  private getPaneKey(windowId: string | undefined, paneId: string | undefined): string {
    return `${windowId ?? ''}:${paneId ?? ''}`;
  }

  /**
   * 鑾峰彇绐楁牸鐘舵€侊紙閫氳繃 windowId 鍜?paneId锛?
   */
  async getPaneStatus(windowId: string, paneId: string): Promise<WindowStatus> {
    const processInfo = Array.from(this.processes.values()).find(
      p => p.windowId === windowId && p.paneId === paneId
    );
    if (!processInfo) {
      throw new Error(`Pane not found: ${windowId}/${paneId}`);
    }
    return this.statusDetector.detectStatus(processInfo.pid);
  }

  /**
   * 鑾峰彇 StatusDetector 瀹炰緥锛堜緵 StatusPoller 浣跨敤锛?
   */
  getStatusDetector(): IStatusDetector {
    return this.statusDetector;
  }

  /**
   * 璁㈤槄鐘舵€佸彉鍖栦簨浠讹紝杩斿洖鍙栨秷璁㈤槄鍑芥暟
   */
  subscribeStatusChange(callback: (pid: number, status: WindowStatus) => void): () => void {
    return this.statusDetector.subscribeStatusChange(callback);
  }

  /**
   * 鍚?PTY 鍐欏叆鏁版嵁锛堢敤鎴疯緭鍏ワ級
   */
  writeToPty(pid: number, data: string): void {
    const processInfo = this.processes.get(pid);
    if (!processInfo || processInfo.status === ProcessStatus.Exited) {
      return;
    }

    const pty = this.ptys.get(pid);
    if (pty) {
      // Windows 剪贴板换行符为 \r\n，直接写入 PTY 会导致双重换行，统一转为 \r
      pty.write(data.replace(/\r\n/g, '\r'));
    }
  }

  /**
   * 璋冩暣 PTY 澶у皬
   */
  resizePty(pid: number, cols: number, rows: number): void {
    const processInfo = this.processes.get(pid);
    if (!processInfo || processInfo.status === ProcessStatus.Exited) {
      return;
    }

    const pty = this.ptys.get(pid);
    if (pty) {
      try {
        pty.resize(cols, rows);
      } catch (error) {
        // Window teardown can race with a final resize after the PTY has exited.
        if (this.isExitedPtyResizeError(error)) {
          this.finalizeProcessExit(pid, processInfo.exitCode ?? 0);
          return;
        }
        throw error;
      }
    }
  }

  /**
   * 璁㈤槄 PTY 鏁版嵁杈撳嚭锛岃繑鍥炲彇娑堣闃呭嚱鏁?
   *
   * 娉ㄦ剰锛氶娆¤闃呮椂浼氬厛鍙戦€佺紦瀛樼殑鍒濆杈撳嚭锛岄伩鍏嶇珵鎬佹潯浠跺鑷存暟鎹涪澶?
   */
  subscribePtyData(pid: number, callback: (data: string) => void): () => void {
    const pty = this.ptys.get(pid);
    if (!pty) return () => {};

    // 鍖呰鍥炶皟锛屾坊鍔犻敊璇鐞嗭紝闃叉鍥炶皟寮傚父涓柇 PTY 鏁版嵁娴?
    const safeCallback = (data: string) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[ProcessManager] PTY data callback error for pid ${pid}:`, error);
        // 涓嶈璁╅敊璇腑鏂?PTY 鏁版嵁娴?
      }
    };

    // 鍏堝彂閫佺紦瀛樼殑鍒濆杈撳嚭锛堝鏋滄湁锛?
    const buffer = this.ptyOutputBuffers.get(pid);
    if (buffer && buffer.length > 0) {
      // 浣跨敤 setImmediate 寮傛鍙戦€侊紝閬垮厤闃诲
      setImmediate(() => {
        for (const data of buffer) {
          safeCallback(data);
        }
      });
      // 娓呯┖缂撳啿鍖猴紝閬垮厤閲嶅鍙戦€?
      this.ptyOutputBuffers.delete(pid);
    }

    // node-pty 鐨?onData 杩斿洖涓€涓?disposable 瀵硅薄
    const disposable = pty.onData(safeCallback);

    // 杩斿洖娓呯悊鍑芥暟
    return () => {
      if (disposable && typeof disposable.dispose === 'function') {
        disposable.dispose();
      }
    };
  }

  /**
   * 妫€鏌?PTY 杈撳嚭缂撳啿鍖烘槸鍚︽湁鏁版嵁锛堢敤浜庡垽鏂?PTY 鏄惁宸茶緭鍑哄垵濮嬪寲淇℃伅锛?
   */
  hasPtyOutput(pid: number): boolean {
    const buffer = this.ptyOutputBuffers.get(pid);
    return buffer ? buffer.length > 0 : false;
  }

  getPtyHistory(paneId: string): { chunks: string[]; lastSeq: number } {
    const history = this.paneHistoryBuffers.get(paneId);
    if (!history) {
      return {
        chunks: [],
        lastSeq: 0,
      };
    }

    return {
      chunks: history.entries.map((entry) => entry.data),
      lastSeq: history.lastSeq,
    };
  }

  clearPtyHistory(paneId: string): void {
    this.paneHistoryBuffers.delete(paneId);
  }

  getLatestPaneOutputSeq(paneId: string): number {
    return this.paneHistoryBuffers.get(paneId)?.lastSeq ?? 0;
  }

  /**
   * 閿€姣?ProcessManager锛岄噴鏀捐祫婧?
   */
  async destroy(progressCallback?: (current: number, total: number) => void): Promise<void> {
    console.log('[ProcessManager] Starting destroy...');

    // 鍏堝仠姝㈢姸鎬佹娴嬪櫒锛岄伩鍏嶅湪娓呯悊杩囩▼涓Е鍙戞娴?
    this.statusDetector.destroy();

    for (const cleanupTimer of this.processCleanupTimers.values()) {
      clearTimeout(cleanupTimer);
    }
    this.processCleanupTimers.clear();

    // 娓呯悊鎵€鏈?PTY 浜嬩欢鐩戝惉鍣?
    for (const [pid, disposables] of this.ptyDisposables.entries()) {
      disposables.forEach(d => {
        try {
          d.dispose();
        } catch (error) {
          // 蹇界暐娓呯悊閿欒
        }
      });
    }
    this.ptyDisposables.clear();

    // 鏀堕泦鎵€鏈?PTY 杩涚▼鐨?PID
    const pidsToKill: number[] = [];

    // 绗竴姝ワ細灏濊瘯浼橀泤缁堟锛圫IGTERM锛?
    for (const [pid, pty] of this.ptys.entries()) {
      pidsToKill.push(pid);
      if (pty && typeof pty.kill === 'function') {
        try {
          // 鍏堜娇鐢?SIGTERM 浼橀泤缁堟
          pty.kill('SIGTERM');
          console.log(`[ProcessManager] Sent SIGTERM to PTY process ${pid}`);
        } catch (error) {
          // 蹇界暐閿欒锛屽洜涓鸿繘绋嬪彲鑳藉凡缁忛€€鍑?
          if (process.env.NODE_ENV === 'development') {
            console.log(`[ProcessManager] PTY process ${pid} already exited or kill failed`);
          }
        }
      }
    }

    const totalProcesses = pidsToKill.length;

    // 绛夊緟 300ms 璁╄繘绋嬫湁鏈轰細浼橀泤閫€鍑?
    if (pidsToKill.length > 0) {
      console.log('[ProcessManager] Waiting 300ms for graceful shutdown...');
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // 绗簩姝ワ細寮哄埗缁堟鎵€鏈夎繘绋嬪強鍏跺瓙杩涚▼鏍?
    if (pidsToKill.length > 0) {
      console.log('[ProcessManager] Force killing remaining processes and their children...');

      if (platform() === 'win32') {
        // Windows: 浣跨敤 taskkill /T 涓€娆℃€х粓姝㈣繘绋嬫爲锛岄伩鍏嶉€掑綊鏌ヨ
        // 杩欐瘮閫愪釜鏌ヨ瀛愯繘绋嬪揩寰楀锛屼笖涓嶄細闃诲涓荤嚎绋嬪お涔?
        await this.killProcessTreesBatch(pidsToKill, progressCallback, totalProcesses);
      } else {
        // Unix/macOS: 浣跨敤杩涚▼缁勭粓姝㈠瓙杩涚▼
        await this.killProcessTreesUnix(pidsToKill, progressCallback, totalProcesses);
      }
    }

    // 涓嶇瓑寰呰繘绋嬮€€鍑猴紝鐩存帴娓呯悊
    this.processes.clear();
    this.ptys.clear();
    this.paneHistoryBuffers.clear();
    this.paneIndex.clear();

    console.log('[ProcessManager] Destroy completed');
  }

  /**
   * 鎵归噺缁堟杩涚▼鏍戯紙Windows锛?
   * 浣跨敤 taskkill /T 涓€娆℃€х粓姝㈣繘绋嬫爲锛岄伩鍏嶉€掑綊鏌ヨ瀛愯繘绋?
   */
  private async killProcessTreesBatch(
    pids: number[],
    progressCallback?: (current: number, total: number) => void,
    total?: number
  ): Promise<void> {
    const totalProcesses = total || pids.length;
    let processedCount = 0;

    // 鍒嗘壒澶勭悊锛屾瘡鎵规渶澶?10 涓繘绋嬶紝閬垮厤鍛戒护琛岃繃闀?
    const batchSize = 10;
    for (let i = 0; i < pids.length; i += batchSize) {
      const batch = pids.slice(i, i + batchSize);

      // 浣跨敤 Promise.all 骞惰缁堟澶氫釜杩涚▼鏍?
      await Promise.all(
        batch.map(async (pid) => {
          try {
            // 浣跨敤 taskkill /F /T 寮哄埗缁堟杩涚▼鏍?
            // /F: 寮哄埗缁堟
            // /T: 缁堟杩涚▼鍙婂叾鎵€鏈夊瓙杩涚▼
            await new Promise<void>((resolve) => {
              // 浣跨敤 setImmediate 灏?execSync 鏀惧埌涓嬩竴涓簨浠跺惊鐜紝閬垮厤闃诲 UI
              setImmediate(() => {
                try {
                  execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
                  console.log(`[ProcessManager] Killed process tree for PID ${pid}`);
                } catch (error) {
                  // 杩涚▼鍙兘宸茬粡閫€鍑猴紝蹇界暐閿欒
                  console.log(`[ProcessManager] Process ${pid} already exited`);
                }
                resolve();
              });
            });
          } catch (error) {
            console.log(`[ProcessManager] Failed to kill process ${pid}`);
          }
        })
      );

      // 鏇存柊杩涘害锛堟瘡鎵瑰鐞嗗畬鍚庢洿鏂颁竴娆★紝鍑忓皯 IPC 璋冪敤棰戠巼锛?
      processedCount += batch.length;
      if (progressCallback) {
        progressCallback(Math.min(processedCount, totalProcesses), totalProcesses);
      }

      // 姣忔壒涔嬮棿鐭殏寤惰繜锛岃 UI 鏈夋満浼氭洿鏂?
      if (i + batchSize < pids.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  }

  /**
   * 鎵归噺缁堟杩涚▼鏍戯紙Unix/macOS锛?
   * 浣跨敤杩涚▼缁?(PGID) 缁堟鏁翠釜杩涚▼鏍?
   */
  private async killProcessTreesUnix(
    pids: number[],
    progressCallback?: (current: number, total: number) => void,
    total?: number
  ): Promise<void> {
    const totalProcesses = total || pids.length;
    let processedCount = 0;

    // 鍒嗘壒澶勭悊锛屾瘡鎵规渶澶?10 涓繘绋?
    const batchSize = 10;
    for (let i = 0; i < pids.length; i += batchSize) {
      const batch = pids.slice(i, i + batchSize);

      // 浣跨敤 Promise.all 骞惰缁堟澶氫釜杩涚▼鏍?
      await Promise.all(
        batch.map(async (pid) => {
          try {
            await new Promise<void>((resolve) => {
              setImmediate(() => {
                try {
                  // 鏂规硶1: 灏濊瘯缁堟杩涚▼缁勶紙璐?PID 琛ㄧず杩涚▼缁勶級
                  // 杩欎細缁堟璇ヨ繘绋嬪強鍏舵墍鏈夊瓙杩涚▼
                  try {
                    process.kill(-pid, 'SIGKILL');
                    console.log(`[ProcessManager] Killed process group -${pid}`);
                  } catch (pgidError) {
                    // 濡傛灉杩涚▼缁勭粓姝㈠け璐ワ紝灏濊瘯鐩存帴缁堟杩涚▼
                    try {
                      process.kill(pid, 'SIGKILL');
                      console.log(`[ProcessManager] Killed process ${pid}`);
                    } catch (pidError) {
                      console.log(`[ProcessManager] Process ${pid} already exited`);
                    }
                  }

                  // 鏂规硶2: 浣跨敤 pkill 缁堟瀛愯繘绋嬶紙澶囩敤鏂规锛?
                  // pkill -P <pid> 浼氱粓姝㈡墍鏈夌埗杩涚▼涓?<pid> 鐨勫瓙杩涚▼
                  try {
                    execSync(`pkill -9 -P ${pid}`, { stdio: 'ignore' });
                    console.log(`[ProcessManager] Killed children of process ${pid}`);
                  } catch (error) {
                    // 蹇界暐閿欒锛屽彲鑳芥病鏈夊瓙杩涚▼
                  }
                } catch (error) {
                  console.log(`[ProcessManager] Failed to kill process ${pid}`);
                }
                resolve();
              });
            });
          } catch (error) {
            console.log(`[ProcessManager] Failed to kill process ${pid}`);
          }
        })
      );

      // 鏇存柊杩涘害锛堟瘡鎵瑰鐞嗗畬鍚庢洿鏂颁竴娆★紝鍑忓皯 IPC 璋冪敤棰戠巼锛?
      processedCount += batch.length;
      if (progressCallback) {
        progressCallback(Math.min(processedCount, totalProcesses), totalProcesses);
      }

      // 姣忔壒涔嬮棿鐭殏寤惰繜锛岃 UI 鏈夋満浼氭洿鏂?
      if (i + batchSize < pids.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  }

  /**
   * Windows: 寮哄埗缁堟杩涚▼鏍?
   */
  private killProcessTreeWindows(pid: number): void {
    try {
      // 浣跨敤 taskkill /F /T 寮哄埗缁堟杩涚▼鍙婂叾鎵€鏈夊瓙杩涚▼
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
      console.log(`[ProcessManager] Killed process tree for PID ${pid}`);
    } catch (error) {
      // 杩涚▼鍙兘宸茬粡閫€鍑猴紝蹇界暐閿欒
      console.log(`[ProcessManager] Process ${pid} already exited or kill failed`);
    }
  }

  /**
   * 鑾峰彇鐢ㄤ簬鍒涘缓 PTY 鐨勭幆澧冨彉閲忥紙甯︾煭鏈熺紦瀛橈級
   * 璇存槑锛歐indows 涓嬭鍙栨敞鍐岃〃鏄悓姝ュ懡浠わ紝缂撳瓨鍙樉钁楅檷浣庡崱椤挎鐜囥€?
   */
  private getSpawnEnvironment(): NodeJS.ProcessEnv {
    const now = Date.now();
    if (
      this.cachedSpawnEnv &&
      now - this.cachedSpawnEnvAt < this.SPAWN_ENV_CACHE_TTL_MS
    ) {
      return this.cachedSpawnEnv;
    }

    this.cachedSpawnEnv = getLatestEnvironmentVariables();
    this.cachedSpawnEnvAt = now;
    return this.cachedSpawnEnv;
  }

  /**
   * 鍒涘缓 Mock PTY 杩涚▼锛堜粎鍦?node-pty 涓嶅彲鐢ㄦ椂浣跨敤锛?
   */
  private createMockPty(pid: number, config: TerminalConfig): any {
    // Mock 瀹炵幇
    const dataCallbacks: Array<(data: string) => void> = [];
    const exitCallbacks: Array<(exitCode: number) => void> = [];

    return {
      pid,
      onData: (callback: (data: string) => void) => {
        dataCallbacks.push(callback);
        // Mock: 妯℃嫙缁堢杈撳嚭
        setTimeout(() => {
          callback(`Mock terminal started in ${config.workingDirectory}\r\n`);
          callback(`$ `); // 鏄剧ず鎻愮ず绗?
        }, 100);
      },
      onExit: (callback: (exitCode: number) => void) => {
        exitCallbacks.push(callback);
      },
      write: (data: string) => {
        // Mock: 鍥炴樉鐢ㄦ埛杈撳叆骞舵ā鎷熷懡浠ゆ墽琛?
        dataCallbacks.forEach(cb => {
          cb(data); // 鍥炴樉杈撳叆

          // 濡傛灉鏄洖杞︼紝妯℃嫙鍛戒护鎵ц
          if (data === '\r') {
            cb('\r\n$ '); // 鏂拌 + 鎻愮ず绗?
          }
        });
      },
      resize: (cols: number, rows: number) => {
        // Mock: 妯℃嫙璋冩暣缁堢澶у皬锛堟棤闇€瀹為檯鎿嶄綔锛?
      },
      kill: () => {
        // Mock: 妯℃嫙缁堟杩涚▼
        exitCallbacks.forEach(cb => cb(0));
        this.killProcess(pid);
      },
    };
  }

  /**
   * 鍒涘缓鐪熷疄鐨?PTY 杩涚▼锛堜娇鐢?node-pty锛?
   */
  private createRealPty(config: TerminalConfig, executable: string, args: string[]): any {
    // 鑾峰彇鏈€鏂扮殑绯荤粺鐜鍙橀噺锛圵indows 浠庢敞鍐岃〃璇诲彇锛宮acOS/Linux 浣跨敤 process.env锛?
    const latestEnv = this.getSpawnEnvironment();

    // 娓呯悊鐜鍙橀噺锛岀Щ闄ゅ彲鑳藉鑷村啿绐佺殑鍙橀噺
    const cleanEnv = { ...latestEnv };
    delete cleanEnv.CLAUDECODE; // 绉婚櫎 Claude Code 鐜鍙橀噺锛岄伩鍏嶅祵濂椾細璇濇娴?
    delete cleanEnv.VSCODE_INJECTION; // 绉婚櫎 VS Code 娉ㄥ叆鍙橀噺

    // 娉ㄥ叆绐楀彛 ID 鐜鍙橀噺锛堜緵 statusLine 鎻掍欢浣跨敤锛?
    cleanEnv.AUSOME_TERMINAL_WINDOW_ID = config.windowId;

    // 鍚堝苟鐢ㄦ埛鎻愪緵鐨勭幆澧冨彉閲忥紙濡傛灉鏈夛級
    if (config.env) {
      Object.assign(cleanEnv, config.env);
    }

    // 娉ㄥ叆 tmux 鍏煎鐜鍙橀噺锛堝鏋滃惎鐢級
    if (this.shouldEnableTmuxCompat()) {
      const tmuxEnv = this.buildTmuxEnvironment(config, cleanEnv);
      Object.assign(cleanEnv, tmuxEnv);

      if (process.env.AUSOME_TMUX_DEBUG === '1') {
        console.log('[ProcessManager] Injected tmux environment:', {
          TMUX: cleanEnv.TMUX,
          TMUX_PANE: cleanEnv.TMUX_PANE,
          AUSOME_TERMINAL_WINDOW_ID: cleanEnv.AUSOME_TERMINAL_WINDOW_ID,
          AUSOME_TERMINAL_PANE_ID: cleanEnv.AUSOME_TERMINAL_PANE_ID,
          AUSOME_TMUX_RPC: cleanEnv.AUSOME_TMUX_RPC,
        });
      }
    }

    // 鍒涘缓鐪熷疄鐨?PTY 杩涚▼
    const ptySpawnOptions: Record<string, unknown> = {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd: config.workingDirectory,
      env: cleanEnv,
    };

    if (platform() === 'win32') {
      const useBundledConptyDll = this.shouldUseBundledConptyDll();
      ptySpawnOptions.useConpty = true;
      if (useBundledConptyDll) {
        ptySpawnOptions.useConptyDll = true;
      }
    }

    try {
      console.log('[ProcessManager] Spawning PTY:', {
        executable,
        args,
        cwd: config.workingDirectory,
        platform: platform(),
      });

      const ptyProcess = pty.spawn(executable, args, ptySpawnOptions);
      return ptyProcess;
    } catch (error) {
      console.error('[ProcessManager] Failed to spawn PTY:', {
        error,
        executable,
        args,
        cwd: config.workingDirectory,
        cwdExists: existsSync(config.workingDirectory),
        executableExists: existsSync(executable),
      });
      throw error;
    }
  }

  private resolveLaunchCommand(config: TerminalConfig): { command: string; file: string; args: string[] } {
    const command = resolveShellProgram({
      preferredShellProgram: config.command,
      settings: this.getSettings?.() ?? null,
    });
    const tokens = this.tokenizeCommand(command);

    if (tokens.length === 0) {
      throw new Error('Terminal command resolved to an empty value');
    }

    const explicitExecutable = this.findExplicitExecutable(tokens);
    if (explicitExecutable) {
      return {
        command,
        file: explicitExecutable.file,
        args: explicitExecutable.args,
      };
    }

    return {
      command,
      file: tokens[0],
      args: tokens.slice(1),
    };
  }

  private findExplicitExecutable(tokens: string[]): { file: string; args: string[] } | null {
    for (let i = tokens.length; i >= 1; i--) {
      const candidate = tokens.slice(0, i).join(' ');
      if (existsSync(candidate)) {
        return {
          file: candidate,
          args: tokens.slice(i),
        };
      }
    }

    return null;
  }

  private tokenizeCommand(command: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let quote: '"' | "'" | null = null;

    for (const char of command.trim()) {
      if ((char === '"' || char === '\'') && quote === null) {
        quote = char;
        continue;
      }

      if (char === quote) {
        quote = null;
        continue;
      }

      if (/\s/.test(char) && quote === null) {
        if (current) {
          tokens.push(current);
          current = '';
        }
        continue;
      }

      current += char;
    }

    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  private shouldUseBundledConptyDll(): boolean {
    if (platform() !== 'win32') {
      return false;
    }

    const override = process.env.AUSOME_USE_CONPTY_DLL?.trim().toLowerCase();
    if (override === '1' || override === 'true') {
      return true;
    }
    if (override === '0' || override === 'false') {
      return false;
    }

    return this.getSettings?.()?.terminal?.useBundledConptyDll ?? true;
  }

  /**
   * 妫€鏌ユ槸鍚﹀惎鐢?tmux 鍏煎妯″紡
   */
  private async ensureTmuxRpcServer(config: TerminalConfig): Promise<void> {
    if (!this.shouldEnableTmuxCompat()) {
      return;
    }

    if (!this.tmuxCompatService) {
      console.warn('[ProcessManager] Tmux compat enabled but service is unavailable, skipping RPC server ensure');
      return;
    }

    if (!config.windowId) {
      console.warn('[ProcessManager] Tmux compat enabled but windowId is missing, skipping RPC server ensure');
      return;
    }

    const socketPath = await this.tmuxCompatService.ensureRpcServer(config.windowId);
    console.log(`[ProcessManager] Ensured tmux RPC server for windowId=${config.windowId} at ${socketPath}`);
  }

  private shouldEnableTmuxCompat(): boolean {
    const settings = this.getSettings?.();
    return settings?.tmux?.enabled ?? false;
  }

  /**
   * 鏋勫缓 tmux 鐜鍙橀噺
   */
  private buildTmuxEnvironment(config: TerminalConfig, baseEnv: NodeJS.ProcessEnv): Partial<NodeJS.ProcessEnv> {
    if (!this.tmuxCompatService) {
      console.warn('[ProcessManager] TmuxCompatService not available, skipping tmux environment injection');
      return {};
    }

    if (!config.windowId || !config.paneId) {
      console.warn('[ProcessManager] windowId or paneId missing, skipping tmux environment injection');
      return {};
    }

    const existingTmuxPaneId = this.tmuxCompatService.getTmuxPaneId(config.windowId, config.paneId);
    const tmuxPaneId = existingTmuxPaneId ?? this.tmuxCompatService.allocatePaneId();

    if (!existingTmuxPaneId) {
      this.tmuxCompatService.registerPane(tmuxPaneId, config.windowId, config.paneId);
    }

    const rpcSocketPath = this.getRpcSocketPath(config.windowId);

    const tmuxSocketPath = platform() === 'win32'
      ? `\\\\.\\pipe\\ausome-tmux-default`
      : `/tmp/tmux-${process.getuid?.() ?? 1000}/default`;

    const tmuxValue = `${tmuxSocketPath},${process.pid},0`;

    const settings = this.getSettings?.();
    const autoInjectPath = settings?.tmux?.autoInjectPath ?? true;

    const currentPath = baseEnv.Path || baseEnv.PATH || process.env.Path || process.env.PATH || '';
    let newPath = currentPath;
    if (autoInjectPath) {
      const fakeTmuxDir = this.getFakeTmuxDir();
      newPath = `${fakeTmuxDir}${path.delimiter}${currentPath}`;
    }

    const tmuxLogFile = path.join(tmpdir(), 'copilot-terminal-tmux-debug.log');

    return {
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
      TMUX: tmuxValue,
      TMUX_PANE: tmuxPaneId,
      AUSOME_TERMINAL_WINDOW_ID: config.windowId,
      AUSOME_TERMINAL_PANE_ID: config.paneId,
      AUSOME_TMUX_RPC: rpcSocketPath,
      AUSOME_TMUX_LOG_FILE: tmuxLogFile,
      ...(baseEnv.AUSOME_TMUX_DEBUG === '1' ? { AUSOME_TMUX_DEBUG: '1' } : {}),
      PATH: newPath,
      Path: newPath,
    };
  }
  private getFakeTmuxDir(): string {
    try {
      return getTmuxShimDir();
    } catch (error) {
      console.error('[ProcessManager] Failed to resolve tmux shim dir:', error);
      return path.join(process.cwd(), 'resources', 'bin');
    }
  }
  private getRpcSocketPath(windowId: string): string {
    if (this.tmuxCompatService) {
      return this.tmuxCompatService.getRpcSocketPath(windowId);
    }

    if (platform() === 'win32') {
      return `\\\\.\\pipe\\ausome-tmux-${windowId}`;
    } else {
      return `/tmp/ausome-tmux-${windowId}.sock`;
    }
  }

  rebindPaneProcess(oldWindowId: string, paneId: string, newWindowId: string, newPaneId: string = paneId): void {
    const oldKey = this.getPaneKey(oldWindowId, paneId);
    const pid = this.paneIndex.get(oldKey);
    if (!pid) {
      return;
    }

    const newKey = this.getPaneKey(newWindowId, newPaneId);
    if (oldKey !== newKey) {
      this.paneIndex.delete(oldKey);
      this.paneIndex.set(newKey, pid);
    }

    if (paneId !== newPaneId) {
      const history = this.paneHistoryBuffers.get(paneId);
      if (history) {
        this.paneHistoryBuffers.delete(paneId);
        this.paneHistoryBuffers.set(newPaneId, history);
      }
    }

    const processInfo = this.processes.get(pid);
    if (processInfo) {
      processInfo.windowId = newWindowId;
      processInfo.paneId = newPaneId;
    }
  }

  private disposePtyDisposables(pid: number): void {
    const disposables = this.ptyDisposables.get(pid);
    if (!disposables) {
      return;
    }

    disposables.forEach(d => {
      try {
        d.dispose();
      } catch {
        // Ignore PTY listener cleanup failures.
      }
    });
    this.ptyDisposables.delete(pid);
  }

  private finalizeProcessExit(pid: number, exitCode: number): void {
    const processInfo = this.processes.get(pid);
    if (!processInfo || processInfo.status === ProcessStatus.Exited) {
      return;
    }

    this.disposePtyDisposables(pid);
    this.ptyOutputBuffers.delete(pid);
    this.ptys.delete(pid);

    const paneKey = this.getPaneKey(processInfo.windowId, processInfo.paneId);
    this.paneIndex.delete(paneKey);

    processInfo.status = ProcessStatus.Exited;
    processInfo.exitCode = exitCode;

    this.statusDetector.onProcessExit(pid, exitCode);
    this.emit('process-exited', processInfo);
    this.scheduleProcessCleanup(pid);
  }

  private resetPaneHistory(paneId?: string): void {
    if (!paneId) {
      return;
    }

    this.paneHistoryBuffers.set(paneId, {
      entries: [],
      totalLength: 0,
      nextSeq: 1,
      lastSeq: 0,
    });
  }

  private appendPaneHistory(paneId: string | undefined, data: string): void {
    if (!paneId || !data) {
      return;
    }

    const history = this.paneHistoryBuffers.get(paneId) ?? {
      entries: [],
      totalLength: 0,
      nextSeq: 1,
      lastSeq: 0,
    };

    const seq = history.nextSeq++;
    history.entries.push({ seq, data });
    history.totalLength += data.length;
    history.lastSeq = seq;

    while (
      history.entries.length > this.PANE_HISTORY_CHUNK_LIMIT
      || history.totalLength > this.PANE_HISTORY_CHAR_LIMIT
    ) {
      const removed = history.entries.shift();
      if (!removed) {
        break;
      }
      history.totalLength -= removed.data.length;
    }

    this.paneHistoryBuffers.set(paneId, history);
  }

  private scheduleProcessCleanup(pid: number): void {
    if (this.processCleanupTimers.has(pid)) {
      return;
    }

    const cleanupTimer = setTimeout(() => {
      this.processCleanupTimers.delete(pid);
      this.processes.delete(pid);
      this.statusDetector.untrackPid(pid);
    }, 1000);
    cleanupTimer.unref();

    this.processCleanupTimers.set(pid, cleanupTimer);
  }

  private isExitedPtyResizeError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /Cannot resize a pty that has already exited/i.test(message);
  }
}
