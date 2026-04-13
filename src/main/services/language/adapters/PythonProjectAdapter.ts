import path from 'path';
import type { CodePaneExternalLibrarySection } from '../../../../shared/types/electron-api';
import {
  createExternalLibraryRoot,
  createExternalLibrarySection,
  directoryExists,
  hasProjectIndicators,
  hasTopLevelExtension,
  listDirectoryNames,
  type LanguageProjectAdapter,
} from './LanguageProjectAdapter';

const PYTHON_PROJECT_INDICATORS = [
  'pyproject.toml',
  'requirements.txt',
  'setup.py',
  'setup.cfg',
  'Pipfile',
  'manage.py',
  '.venv',
  'venv',
  'env',
];

export class PythonProjectAdapter implements LanguageProjectAdapter {
  readonly languageId = 'python';

  async getExternalLibrarySection(workspaceRoot: string): Promise<CodePaneExternalLibrarySection | null> {
    const looksLikePythonProject = await hasProjectIndicators(workspaceRoot, PYTHON_PROJECT_INDICATORS)
      || await hasTopLevelExtension(workspaceRoot, '.py');
    if (!looksLikePythonProject) {
      return null;
    }

    const roots = [];
    const environmentRoots = [
      path.join(workspaceRoot, '.venv'),
      path.join(workspaceRoot, 'venv'),
      path.join(workspaceRoot, 'env'),
      process.env.VIRTUAL_ENV,
      process.env.CONDA_PREFIX,
    ].filter((value): value is string => Boolean(value));

    for (const environmentRoot of environmentRoots) {
      const normalizedEnvironmentRoot = path.resolve(environmentRoot);
      if (!await directoryExists(normalizedEnvironmentRoot)) {
        continue;
      }

      const windowsSitePackagesPath = path.join(normalizedEnvironmentRoot, 'Lib', 'site-packages');
      if (await directoryExists(windowsSitePackagesPath)) {
        roots.push(createExternalLibraryRoot(
          `python-site-packages-${roots.length + 1}`,
          'site-packages',
          windowsSitePackagesPath,
        ));
        roots.push(createExternalLibraryRoot(
          `python-stdlib-${roots.length + 1}`,
          'Standard Library',
          path.join(normalizedEnvironmentRoot, 'Lib'),
        ));
        continue;
      }

      const pythonLibRoot = path.join(normalizedEnvironmentRoot, 'lib');
      const pythonVersionDirectories = (await listDirectoryNames(pythonLibRoot))
        .filter((entryName) => /^python\d+(\.\d+)?$/i.test(entryName));

      for (const pythonVersionDirectory of pythonVersionDirectories) {
        const stdlibPath = path.join(pythonLibRoot, pythonVersionDirectory);
        const sitePackagesPath = path.join(stdlibPath, 'site-packages');
        if (await directoryExists(sitePackagesPath)) {
          roots.push(createExternalLibraryRoot(
            `python-site-packages-${roots.length + 1}`,
            'site-packages',
            sitePackagesPath,
          ));
          roots.push(createExternalLibraryRoot(
            `python-stdlib-${roots.length + 1}`,
            'Standard Library',
            stdlibPath,
          ));
        }
      }
    }

    return createExternalLibrarySection('python-external-libraries', this.languageId, roots);
  }
}
