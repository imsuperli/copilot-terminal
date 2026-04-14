import path from 'path';
import fs from 'fs-extra';
import fg from 'fast-glob';
import type {
  CodePaneListTestsConfig,
  CodePaneRunSession,
  CodePaneRunTestsConfig,
  CodePaneTestItem,
} from '../../../shared/types/electron-api';
import { CodeRunProfileService } from './CodeRunProfileService';

export interface CodeTestServiceOptions {
  runProfileService: CodeRunProfileService;
}

export class CodeTestService {
  private readonly runProfileService: CodeRunProfileService;

  constructor(options: CodeTestServiceOptions) {
    this.runProfileService = options.runProfileService;
  }

  async listTests(config: CodePaneListTestsConfig): Promise<CodePaneTestItem[]> {
    const activeFilePath = config.activeFilePath ?? null;

    if (activeFilePath && await fs.pathExists(activeFilePath)) {
      const activeTestItem = await this.createTestItemForFile(config.rootPath, activeFilePath);
      if (activeTestItem) {
        return [activeTestItem];
      }
    }

    const candidates = await this.findCandidateTestFiles(config.rootPath);
    const testItems: CodePaneTestItem[] = [];

    for (const candidateFilePath of candidates.slice(0, 100)) {
      const item = await this.createTestItemForFile(config.rootPath, candidateFilePath);
      if (item) {
        testItems.push(item);
      }
    }

    return testItems;
  }

  async runTests(config: CodePaneRunTestsConfig): Promise<CodePaneRunSession> {
    return await this.runProfileService.runTarget({
      rootPath: config.rootPath,
      targetId: config.targetId,
    });
  }

  async rerunFailedTests(rootPath: string): Promise<CodePaneRunSession[]> {
    return await this.runProfileService.rerunFailedTargets(rootPath);
  }

