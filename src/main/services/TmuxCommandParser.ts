/**
 * TmuxCommandParser - tmux 命令行解析器
 *
 * 负责解析 tmux 命令行参数，提供类型安全的命令对象输出。
 * 支持：
 * - 全局参数（-L socket）
 * - 命令特定参数（-t, -h, -v, -l, -P, -F, -T, -p 等）
 * - format 字符串解析（#{pane_id}, #{session_name} 等）
 * - target 格式解析（%1, session:0, session:windowName）
 */

import {
  TmuxCommand,
  ParsedTmuxCommand,
  SplitWindowOptions,
  SendKeysOptions,
  SelectLayoutOptions,
  ResizePaneOptions,
  SelectPaneOptions,
  SetOptionOptions,
  DisplayMessageOptions,
  ListPanesOptions,
  TmuxLayout,
} from '../../shared/types/tmux';

/**
 * 命令解析错误
 */
export class TmuxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TmuxParseError';
  }
}

/**
 * TmuxCommandParser 类
 */
export class TmuxCommandParser {
  /**
   * 解析 tmux 命令行参数
   */
  static parse(argv: string[]): ParsedTmuxCommand {
    if (argv.length === 0) {
      throw new TmuxParseError('Empty command');
    }

    // 移除 'tmux' 本身（如果存在）
    const args = argv[0] === 'tmux' ? argv.slice(1) : [...argv];

    if (args.length === 1 && args[0] === '-V') {
      return {
        command: TmuxCommand.Version,
        globalOptions: {},
        options: {},
        args: [],
      };
    }

    // 解析全局选项（-L socket、-f config-file 等）
    const globalOptions: ParsedTmuxCommand['globalOptions'] = {};
    let commandStartIndex = 0;
    const globalFlagPattern = /^-[248ClNuv]+$/;

    while (commandStartIndex < args.length) {
      const arg = args[commandStartIndex];

      if (arg === '-L' && commandStartIndex + 1 < args.length) {
        globalOptions.socket = args[commandStartIndex + 1];
        commandStartIndex += 2;
      } else if (arg === '-f' && commandStartIndex + 1 < args.length) {
        globalOptions.configFile = args[commandStartIndex + 1];
        commandStartIndex += 2;
      } else if (arg === '-S' && commandStartIndex + 1 < args.length) {
        globalOptions.socketPath = args[commandStartIndex + 1];
        commandStartIndex += 2;
      } else if (arg === '-T' && commandStartIndex + 1 < args.length) {
        globalOptions.features = args[commandStartIndex + 1];
        commandStartIndex += 2;
      } else if (arg === '-c' && commandStartIndex + 1 < args.length) {
        globalOptions.shellCommand = args[commandStartIndex + 1];
        commandStartIndex += 2;
      } else if (globalFlagPattern.test(arg)) {
        commandStartIndex += 1;
      } else if (arg === '-V' && commandStartIndex === args.length - 1) {
        return {
          command: TmuxCommand.Version,
          globalOptions,
          options: {},
          args: [],
        };
      } else if (arg.startsWith('-')) {
        // 遇到其他选项，停止解析全局选项
        break;
      } else {
        // 遇到命令名称，停止解析全局选项
        break;
      }
    }

    if (commandStartIndex >= args.length) {
      throw new TmuxParseError('No command specified');
    }

    // 识别命令
    const commandName = args[commandStartIndex];
    const command = this.identifyCommand(commandName);
    const commandArgs = args.slice(commandStartIndex + 1);

    // 根据命令类型解析选项
    const options = this.parseCommandOptions(command, commandArgs);
    const positionalArgs = this.extractPositionalArgs(command, commandArgs);

    return {
      command,
      globalOptions,
      options,
      args: positionalArgs,
    };
  }

