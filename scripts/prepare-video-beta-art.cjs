// Convert the existing app's own artwork, without altering the originals.
// node scripts/prepare-video-beta-art.cjs '/absolute/path/to/app/assets'
const sharp = require('sharp');
const path = require('node:path');
const fs = require('node:fs/promises');
const source = process.argv[2];
if (!source || !path.isAbsolute(source)) throw new Error('Provide the app assets directory as an absolute path.');
const output = path.resolve(__dirname, '../video-beta/assets');
const images = [['home-video-coast.png', 'coast', [640, 1280, 1536]], ['home-photo-petals.png', 'petals', [640]], ['home-game-world.png', 'world', [640]]];
(async () => {
  await fs.mkdir(output, { recursive: true });
  for (const [filename, name, widths] of images) {
    for (const width of widths) {
      const target = path.join(output, `${name}-${width}.webp`);
      await sharp(path.join(source, filename)).resize({ width, withoutEnlargement: true }).webp({ quality: 83 }).toFile(target);
      console.log(path.basename(target), (await fs.stat(target)).size);
    }
  }
  await sharp(path.join(source, 'home-video-coast.png')).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(output, 'coast-1536.jpg'));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
