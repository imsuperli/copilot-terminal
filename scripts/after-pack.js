const path = require('path');
const fs = require('fs');

function chmodExecutableIfPresent(filePath) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    return false;
  }

  fs.chmodSync(filePath, 0o755);
  console.log(`[after-pack] chmod +x: ${filePath}`);
  return true;
}

function ensureExecutableBits(resourcesDir, platform) {
  const unpackedRoot = path.join(resourcesDir, 'app.asar.unpacked');

  // 1. Shim binaries under resources/bin.
  const binDir = path.join(unpackedRoot, 'resources', 'bin');
  if (fs.existsSync(binDir)) {
    const files = fs.readdirSync(binDir);
    for (const file of files) {
      const filePath = path.join(binDir, file);
      if (!file.endsWith('.js') && !file.endsWith('.cmd')) {
        chmodExecutableIfPresent(filePath);
      }
    }
  } else {
    console.log(`[after-pack] bin directory not found: ${binDir}, skipping`);
  }

  // 2. node-pty macOS prebuilt spawn-helper.
  if (platform === 'darwin') {
    const helperRoots = [
      path.join(unpackedRoot, 'node_modules', 'node-pty', 'prebuilds', 'darwin-arm64', 'spawn-helper'),
      path.join(unpackedRoot, 'node_modules', 'node-pty', 'prebuilds', 'darwin-x64', 'spawn-helper'),
    ];

    let foundHelper = false;
    for (const helperPath of helperRoots) {
      foundHelper = chmodExecutableIfPresent(helperPath) || foundHelper;
    }

    if (!foundHelper) {
      console.log('[after-pack] node-pty spawn-helper not found in darwin prebuilds, skipping');
    }
  }
}

exports.default = async function afterPack(context) {
  const platform = context.electronPlatformName;
  if (platform === 'win32') return;

  const appOutDir = context.appOutDir;

  // ---- 1. 为 shim 文件添加执行权限（macOS + Linux） ----
  let resourcesDir;
  if (platform === 'darwin') {
    const appName = context.packager.appInfo.productFilename;
    resourcesDir = path.join(appOutDir, `${appName}.app`, 'Contents', 'Resources');
  } else {
    resourcesDir = path.join(appOutDir, 'resources');
  }

  ensureExecutableBits(resourcesDir, platform);
};

exports.ensureExecutableBits = ensureExecutableBits;