  private async createTestItemForFile(rootPath: string, filePath: string): Promise<CodePaneTestItem | null> {
    const normalizedFilePath = path.resolve(filePath);
    const fileContent = await readTextFile(normalizedFilePath);

    if (normalizedFilePath.endsWith('.java') && normalizedFilePath.includes(`${path.sep}src${path.sep}test${path.sep}java${path.sep}`)) {
      const className = deriveJavaClassName(rootPath, normalizedFilePath);
      if (!className) {
        return null;
      }

      const fileTarget = this.runProfileService.registerAdHocTarget({
        rootPath,
        label: path.basename(normalizedFilePath),
        detail: `mvn -Dtest=${className} test`,
        kind: 'test',
        languageId: 'java',
        workingDirectory: rootPath,
        filePath: normalizedFilePath,
        command: resolveExecutable('mvn'),
        args: [`-Dtest=${className}`, 'test'],
      });
      const caseItems = parseJavaTestCases(fileContent).map((caseName) => {
        const caseTarget = this.runProfileService.registerAdHocTarget({
          rootPath,
          label: `${path.basename(normalizedFilePath)}#${caseName}`,
          detail: `mvn -Dtest=${className}#${caseName} test`,
          kind: 'test',
          languageId: 'java',
          workingDirectory: rootPath,
          filePath: normalizedFilePath,
          command: resolveExecutable('mvn'),
          args: [`-Dtest=${className}#${caseName}`, 'test'],
        });

        return {
          id: `test-case:${normalizedFilePath}:${caseName}`,
          label: caseName,
          kind: 'case' as const,
          filePath: normalizedFilePath,
          runnableTargetId: caseTarget.id,
        };
      });

      return {
        id: `test:${normalizedFilePath}`,
        label: path.basename(normalizedFilePath),
        kind: 'file',
        filePath: normalizedFilePath,
        runnableTargetId: fileTarget.id,
        children: [
          {
            id: `test-suite:${normalizedFilePath}:${className}`,
            label: className.split('.').at(-1) ?? className,
            kind: 'suite',
            filePath: normalizedFilePath,
            runnableTargetId: fileTarget.id,
            children: caseItems,
          },
        ],
      };
    }

    if (isPythonTestFile(normalizedFilePath)) {
      const fileTarget = this.runProfileService.registerAdHocTarget({
        rootPath,
        label: path.basename(normalizedFilePath),
        detail: `python -m pytest ${path.basename(normalizedFilePath)}`,
        kind: 'test',
        languageId: 'python',
        workingDirectory: rootPath,
        filePath: normalizedFilePath,
        command: resolveExecutable('python'),
        args: ['-m', 'pytest', normalizedFilePath],
      });
      const pythonStructure = parsePythonTestStructure(fileContent);
      const children: CodePaneTestItem[] = [];

      for (const suite of pythonStructure.suites) {
        const suiteTarget = this.runProfileService.registerAdHocTarget({
          rootPath,
          label: `${path.basename(normalizedFilePath)}::${suite.name}`,
          detail: `python -m pytest ${path.basename(normalizedFilePath)}::${suite.name}`,
          kind: 'test',
          languageId: 'python',
          workingDirectory: rootPath,
          filePath: normalizedFilePath,
          command: resolveExecutable('python'),
          args: ['-m', 'pytest', `${normalizedFilePath}::${suite.name}`],
        });

        children.push({
          id: `test-suite:${normalizedFilePath}:${suite.name}`,
          label: suite.name,
          kind: 'suite',
          filePath: normalizedFilePath,
          runnableTargetId: suiteTarget.id,
          children: suite.cases.map((testCase) => {
            const pytestNode = testCase.paramLabel
              ? `${suite.name}::${testCase.name}[${testCase.paramLabel}]`
              : `${suite.name}::${testCase.name}`;
            const caseTarget = this.runProfileService.registerAdHocTarget({
              rootPath,
              label: `${path.basename(normalizedFilePath)}::${pytestNode}`,
              detail: `python -m pytest ${path.basename(normalizedFilePath)}::${pytestNode}`,
              kind: 'test',
              languageId: 'python',
              workingDirectory: rootPath,
              filePath: normalizedFilePath,
              command: resolveExecutable('python'),
              args: ['-m', 'pytest', `${normalizedFilePath}::${pytestNode}`],
            });

            return {
              id: `test-case:${normalizedFilePath}:${suite.name}:${pytestNode}`,
              label: testCase.paramLabel ? `${testCase.name}[${testCase.paramLabel}]` : testCase.name,
              kind: 'case' as const,
              filePath: normalizedFilePath,
              runnableTargetId: caseTarget.id,
            };
          }),
        });
      }

      for (const testCase of pythonStructure.cases) {
        const pytestNode = testCase.paramLabel
          ? `${testCase.name}[${testCase.paramLabel}]`
          : testCase.name;
        const caseTarget = this.runProfileService.registerAdHocTarget({
          rootPath,
          label: `${path.basename(normalizedFilePath)}::${pytestNode}`,
          detail: `python -m pytest ${path.basename(normalizedFilePath)}::${pytestNode}`,
          kind: 'test',
          languageId: 'python',
          workingDirectory: rootPath,
          filePath: normalizedFilePath,
          command: resolveExecutable('python'),
          args: ['-m', 'pytest', `${normalizedFilePath}::${pytestNode}`],
        });

        children.push({
          id: `test-case:${normalizedFilePath}:${pytestNode}`,
          label: pytestNode,
          kind: 'case',
          filePath: normalizedFilePath,
          runnableTargetId: caseTarget.id,
        });
      }

      return {
        id: `test:${normalizedFilePath}`,
        label: path.basename(normalizedFilePath),
        kind: 'file',
        filePath: normalizedFilePath,
        runnableTargetId: fileTarget.id,
        children,
      };
    }

    if (normalizedFilePath.endsWith('_test.go')) {
      const relativeDirectory = path.relative(rootPath, path.dirname(normalizedFilePath)) || '.';
      const goPackageArg = relativeDirectory === '.'
        ? '.'
        : `./${relativeDirectory.split(path.sep).join('/')}`;
      const target = this.runProfileService.registerAdHocTarget({
        rootPath,
        label: path.basename(normalizedFilePath),
        detail: `go test ${goPackageArg}`,
        kind: 'test',
        languageId: 'go',
        workingDirectory: rootPath,
        filePath: normalizedFilePath,
        command: resolveExecutable('go'),
        args: ['test', goPackageArg],
      });
      const caseItems = parseGoTestCases(fileContent).map((testCase) => {
        const args = testCase.kind === 'benchmark'
          ? ['test', goPackageArg, '-run', '^$', '-bench', `^${testCase.name}$`]
          : ['test', goPackageArg, '-run', `^${testCase.name}$`];
        const caseTarget = this.runProfileService.registerAdHocTarget({
          rootPath,
          label: `${path.basename(normalizedFilePath)}:${testCase.name}`,
          detail: `go ${args.join(' ')}`,
          kind: 'test',
          languageId: 'go',
          workingDirectory: rootPath,
          filePath: normalizedFilePath,
          command: resolveExecutable('go'),
          args,
        });

        return {
          id: `test-case:${normalizedFilePath}:${testCase.name}`,
          label: testCase.name,
          kind: 'case' as const,
          filePath: normalizedFilePath,
          runnableTargetId: caseTarget.id,
        };
      });

      return {
        id: `test:${normalizedFilePath}`,
        label: path.basename(normalizedFilePath),
        kind: 'file',
        filePath: normalizedFilePath,
        runnableTargetId: target.id,
        children: caseItems,
      };
    }

    return null;
  }

