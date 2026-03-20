const path = require('path');
const fs = require('fs');

exports.default = async function afterPack(context) {
  // 仅在 macOS 和 Linux 上执行
  const platform = context.electronPlatformName;
  if (platform === 'win32') return;

  const appOutDir = context.appOutDir;

  // 根据平台确定 resources 路径
  let resourcesDir;
  if (platform === 'darwin') {
    // macOS: AppName.app/Contents/Resources/
    const appName = context.packager.appInfo.productFilename;
    resourcesDir = path.join(appOutDir, `${appName}.app`, 'Contents', 'Resources');
  } else {
    // Linux: resources/
    resourcesDir = path.join(appOutDir, 'resources');
  }

  const binDir = path.join(resourcesDir, 'app.asar.unpacked', 'resources', 'bin');

  if (!fs.existsSync(binDir)) {
    console.log(`[after-pack] bin directory not found: ${binDir}, skipping`);
    return;
  }

  // 对所有 shim 文件添加执行权限
  const files = fs.readdirSync(binDir);
  for (const file of files) {
    const filePath = path.join(binDir, file);
    const stat = fs.statSync(filePath);
    if (stat.isFile() && !file.endsWith('.js') && !file.endsWith('.cmd')) {
      fs.chmodSync(filePath, 0o755);
      console.log(`[after-pack] chmod +x: ${filePath}`);
    }
  }
};