  /**
   * 识别命令类型
   */
  private static identifyCommand(commandName: string): TmuxCommand {
    // 版本检测
    if (commandName === '-V') {
      return TmuxCommand.Version;
    }

    // 命令映射
    const commandMap: Record<string, TmuxCommand> = {
      'display-message': TmuxCommand.DisplayMessage,
      'display': TmuxCommand.DisplayMessage,
      'list-panes': TmuxCommand.ListPanes,
      'lsp': TmuxCommand.ListPanes,
      'list-windows': TmuxCommand.ListWindows,
      'lsw': TmuxCommand.ListWindows,
      'has-session': TmuxCommand.HasSession,
      'has': TmuxCommand.HasSession,
      'split-window': TmuxCommand.SplitWindow,
      'splitw': TmuxCommand.SplitWindow,
      'kill-pane': TmuxCommand.KillPane,
      'killp': TmuxCommand.KillPane,
      'select-pane': TmuxCommand.SelectPane,
      'selectp': TmuxCommand.SelectPane,
      'resize-pane': TmuxCommand.ResizePane,
      'resizep': TmuxCommand.ResizePane,
      'send-keys': TmuxCommand.SendKeys,
      'send': TmuxCommand.SendKeys,
      'select-layout': TmuxCommand.SelectLayout,
      'selectl': TmuxCommand.SelectLayout,
      'new-session': TmuxCommand.NewSession,
      'new': TmuxCommand.NewSession,
      'kill-session': TmuxCommand.KillSession,
      'attach-session': TmuxCommand.AttachSession,
      'attach': TmuxCommand.AttachSession,
      'switch-client': TmuxCommand.SwitchClient,
      'switchc': TmuxCommand.SwitchClient,
      'new-window': TmuxCommand.NewWindow,
      'neww': TmuxCommand.NewWindow,
      'set-option': TmuxCommand.SetOption,
      'set': TmuxCommand.SetOption,
      'break-pane': TmuxCommand.BreakPane,
      'breakp': TmuxCommand.BreakPane,
      'join-pane': TmuxCommand.JoinPane,
      'joinp': TmuxCommand.JoinPane,
    };

    const cmd = commandMap[commandName];
    if (!cmd) {
      throw new TmuxParseError(`Unknown command: ${commandName}`);
    }

    return cmd;
  }

  /**
   * 解析命令选项
   */
  private static parseCommandOptions(
    command: TmuxCommand,
    args: string[]
  ): Record<string, string | boolean | number> {
    const options: Record<string, string | boolean | number> = {};
    let i = 0;

    while (i < args.length) {
      const arg = args[i];

      // 非选项参数，停止解析
      if (!arg.startsWith('-')) {
        break;
      }

      // 处理各种选项
      if (arg === '-t' && i + 1 < args.length) {
        options.target = args[i + 1];
        i += 2;
      } else if (arg === '-h') {
        options.horizontal = true;
        i++;
      } else if (arg === '-v') {
        options.vertical = true;
        i++;
      } else if (arg === '-l' && i + 1 < args.length) {
        options.size = args[i + 1];
        i += 2;
      } else if (arg === '-P') {
        if (command === TmuxCommand.SelectPane && i + 1 < args.length && !args[i + 1].startsWith('-')) {
          options.style = args[i + 1];
          i += 2;
        } else {
          options.print = true;
          i++;
        }
      } else if (arg === '-F' && i + 1 < args.length) {
        options.format = args[i + 1];
        i += 2;
      } else if (arg === '-T' && i + 1 < args.length) {
        options.title = args[i + 1];
        i += 2;
      } else if (arg === '-p') {
        // -p 在不同命令中有不同含义
        // display-message, list-panes: print (打印到 stdout)
        // set-option: pane (窗格级选项)
        if (
          command === TmuxCommand.DisplayMessage ||
          command === TmuxCommand.ListPanes
        ) {
          options.print = true;
        } else if (command === TmuxCommand.SetOption) {
          options.pane = true;
        }
        i++;
      } else if (arg === '-w') {
        options.window = true;
        i++;
      } else if (arg === '-x' && i + 1 < args.length) {
        options.width = args[i + 1];
        i += 2;
      } else if (arg === '-y' && i + 1 < args.length) {
        options.height = args[i + 1];
        i += 2;
      } else if (arg === '-s' && i + 1 < args.length) {
        options.sessionName = args[i + 1];
        i += 2;
      } else if (arg === '-n' && i + 1 < args.length) {
        options.windowName = args[i + 1];
        i += 2;
      } else if (arg === '-d') {
        options.detached = true;
        i++;
      } else if (arg === '-c' && i + 1 < args.length) {
        options.startDirectory = args[i + 1];
        i += 2;
      } else {
        // 未知选项，跳过
        i++;
      }
    }

    return options;
  }

