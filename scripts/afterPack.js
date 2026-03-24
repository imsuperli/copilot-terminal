const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );

  // 设置 tmux shim 文件的执行权限
  const tmuxShimDir = path.join(
    appPath,
    'Contents/Resources/app.asar.unpacked/resources/bin'
  );
  const tmuxShimPath = path.join(tmuxShimDir, 'tmux');

  if (fs.existsSync(tmuxShimPath)) {
    console.log(`Setting executable permission for tmux shim: ${tmuxShimPath}`);
    fs.chmodSync(tmuxShimPath, 0o755);
  }

  console.log(`Ad-hoc signing: ${appPath}`);
  execSync(
    `codesign --force --deep --sign - --entitlements "${path.resolve(__dirname, '../resources/entitlements.mac.plist')}" "${appPath}"`,
    { stdio: 'inherit' }
  );
};
