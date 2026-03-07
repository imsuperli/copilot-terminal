#!/usr/bin/env node

import { ClaudeStatusJSON, FormatOptions } from './types';
import { StatusLineRenderer } from './renderer';

/**
 * 读取 stdin
 */
async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];

    process.stdin.setEncoding('utf8');

    process.stdin.on('data', (chunk: string) => {
      chunks.push(chunk);
    });

    process.stdin.on('end', () => {
      resolve(chunks.join(''));
    });

    process.stdin.on('error', (error) => {
      reject(error);
    });

    // 设置超时
    setTimeout(() => {
      reject(new Error('Timeout reading stdin'));
    }, 1000);
  });
}

/**
 * 主函数
 */
async function main() {
  try {
    // 读取 stdin
    const input = await readStdin();

    if (!input || input.trim() === '') {
      console.error('No input received');
      process.exit(1);
    }

    // 解析 JSON
    const data: ClaudeStatusJSON = JSON.parse(input);

    // 渲染状态栏（输出到 stdout，供 Claude Code CLI 显示）
    const renderer = new StatusLineRenderer();
    const options: FormatOptions = {
      format: 'full',
      showModel: true,
      showContext: true,
      showCost: true,
      showTime: false,
      showTokens: false,
    };

    const output = renderer.render(data, options);

    // 输出到 stdout
    if (output) {
      console.log(output);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

/**
 * 提取模型显示名称
 */
function extractModelDisplayName(model: ClaudeStatusJSON['model']): string | undefined {
  if (!model) return undefined;

  if (typeof model === 'string') {
    return model;
  }

  return model.display_name || model.id;
}

/**
 * 提取模型 ID
 */
function extractModelId(model: ClaudeStatusJSON['model']): string | undefined {
  if (!model) return undefined;

  if (typeof model === 'string') {
    return model;
  }

  return model.id;
}

// 运行主函数
main();
