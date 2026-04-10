/**
 * TmuxCommandParser 单元测试
 */

import { describe, it, expect } from 'vitest';
import { TmuxCommandParser, TmuxParseError } from './TmuxCommandParser';
import { TmuxCommand, TmuxLayout } from '../../shared/types/tmux';

describe('TmuxCommandParser', () => {
  describe('parse()', () => {
    it('应该解析版本命令', () => {
      const result = TmuxCommandParser.parse(['tmux', '-V']);
      expect(result.command).toBe(TmuxCommand.Version);
      expect(result.globalOptions).toEqual({});
    });

    it('应该解析全局 -L socket 参数', () => {
      const result = TmuxCommandParser.parse(['tmux', '-L', 'my-socket', 'list-panes']);
      expect(result.globalOptions.socket).toBe('my-socket');
      expect(result.command).toBe(TmuxCommand.ListPanes);
    });

    it('应该解析全局 -f config-file 参数', () => {
      const result = TmuxCommandParser.parse(['tmux', '-f', 'C:/tmp/tmux.conf', 'new-session', '-s', 'demo']);
      expect(result.globalOptions.configFile).toBe('C:/tmp/tmux.conf');
      expect(result.command).toBe(TmuxCommand.NewSession);
      expect(result.options.sessionName).toBe('demo');
    });

    it('应该解析 split-window 命令', () => {
      const result = TmuxCommandParser.parse([
        'tmux',
        'split-window',
        '-h',
        '-t',
        '%1',
        '-l',
        '50%',
        '-P',
        '-F',
        '#{pane_id}',
      ]);

      expect(result.command).toBe(TmuxCommand.SplitWindow);
      expect(result.options.horizontal).toBe(true);
      expect(result.options.target).toBe('%1');
      expect(result.options.size).toBe('50%');
      expect(result.options.print).toBe(true);
      expect(result.options.format).toBe('#{pane_id}');
    });

    it('应该解析 send-keys 命令', () => {
      const result = TmuxCommandParser.parse([
        'tmux',
        'send-keys',
        '-t',
        '%2',
        'echo hello',
        'Enter',
      ]);

      expect(result.command).toBe(TmuxCommand.SendKeys);
      expect(result.options.target).toBe('%2');
      expect(result.args).toEqual(['echo hello', 'Enter']);
    });

    it('应该解析 select-layout 命令', () => {
      const result = TmuxCommandParser.parse([
        'tmux',
        'select-layout',
        '-t',
        'session:0',
        'main-vertical',
      ]);

      expect(result.command).toBe(TmuxCommand.SelectLayout);
      expect(result.options.target).toBe('session:0');
      expect(result.args).toEqual(['main-vertical']);
    });

    it('应该解析 select-pane 命令（设置标题）', () => {
      const result = TmuxCommandParser.parse([
        'tmux',
        'select-pane',
        '-t',
        '%1',
        '-T',
        'team-lead',
      ]);

      expect(result.command).toBe(TmuxCommand.SelectPane);
      expect(result.options.target).toBe('%1');
      expect(result.options.title).toBe('team-lead');
    });

    it('应该解析 set-option 命令', () => {
      const result = TmuxCommandParser.parse([
        'tmux',
        'set-option',
        '-p',
        '-t',
        '%1',
        'pane-border-style',
        'fg=blue',
      ]);

      expect(result.command).toBe(TmuxCommand.SetOption);
      expect(result.options.pane).toBe(true);
      expect(result.options.target).toBe('%1');
      expect(result.args).toEqual(['pane-border-style', 'fg=blue']);
    });

    it('应该解析 new-window/new-session 的 -n windowName 选项', () => {
      const result = TmuxCommandParser.parse([
        'tmux',
        'new-window',
        '-t',
        'swarm',
        '-n',
        'planner',
        '-P',
        '-F',
        '#{pane_id}',
      ]);

      expect(result.command).toBe(TmuxCommand.NewWindow);
      expect(result.options.target).toBe('swarm');
      expect(result.options.windowName).toBe('planner');
      expect(result.options.print).toBe(true);
    });

    it('应该解析 display-message 命令', () => {
      const result = TmuxCommandParser.parse([
        'tmux',
        'display-message',
        '-p',
        '-F',
        '#{pane_id}',
      ]);

      expect(result.command).toBe(TmuxCommand.DisplayMessage);
      expect(result.options.print).toBe(true);
      expect(result.options.format).toBe('#{pane_id}');
    });

    it('应该解析 list-panes 命令', () => {
      const result = TmuxCommandParser.parse([
        'tmux',
        'list-panes',
        '-t',
        'session:0',
        '-F',
        '#{pane_id} #{pane_title}',
      ]);

      expect(result.command).toBe(TmuxCommand.ListPanes);
      expect(result.options.target).toBe('session:0');
      expect(result.options.format).toBe('#{pane_id} #{pane_title}');
    });

    it('应该解析 resize-pane 命令', () => {
      const result = TmuxCommandParser.parse([
        'tmux',
        'resize-pane',
        '-t',
        '%1',
        '-x',
        '80%',
      ]);

      expect(result.command).toBe(TmuxCommand.ResizePane);
      expect(result.options.target).toBe('%1');
      expect(result.options.width).toBe('80%');
    });

    it('应该解析命令简写形式', () => {
      const result1 = TmuxCommandParser.parse(['tmux', 'splitw', '-h']);
      expect(result1.command).toBe(TmuxCommand.SplitWindow);

      const result2 = TmuxCommandParser.parse(['tmux', 'lsp']);
      expect(result2.command).toBe(TmuxCommand.ListPanes);

      const result3 = TmuxCommandParser.parse(['tmux', 'selectp', '-t', '%1']);
      expect(result3.command).toBe(TmuxCommand.SelectPane);
    });

    it('应该处理不带 tmux 前缀的命令', () => {
      const result = TmuxCommandParser.parse(['split-window', '-h']);
      expect(result.command).toBe(TmuxCommand.SplitWindow);
      expect(result.options.horizontal).toBe(true);
    });

    it('应该抛出错误：空命令', () => {
      expect(() => TmuxCommandParser.parse([])).toThrow(TmuxParseError);
    });

    it('应该抛出错误：未知命令', () => {
      expect(() => TmuxCommandParser.parse(['tmux', 'unknown-command'])).toThrow(
        TmuxParseError
      );
    });

    it('应该抛出错误：仅有全局选项', () => {
      expect(() => TmuxCommandParser.parse(['tmux', '-L', 'socket'])).toThrow(
        TmuxParseError
      );
    });
  });

  describe('parseFormatString()', () => {
    it('应该解析单个格式字段', () => {
      const fields = TmuxCommandParser.parseFormatString('#{pane_id}');
      expect(fields).toEqual(['pane_id']);
    });

    it('应该解析多个格式字段', () => {
      const fields = TmuxCommandParser.parseFormatString(
        '#{pane_id} #{session_name} #{window_index}'
      );
      expect(fields).toEqual(['pane_id', 'session_name', 'window_index']);
    });

    it('应该解析混合文本和格式字段', () => {
      const fields = TmuxCommandParser.parseFormatString(
        'Pane: #{pane_id}, Session: #{session_name}'
      );
      expect(fields).toEqual(['pane_id', 'session_name']);
    });

    it('应该返回空数组：无格式字段', () => {
      const fields = TmuxCommandParser.parseFormatString('plain text');
      expect(fields).toEqual([]);
    });
  });

  describe('parseTarget()', () => {
    it('应该解析 pane ID 格式', () => {
      const target = TmuxCommandParser.parseTarget('%1');
      expect(target).toEqual({
        type: 'pane',
        paneId: '%1',
      });
    });

    it('应该解析 window target（session + index）', () => {
      const target = TmuxCommandParser.parseTarget('my-session:0');
      expect(target).toEqual({
        type: 'window',
        sessionName: 'my-session',
        windowIndex: 0,
      });
    });

    it('应该解析 window target（session + name）', () => {
      const target = TmuxCommandParser.parseTarget('my-session:main-window');
      expect(target).toEqual({
        type: 'window',
        sessionName: 'my-session',
        windowName: 'main-window',
      });
    });

    it('应该解析 session 格式', () => {
      const target = TmuxCommandParser.parseTarget('my-session');
      expect(target).toEqual({
        type: 'session',
        sessionName: 'my-session',
      });
    });
  });

  describe('parseSplitWindowOptions()', () => {
    it('应该解析水平分割选项', () => {
      const parsed = TmuxCommandParser.parse(['split-window', '-h', '-t', '%1']);
      const options = TmuxCommandParser.parseSplitWindowOptions(parsed);

      expect(options.horizontal).toBe(true);
      expect(options.target).toBe('%1');
    });

    it('应该解析垂直分割选项', () => {
      const parsed = TmuxCommandParser.parse(['split-window', '-v']);
      const options = TmuxCommandParser.parseSplitWindowOptions(parsed);

      expect(options.vertical).toBe(true);
    });

    it('应该解析百分比大小', () => {
      const parsed = TmuxCommandParser.parse(['split-window', '-l', '30%']);
      const options = TmuxCommandParser.parseSplitWindowOptions(parsed);

      expect(options.percentage).toBe(30);
    });

    it('应该解析绝对大小', () => {
      const parsed = TmuxCommandParser.parse(['split-window', '-l', '80']);
      const options = TmuxCommandParser.parseSplitWindowOptions(parsed);

      expect(options.size).toBe('80');
    });

    it('应该解析打印和格式选项', () => {
      const parsed = TmuxCommandParser.parse([
        'split-window',
        '-P',
        '-F',
        '#{pane_id}',
      ]);
      const options = TmuxCommandParser.parseSplitWindowOptions(parsed);

      expect(options.print).toBe(true);
      expect(options.format).toBe('#{pane_id}');
    });

    it('应该解析启动命令', () => {
      const parsed = TmuxCommandParser.parse(['split-window', 'echo', 'hello']);
      const options = TmuxCommandParser.parseSplitWindowOptions(parsed);

      expect(options.command).toBe('echo hello');
    });
  });

  describe('parseSendKeysOptions()', () => {
    it('应该解析基本 send-keys 选项', () => {
      const parsed = TmuxCommandParser.parse(['send-keys', '-t', '%1', 'ls']);
      const options = TmuxCommandParser.parseSendKeysOptions(parsed);

      expect(options.target).toBe('%1');
      expect(options.keys).toEqual(['ls']);
      expect(options.hasEnter).toBe(false);
    });

    it('应该检测 Enter 键', () => {
      const parsed = TmuxCommandParser.parse([
        'send-keys',
        '-t',
        '%1',
        'ls',
        'Enter',
      ]);
      const options = TmuxCommandParser.parseSendKeysOptions(parsed);

      expect(options.keys).toEqual(['ls']);
      expect(options.hasEnter).toBe(true);
    });

    it('应该抛出错误：缺少 -t 选项', () => {
      const parsed = TmuxCommandParser.parse(['send-keys', 'ls']);
      expect(() => TmuxCommandParser.parseSendKeysOptions(parsed)).toThrow(
        TmuxParseError
      );
    });
  });

  describe('parseSelectLayoutOptions()', () => {
    it('应该解析 main-vertical 布局', () => {
      const parsed = TmuxCommandParser.parse(['select-layout', 'main-vertical']);
      const options = TmuxCommandParser.parseSelectLayoutOptions(parsed);

      expect(options.layout).toBe(TmuxLayout.MainVertical);
    });

    it('应该解析 tiled 布局', () => {
      const parsed = TmuxCommandParser.parse(['select-layout', 'tiled']);
      const options = TmuxCommandParser.parseSelectLayoutOptions(parsed);

      expect(options.layout).toBe(TmuxLayout.Tiled);
    });

    it('应该解析带 target 的布局', () => {
      const parsed = TmuxCommandParser.parse([
        'select-layout',
        '-t',
        'session:0',
        'even-horizontal',
      ]);
      const options = TmuxCommandParser.parseSelectLayoutOptions(parsed);

      expect(options.target).toBe('session:0');
      expect(options.layout).toBe(TmuxLayout.EvenHorizontal);
    });

    it('应该抛出错误：缺少布局名称', () => {
      const parsed = TmuxCommandParser.parse(['select-layout']);
      expect(() => TmuxCommandParser.parseSelectLayoutOptions(parsed)).toThrow(
        TmuxParseError
      );
    });

    it('应该抛出错误：未知布局', () => {
      const parsed = TmuxCommandParser.parse(['select-layout', 'unknown-layout']);
      expect(() => TmuxCommandParser.parseSelectLayoutOptions(parsed)).toThrow(
        TmuxParseError
      );
    });
  });

  describe('parseResizePaneOptions()', () => {
    it('应该解析宽度选项', () => {
      const parsed = TmuxCommandParser.parse(['resize-pane', '-t', '%1', '-x', '80']);
      const options = TmuxCommandParser.parseResizePaneOptions(parsed);

      expect(options.target).toBe('%1');
      expect(options.width).toBe('80');
    });

    it('应该解析百分比宽度', () => {
      const parsed = TmuxCommandParser.parse([
        'resize-pane',
        '-t',
        '%1',
        '-x',
        '50%',
      ]);
      const options = TmuxCommandParser.parseResizePaneOptions(parsed);

      expect(options.percentage).toBe(50);
    });

    it('应该解析高度选项', () => {
      const parsed = TmuxCommandParser.parse([
        'resize-pane',
        '-t',
        '%1',
        '-y',
        '100',
      ]);
      const options = TmuxCommandParser.parseResizePaneOptions(parsed);

      expect(options.height).toBe('100');
    });

    it('应该抛出错误：缺少 -t 选项', () => {
      const parsed = TmuxCommandParser.parse(['resize-pane', '-x', '80']);
      expect(() => TmuxCommandParser.parseResizePaneOptions(parsed)).toThrow(
        TmuxParseError
      );
    });
  });

  describe('parseSelectPaneOptions()', () => {
    it('应该解析基本 select-pane 选项', () => {
      const parsed = TmuxCommandParser.parse(['select-pane', '-t', '%1']);
      const options = TmuxCommandParser.parseSelectPaneOptions(parsed);

      expect(options.target).toBe('%1');
    });

    it('应该解析标题选项', () => {
      const parsed = TmuxCommandParser.parse([
        'select-pane',
        '-t',
        '%1',
        '-T',
        'team-lead',
      ]);
      const options = TmuxCommandParser.parseSelectPaneOptions(parsed);

      expect(options.title).toBe('team-lead');
    });

    it('应该抛出错误：缺少 -t 选项', () => {
      const parsed = TmuxCommandParser.parse(['select-pane', '-T', 'title']);
      expect(() => TmuxCommandParser.parseSelectPaneOptions(parsed)).toThrow(
        TmuxParseError
      );
    });
  });

  describe('parseSetOptionOptions()', () => {
    it('应该解析基本 set-option', () => {
      const parsed = TmuxCommandParser.parse([
        'set-option',
        'option-name',
        'option-value',
      ]);
      const options = TmuxCommandParser.parseSetOptionOptions(parsed);

      expect(options.optionName).toBe('option-name');
      expect(options.optionValue).toBe('option-value');
    });

    it('应该解析 pane 级选项', () => {
      const parsed = TmuxCommandParser.parse([
        'set-option',
        '-p',
        '-t',
        '%1',
        'pane-border-style',
        'fg=blue',
      ]);
      const options = TmuxCommandParser.parseSetOptionOptions(parsed);

      expect(options.pane).toBe(true);
      expect(options.target).toBe('%1');
      expect(options.optionName).toBe('pane-border-style');
      expect(options.optionValue).toBe('fg=blue');
    });

    it('应该解析 window 级选项', () => {
      const parsed = TmuxCommandParser.parse([
        'set-option',
        '-w',
        'window-option',
        'value',
      ]);
      const options = TmuxCommandParser.parseSetOptionOptions(parsed);

      expect(options.window).toBe(true);
    });

    it('应该抛出错误：缺少选项名称和值', () => {
      const parsed = TmuxCommandParser.parse(['set-option']);
      expect(() => TmuxCommandParser.parseSetOptionOptions(parsed)).toThrow(
        TmuxParseError
      );
    });
  });

  describe('parseDisplayMessageOptions()', () => {
    it('应该解析基本 display-message', () => {
      const parsed = TmuxCommandParser.parse(['display-message']);
      const options = TmuxCommandParser.parseDisplayMessageOptions(parsed);

      expect(options).toEqual({});
    });

    it('应该解析打印和格式选项', () => {
      const parsed = TmuxCommandParser.parse([
        'display-message',
        '-p',
        '-F',
        '#{pane_id}',
      ]);
      const options = TmuxCommandParser.parseDisplayMessageOptions(parsed);

      expect(options.print).toBe(true);
      expect(options.format).toBe('#{pane_id}');
    });

    it('应该解析 target 选项', () => {
      const parsed = TmuxCommandParser.parse([
        'display-message',
        '-t',
        '%1',
        '-p',
      ]);
      const options = TmuxCommandParser.parseDisplayMessageOptions(parsed);

      expect(options.target).toBe('%1');
      expect(options.print).toBe(true);
    });
  });

  describe('parseListPanesOptions()', () => {
    it('应该解析基本 list-panes', () => {
      const parsed = TmuxCommandParser.parse(['list-panes']);
      const options = TmuxCommandParser.parseListPanesOptions(parsed);

      expect(options).toEqual({});
    });

    it('应该解析 target 和 format 选项', () => {
      const parsed = TmuxCommandParser.parse([
        'list-panes',
        '-t',
        'session:0',
        '-F',
        '#{pane_id}',
      ]);
      const options = TmuxCommandParser.parseListPanesOptions(parsed);

      expect(options.target).toBe('session:0');
      expect(options.format).toBe('#{pane_id}');
    });
  });
});