  /**
   * 提取位置参数
   */
  private static extractPositionalArgs(command: TmuxCommand, args: string[]): string[] {
    const positionalArgs: string[] = [];
    let i = 0;

    // 跳过所有选项
    while (i < args.length) {
      const arg = args[i];

      if (!arg.startsWith('-')) {
        // 找到第一个非选项参数
        break;
      }

      // 跳过选项及其值
      if (
        arg === '-t' ||
        arg === '-l' ||
        arg === '-F' ||
        arg === '-T' ||
        arg === '-x' ||
        arg === '-y' ||
        arg === '-s' ||
        arg === '-n' ||
        arg === '-c'
      ) {
        i += 2; // 选项 + 值
      } else if (
        arg === '-P' &&
        command === TmuxCommand.SelectPane &&
        i + 1 < args.length &&
        !args[i + 1].startsWith('-')
      ) {
        i += 2;
      } else {
        i++; // 仅选项
      }
    }

    // 收集剩余的位置参数
    while (i < args.length) {
      positionalArgs.push(args[i]);
      i++;
    }

    return positionalArgs;
  }

  /**
   * 解析 format 字符串
   * 例如：'#{pane_id}' -> ['pane_id']
   */
  static parseFormatString(format: string): string[] {
    const fields: string[] = [];
    const regex = /#\{([^}]+)\}/g;
    let match;

    while ((match = regex.exec(format)) !== null) {
      fields.push(match[1]);
    }

    return fields;
  }

  /**
   * 解析 target 格式
   * 支持：
   * - %1, %2 (pane ID)
   * - session:0 (session + window index)
   * - session:windowName (session + window name)
   */
  static parseTarget(target: string): {
    type: 'pane' | 'window' | 'session';
    paneId?: string;
    sessionName?: string;
    windowIndex?: number;
    windowName?: string;
    tmuxWindowId?: number;
  } {
    // Pane ID 格式：%1, %2, %3...
    if (target.startsWith('%')) {
      return {
        type: 'pane',
        paneId: target,
      };
    }

    // Window ID 格式：@0, @1...
    if (target.startsWith('@')) {
      const tmuxWindowId = parseInt(target.slice(1), 10);
      if (!isNaN(tmuxWindowId)) {
        return {
          type: 'window',
          tmuxWindowId,
        };
      }
    }

    // Window target 格式：session:index 或 session:name
    if (target.includes(':')) {
      const [sessionName, windowPart] = target.split(':', 2);
      const windowIndex = parseInt(windowPart, 10);

      if (!isNaN(windowIndex)) {
        return {
          type: 'window',
          sessionName,
          windowIndex,
        };
      } else {
        return {
          type: 'window',
          sessionName,
          windowName: windowPart,
        };
      }
    }

    // Session 格式
    return {
      type: 'session',
      sessionName: target,
    };
  }

  /**
   * 解析 split-window 命令选项
   */
  static parseSplitWindowOptions(parsed: ParsedTmuxCommand): SplitWindowOptions {
    const options: SplitWindowOptions = {};

    if (parsed.options.target) {
      options.target = parsed.options.target as string;
    }

    if (parsed.options.horizontal) {
      options.horizontal = true;
    }

    if (parsed.options.vertical) {
      options.vertical = true;
    }

    if (parsed.options.size) {
      const size = parsed.options.size as string;
      if (size.endsWith('%')) {
        options.percentage = parseInt(size.slice(0, -1), 10);
      } else {
        options.size = size;
      }
    }

    if (parsed.options.print) {
      options.print = true;
    }

    if (parsed.options.format) {
      options.format = parsed.options.format as string;
    }

    if (parsed.args.length > 0) {
      options.command = parsed.args.join(' ');
    }

    return options;
  }