  private async findCandidateTestFiles(rootPath: string): Promise<string[]> {
    const patterns = [
      'src/test/java/**/*Test.java',
      'src/test/java/**/*Tests.java',
      'src/test/java/**/*IT.java',
      'tests/**/*.py',
      '**/test_*.py',
      '**/*_test.py',
      '**/*_test.go',
    ];

    return await fg(patterns, {
      cwd: rootPath,
      absolute: true,
      onlyFiles: true,
      unique: true,
      ignore: [
        '**/.git/**',
        '**/node_modules/**',
        '**/target/**',
        '**/dist/**',
        '**/.venv/**',
        '**/venv/**',
        '**/__pycache__/**',
      ],
    });
  }
}

async function readTextFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

function deriveJavaClassName(rootPath: string, filePath: string): string | null {
  const sourceRoot = path.join(rootPath, 'src', 'test', 'java');
  const relativePath = path.relative(sourceRoot, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }

  return relativePath
    .replace(/\.java$/i, '')
    .split(path.sep)
    .join('.');
}

function isPythonTestFile(filePath: string): boolean {
  const baseName = path.basename(filePath);
  return baseName.startsWith('test_')
    || baseName.endsWith('_test.py')
    || filePath.split(path.sep).includes('tests');
}

function parseJavaTestCases(content: string): string[] {
  const matches = content.matchAll(/@(?:org\.junit\.)?(?:jupiter\.api\.)?Test[\s\S]{0,160}?\b(?:public|protected|private)?\s*(?:async\s+)?(?:void|[A-Za-z_$][A-Za-z0-9_$<>\[\]]*)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g);
  return Array.from(new Set(Array.from(matches, (match) => match[1])));
}

