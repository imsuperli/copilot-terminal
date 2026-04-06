// The custom addon-fit tgz currently ships only the ESM bundle.
// Import the concrete module path so Vite/Vitest do not try to resolve
// the missing CommonJS entry declared in the package metadata.
// @ts-expect-error The custom tgz exposes only the ESM entry; a local wrapper keeps
// runtime resolution stable without changing package metadata.
export { FitAddon } from '@xterm/addon-fit/lib/addon-fit.mjs';
