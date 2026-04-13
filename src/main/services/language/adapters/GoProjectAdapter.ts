import path from 'path';
import { homedir } from 'os';
import type { CodePaneExternalLibrarySection } from '../../../../shared/types/electron-api';
import {
  createExternalLibraryRoot,
  createExternalLibrarySection,
  directoryExists,
  hasProjectIndicators,
  hasTopLevelExtension,
  type LanguageProjectAdapter,
} from './LanguageProjectAdapter';

const GO_PROJECT_INDICATORS = [
  'go.mod',
  'go.work',
  'vendor',
];

export class GoProjectAdapter implements LanguageProjectAdapter {
  readonly languageId = 'go';

  async getExternalLibrarySection(workspaceRoot: string): Promise<CodePaneExternalLibrarySection | null> {
    const looksLikeGoProject = await hasProjectIndicators(workspaceRoot, GO_PROJECT_INDICATORS)
      || await hasTopLevelExtension(workspaceRoot, '.go');
    if (!looksLikeGoProject) {
      return null;
    }

    const roots = [];
    const vendorPath = path.join(workspaceRoot, 'vendor');
    if (await directoryExists(vendorPath)) {
      roots.push(createExternalLibraryRoot(
        'go-vendor',
        'Vendor',
        vendorPath,
      ));
    }

    const goModuleCachePath = process.env.GOMODCACHE
      ? path.resolve(process.env.GOMODCACHE)
      : path.join(homedir(), 'go', 'pkg', 'mod');
    if (await directoryExists(goModuleCachePath)) {
      roots.push(createExternalLibraryRoot(
        'go-module-cache',
        'Module Cache',
        goModuleCachePath,
      ));
    }

    const goRootSrcPath = getGoRootSourcePath();
    if (goRootSrcPath && await directoryExists(goRootSrcPath)) {
      roots.push(createExternalLibraryRoot(
        'go-stdlib',
        'Go Standard Library',
        goRootSrcPath,
      ));
    }

    return createExternalLibrarySection('go-external-libraries', this.languageId, roots);
  }
}

function getGoRootSourcePath(): string | null {
  if (process.env.GOROOT) {
    return path.join(process.env.GOROOT, 'src');
  }

  if (process.platform === 'win32') {
    return path.join('C:\\', 'Program Files', 'Go', 'src');
  }

  return path.join('/usr', 'local', 'go', 'src');
}
