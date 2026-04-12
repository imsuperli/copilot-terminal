/**
 * 命令安全检查
 * 三级策略：allow（自动执行）/ ask（需用户确认）/ block（直接拒绝）
 */

export type SecurityAction = 'allow' | 'ask' | 'block';

export interface SecurityCheckResult {
  action: SecurityAction;
  reason?: string;
}

/** 直接阻止的危险命令模式 */
const BLOCK_PATTERNS: RegExp[] = [
  /\brm\s+-[a-z]*r[a-z]*f\s+\/(?:\s|$)/i,   // rm -rf /
  /\brm\s+-[a-z]*f[a-z]*r\s+\/(?:\s|$)/i,
  /\bdd\s+.*of=\/dev\/(sd|hd|nvme|vd)/i, // dd 写磁盘设备
  /\bmkfs\b/i,                           // 格式化文件系统
  /\bfdisk\b.*-l/i,
  /:\(\)\s*\{.*:\|:.*\}/,               // fork bomb
  /\bshutdown\b.*(-h|-r|-P)/i,
  /\breboot\b/i,
  /\binit\s+[06]\b/i,
  /\bsystemctl\s+(poweroff|halt)\b/i,
  /\bpoweroff\b/i,
  /\bchmod\s+-[a-z]*R[a-z]*\s+777\s+\//i, // chmod 777 /
  /\bchown\s+-[a-z]*R[a-z]*\s+.*\s+\//i,  // chown -R ... /
];

/** 需要用户确认的危险命令模式 */
const ASK_PATTERNS: RegExp[] = [
  /\brm\s+(-[a-z]*\s+)?[^\s]/i,         // rm（非 -rf /）
  /\bkill\b/i,
  /\bpkill\b/i,
  /\bkillall\b/i,
  /\bsystemctl\s+(stop|restart|disable|enable)\b/i,
  /\bservice\s+\S+\s+(stop|restart)\b/i,
  /\biptables\b/i,
  /\bufw\b/i,
  /\bfirewall-cmd\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bpasswd\b/i,
  /\buseradd\b/i,
  /\buserdel\b/i,
  /\bsudo\b/i,
  /\bsu\s+-?\s*\w/i,
  /\bcrontab\s+-[er]\b/i,
  /\btruncate\b/i,
  /\b>\s*\/etc\//i,                      // 重定向写入 /etc/
  /\bwget\b.*-O\s+\/\w/i,               // wget 写入系统目录
  /\bcurl\b.*-o\s+\/\w/i,
  /\bapt(-get)?\s+(install|remove|purge)\b/i,
  /\byum\s+(install|remove|erase)\b/i,
  /\bdnf\s+(install|remove|erase)\b/i,
  /\bpip\s+install\b/i,
  /\bnpm\s+install\s+-g\b/i,
  /\bdocker\s+(rm|rmi|stop|kill)\b/i,
  /\bkubectl\s+delete\b/i,
  /\bdrop\s+table\b/i,
  /\btruncate\s+table\b/i,
];

export function checkCommandSecurity(command: string): SecurityCheckResult {
  const trimmed = command.trim();

  // 检查 block 模式
  for (const pattern of BLOCK_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        action: 'block',
        reason: `命令被安全策略阻止：匹配高危模式 (${pattern.source.slice(0, 40)}...)`,
      };
    }
  }

  // 检查 ask 模式
  for (const pattern of ASK_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        action: 'ask',
        reason: `该命令可能影响系统状态，需要确认后执行`,
      };
    }
  }

  return { action: 'allow' };
}