  /**
   * 解析 send-keys 命令选项
   */
  static parseSendKeysOptions(parsed: ParsedTmuxCommand): SendKeysOptions {
    if (!parsed.options.target) {
      throw new TmuxParseError('send-keys requires -t option');
    }

    const keys = [...parsed.args];
    let hasEnter = false;

    // 检查是否包含 Enter 键
    if (keys.length > 0 && keys[keys.length - 1] === 'Enter') {
      hasEnter = true;
      keys.pop();
    }

    return {
      target: parsed.options.target as string,
      keys,
      hasEnter,
    };
  }

  /**
   * 解析 select-layout 命令选项
   */
  static parseSelectLayoutOptions(parsed: ParsedTmuxCommand): SelectLayoutOptions {
    if (parsed.args.length === 0) {
      throw new TmuxParseError('select-layout requires layout name');
    }

    const layoutName = parsed.args[0];
    const layoutMap: Record<string, TmuxLayout> = {
      'main-vertical': TmuxLayout.MainVertical,
      'tiled': TmuxLayout.Tiled,
      'even-horizontal': TmuxLayout.EvenHorizontal,
      'even-vertical': TmuxLayout.EvenVertical,
    };

    const layout = layoutMap[layoutName];
    if (!layout) {
      throw new TmuxParseError(`Unknown layout: ${layoutName}`);
    }

    return {
      target: parsed.options.target as string | undefined,
      layout,
    };
  }

  /**
   * 解析 resize-pane 命令选项
   */
  static parseResizePaneOptions(parsed: ParsedTmuxCommand): ResizePaneOptions {
    if (!parsed.options.target) {
      throw new TmuxParseError('resize-pane requires -t option');
    }

    const options: ResizePaneOptions = {
      target: parsed.options.target as string,
    };

    if (parsed.options.width) {
      const width = parsed.options.width as string;
      if (width.endsWith('%')) {
        options.percentage = parseInt(width.slice(0, -1), 10);
      } else {
        options.width = width;
      }
    }

    if (parsed.options.height) {
      const height = parsed.options.height as string;
      if (height.endsWith('%')) {
        options.percentage = parseInt(height.slice(0, -1), 10);
      } else {
        options.height = height;
      }
    }

    return options;
  }

  /**
   * 解析 select-pane 命令选项
   */
  static parseSelectPaneOptions(parsed: ParsedTmuxCommand): SelectPaneOptions {
    if (!parsed.options.target) {
      throw new TmuxParseError('select-pane requires -t option');
    }

    const options: SelectPaneOptions = {
      target: parsed.options.target as string,
    };

    if (parsed.options.title) {
      options.title = parsed.options.title as string;
    }

    if (parsed.options.style) {
      options.style = parsed.options.style as string;
    }

    return options;
  }

  /**
   * 解析 set-option 命令选项
   */
  static parseSetOptionOptions(parsed: ParsedTmuxCommand): SetOptionOptions {
    if (parsed.args.length < 2) {
      throw new TmuxParseError('set-option requires option name and value');
    }

    return {
      pane: parsed.options.pane as boolean | undefined,
      window: parsed.options.window as boolean | undefined,
      target: parsed.options.target as string | undefined,
      optionName: parsed.args[0],
      optionValue: parsed.args[1],
    };
  }

  /**
   * 解析 display-message 命令选项
   */
  static parseDisplayMessageOptions(parsed: ParsedTmuxCommand): DisplayMessageOptions {
    return {
      target: parsed.options.target as string | undefined,
      print: parsed.options.print as boolean | undefined,
      format: (parsed.options.format as string | undefined) || parsed.args[0],
    };
  }

  /**
   * 解析 list-panes 命令选项
   */
  static parseListPanesOptions(parsed: ParsedTmuxCommand): ListPanesOptions {
    return {
      target: parsed.options.target as string | undefined,
      format: parsed.options.format as string | undefined,
    };
  }
}
