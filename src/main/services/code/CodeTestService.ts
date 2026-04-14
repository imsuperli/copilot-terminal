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
          children: suite.cases.map((caseName) => {
            const caseTarget = this.runProfileService.registerAdHocTarget({
              rootPath,
              label: `${path.basename(normalizedFilePath)}::${suite.name}::${caseName}`,
              detail: `python -m pytest ${path.basename(normalizedFilePath)}::${suite.name}::${caseName}`,
              kind: 'test',
              languageId: 'python',
              workingDirectory: rootPath,
              filePath: normalizedFilePath,
              command: resolveExecutable('python'),
              args: ['-m', 'pytest', `${normalizedFilePath}::${suite.name}::${caseName}`],
            });

            return {
              id: `test-case:${normalizedFilePath}:${suite.name}:${caseName}`,
              label: caseName,
              kind: 'case' as const,
              filePath: normalizedFilePath,
              runnableTargetId: caseTarget.id,
            };
          }),
        });
      }

      for (const caseName of pythonStructure.cases) {
        const caseTarget = this.runProfileService.registerAdHocTarget({
          rootPath,
          label: `${path.basename(normalizedFilePath)}::${caseName}`,
          detail: `python -m pytest ${path.basename(normalizedFilePath)}::${caseName}`,
          kind: 'test',
          languageId: 'python',
          workingDirectory: rootPath,
          filePath: normalizedFilePath,
          command: resolveExecutable('python'),
          args: ['-m', 'pytest', `${normalizedFilePath}::${caseName}`],
        });

        children.push({
          id: `test-case:${normalizedFilePath}:${caseName}`,
          label: caseName,
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
      const caseItems = parseGoTestCases(fileContent).map((caseName) => {
        const caseTarget = this.runProfileService.registerAdHocTarget({
          rootPath,
          label: `${path.basename(normalizedFilePath)}:${caseName}`,
          detail: `go test ${goPackageArg} -run ^${caseName}$`,
          kind: 'test',
          languageId: 'go',
          workingDirectory: rootPath,
          filePath: normalizedFilePath,
          command: resolveExecutable('go'),
          args: ['test', goPackageArg, '-run', `^${caseName}$`],
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
  suites: Array<{ name: string; cases: string[] }>;
  cases: string[];
} {
  const suites: Array<{ name: string; cases: string[] }> = [];
  const topLevelCases: string[] = [];
  const lines = content.split(/\r?\n/);
  let currentSuite: { name: string; cases: string[] } | null = null;
  let currentSuiteIndent = 0;

  for (const line of lines) {
    const classMatch = line.match(/^(\s*)class\s+(Test[A-Za-z0-9_]+)\b/);
    if (classMatch) {
      currentSuite = {
        name: classMatch[2],
        cases: [],
      };
      currentSuiteIndent = classMatch[1].length;
      suites.push(currentSuite);
      continue;
    }

    if (currentSuite) {
      const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('@') && indent <= currentSuiteIndent) {
        currentSuite = null;
      }
    }

    const defMatch = line.match(/^(\s*)def\s+(test_[A-Za-z0-9_]+)\s*\(/);
    if (!defMatch) {
      continue;
    }

    const indent = defMatch[1].length;
    if (currentSuite && indent > currentSuiteIndent) {
      currentSuite.cases.push(defMatch[2]);
      continue;
    }

    topLevelCases.push(defMatch[2]);
  }

  return {
    suites: suites.map((suite) => ({
      name: suite.name,
      cases: Array.from(new Set(suite.cases)),
    })),
    cases: Array.from(new Set(topLevelCases)),
  };
}

function parseGoTestCases(content: string): string[] {
  const matches = content.matchAll(/^func\s+(Test[A-Za-z0-9_]+)\s*\(\s*[A-Za-z0-9_]+\s+\*testing\.T\s*\)/gm);
  return Array.from(new Set(Array.from(matches, (match) => match[1])));
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
