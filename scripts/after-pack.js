const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

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

  const binDir = path.join(resourcesDir, 'app.asar.unpacked', 'resources', 'bin');

  if (fs.existsSync(binDir)) {
    const files = fs.readdirSync(binDir);
    for (const file of files) {
      const filePath = path.join(binDir, file);
      const stat = fs.statSync(filePath);
      if (stat.isFile() && !file.endsWith('.js') && !file.endsWith('.cmd')) {
        fs.chmodSync(filePath, 0o755);
        console.log(`[after-pack] chmod +x: ${filePath}`);
      }
    }
  } else {
    console.log(`[after-pack] bin directory not found: ${binDir}, skipping`);
  }

  // ---- 2. macOS ad-hoc 签名 ----
  if (platform === 'darwin') {
    const appPath = path.join(
      appOutDir,
      `${context.packager.appInfo.productFilename}.app`
    );

    console.log(`[after-pack] Ad-hoc signing: ${appPath}`);
    execSync(
      `codesign --force --deep --sign - --entitlements "${path.resolve(__dirname, '../resources/entitlements.mac.plist')}" "${appPath}"`,
      { stdio: 'inherit' }
    );
  }
};
