export const CODE_PANE_IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
]);

export const CODE_PANE_INDEX_SCHEMA_VERSION = 1;

export const CODE_PANE_INDEX_IGNORE_SIGNATURE = Array.from(CODE_PANE_IGNORED_DIRECTORY_NAMES)
  .sort()
  .join('|');
