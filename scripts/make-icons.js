#!/usr/bin/env node
// Rasterises assets/*.svg into every size the two platforms want:
//   build/icon.icns  macOS app icon (via iconutil)
//   build/icon.ico   Windows app icon
//   build/icon.png   1024px master, also used by electron-builder
//   assets/tray/*    tray glyphs, template-style on macOS
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

const root = path.join(__dirname, '..');
const buildDir = path.join(root, 'build');
const trayDir = path.join(root, 'assets', 'tray');

const render = (svg, size, out) =>
  sharp(path.join(root, 'assets', svg))
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(out);

async function main() {
  fs.mkdirSync(buildDir, { recursive: true });
  fs.mkdirSync(trayDir, { recursive: true });

  await render('icon.svg', 1024, path.join(buildDir, 'icon.png'));

  // Windows .ico — 256 is the largest entry the format takes.
  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoFiles = [];
  for (const size of icoSizes) {
    const file = path.join(buildDir, `.ico-${size}.png`);
    await render('icon.svg', size, file);
    icoFiles.push(file);
  }
  fs.writeFileSync(path.join(buildDir, 'icon.ico'), await pngToIco(icoFiles));
  icoFiles.forEach((f) => fs.unlinkSync(f));

  // macOS .icns via iconutil, which only exists on macOS. On Windows the
  // committed .icns is used as-is rather than failing the build.
  if (process.platform === 'darwin') {
    const iconset = path.join(buildDir, 'icon.iconset');
    fs.rmSync(iconset, { recursive: true, force: true });
    fs.mkdirSync(iconset);
    const pairs = [
      [16, 'icon_16x16.png'], [32, 'icon_16x16@2x.png'],
      [32, 'icon_32x32.png'], [64, 'icon_32x32@2x.png'],
      [128, 'icon_128x128.png'], [256, 'icon_128x128@2x.png'],
      [256, 'icon_256x256.png'], [512, 'icon_256x256@2x.png'],
      [512, 'icon_512x512.png'], [1024, 'icon_512x512@2x.png'],
    ];
    for (const [size, name] of pairs) await render('icon.svg', size, path.join(iconset, name));
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(buildDir, 'icon.icns')]);
    fs.rmSync(iconset, { recursive: true, force: true });
  } else {
    console.log('skipping .icns — iconutil is macOS-only, using the committed file');
  }

  // Tray glyphs. macOS wants a black-on-transparent "Template" image at 16pt;
  // Windows has no such convention, so it gets the full-colour app icon.
  for (const [svg, base] of [['tray.svg', 'trayTemplate'], ['tray-paused.svg', 'trayPausedTemplate']]) {
    await render(svg, 16, path.join(trayDir, `${base}.png`));
    await render(svg, 32, path.join(trayDir, `${base}@2x.png`));
  }
  await render('icon.svg', 32, path.join(trayDir, 'tray-win.png'));
  await render('icon.svg', 32, path.join(trayDir, 'tray-win-paused.png'));

  console.log('icons written to build/ and assets/tray/');
}

main().catch((err) => { console.error(err); process.exit(1); });