function parsePythonTestStructure(content: string): {
  suites: Array<{ name: string; cases: Array<{ name: string; paramLabel?: string }> }>;
  cases: Array<{ name: string; paramLabel?: string }>;
} {
  const suites: Array<{ name: string; cases: Array<{ name: string; paramLabel?: string }> }> = [];
  const topLevelCases: Array<{ name: string; paramLabel?: string }> = [];
  const lines = content.split(/\r?\n/);
  let currentSuite: { name: string; cases: Array<{ name: string; paramLabel?: string }> } | null = null;
  let currentSuiteIndent = 0;
  let pendingDecorators: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('@')) {
      pendingDecorators.push(trimmedLine);
      continue;
    }

    const classMatch = line.match(/^(\s*)class\s+(Test[A-Za-z0-9_]+)\b/);
    if (classMatch) {
      currentSuite = {
        name: classMatch[2],
        cases: [],
      };
      currentSuiteIndent = classMatch[1].length;
      suites.push(currentSuite);
      pendingDecorators = [];
      continue;
    }

    if (currentSuite) {
      const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
      if (trimmedLine && !trimmedLine.startsWith('@') && indent <= currentSuiteIndent) {
        currentSuite = null;
      }
    }

    const defMatch = line.match(/^(\s*)def\s+(test_[A-Za-z0-9_]+)\s*\(/);
    if (!defMatch) {
      if (trimmedLine) {
        pendingDecorators = [];
      }
      continue;
    }

    const indent = defMatch[1].length;
    const parameterLabels = extractPytestParameterLabels(pendingDecorators);
    const cases = parameterLabels.length > 0
      ? parameterLabels.map((paramLabel) => ({ name: defMatch[2], paramLabel }))
      : [{ name: defMatch[2] }];
    if (currentSuite && indent > currentSuiteIndent) {
      currentSuite.cases.push(...cases);
      pendingDecorators = [];
      continue;
    }

    topLevelCases.push(...cases);
    pendingDecorators = [];
  }

  return {
    suites: suites.map((suite) => ({
      name: suite.name,
      cases: deduplicatePythonCases(suite.cases),
    })),
    cases: deduplicatePythonCases(topLevelCases),
  };
}

function deduplicatePythonCases(cases: Array<{ name: string; paramLabel?: string }>) {
  const seen = new Set<string>();
  return cases.filter((testCase) => {
    const key = `${testCase.name}:${testCase.paramLabel ?? ''}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function extractPytestParameterLabels(decorators: string[]): string[] {
  const parametrizeDecorators = decorators.filter((decorator) => decorator.includes('parametrize'));
  if (parametrizeDecorators.length === 0) {
    return [];
  }

  const collectedLabels: string[] = [];
  for (const decorator of parametrizeDecorators) {
    const idsMatch = decorator.match(/ids\s*=\s*\[([^\]]+)\]/);
    if (idsMatch) {
      collectedLabels.push(...extractQuotedValues(idsMatch[1]));
      continue;
    }

    const valueMatches = Array.from(decorator.matchAll(/\(([^()]+)\)|["']([^"']+)["']|(\b\d+\b|\bTrue\b|\bFalse\b|\bNone\b)/g));
    const labels = valueMatches
      .map((match) => match[1] ?? match[2] ?? match[3] ?? '')
      .map((value) => value.replace(/["'\s]+/g, '').replace(/,+/g, '-'))
      .filter(Boolean);
    if (labels.length > 0) {
      collectedLabels.push(...labels.slice(1));
    }
  }

  return Array.from(new Set(collectedLabels));
}

function extractQuotedValues(value: string): string[] {
  return Array.from(value.matchAll(/["']([^"']+)["']/g), (match) => match[1]);
}

function parseGoTestCases(content: string): Array<{ name: string; kind: 'test' | 'benchmark' | 'example' }> {
  const matches = [
    ...Array.from(content.matchAll(/^func\s+(Test[A-Za-z0-9_]+)\s*\(\s*[A-Za-z0-9_]+\s+\*testing\.T\s*\)/gm), (match) => ({
      name: match[1],
      kind: 'test' as const,
    })),
    ...Array.from(content.matchAll(/^func\s+(Benchmark[A-Za-z0-9_]+)\s*\(\s*[A-Za-z0-9_]+\s+\*testing\.B\s*\)/gm), (match) => ({
      name: match[1],
      kind: 'benchmark' as const,
    })),
    ...Array.from(content.matchAll(/^func\s+(Example[A-Za-z0-9_]+)\s*\(\s*\)/gm), (match) => ({
      name: match[1],
      kind: 'example' as const,
    })),
  ];

  const seen = new Set<string>();
  return matches.filter((match) => {
    const key = `${match.kind}:${match.name}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function resolveExecutable(command: string): string {
  if (process.platform === 'win32') {
    if (command === 'mvn') {
      return 'mvn.cmd';
    }
    if (command === 'python') {
      return 'python.exe';
    }
    if (command === 'go') {
      return 'go.exe';
    }
  }

  return command;
}
