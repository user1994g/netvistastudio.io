#!/usr/bin/env node
'use strict';

// Mechanical optimization only: no crops, color adjustments, or source overwrites.
// Requires Node.js and sharp. Run from anywhere:
//   node scripts/optimize-public-images.cjs
//   node scripts/optimize-public-images.cjs --check
// NODE_PATH may point to a shared/bundled node_modules directory containing sharp.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const checkOnly = process.argv.includes('--check');
const widths = [640, 1280, 1672];
const artwork = [
  { source: 'editor/assets/studio-room.png', stem: 'editor/assets/studio-room' },
  { source: 'assets/images/brand/studio-pixel-night.png', stem: 'assets/images/brand/studio-pixel-night' },
];
const iconSource = 'assets/images/photos/netvistastudio-logo.png';
const icons = [32, 48].map((size) => ({
  source: iconSource,
  target: `assets/images/brand/favicon-${size}.png`,
  width: size,
  height: size,
  format: 'png',
}));

async function digest(relativePath) {
  const buffer = await fs.readFile(path.join(root, relativePath));
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function main() {
  const sourcePaths = [...artwork.map((image) => image.source), iconSource];
  const originalDigests = new Map(await Promise.all(sourcePaths.map(async (source) => [source, await digest(source)])));
  const outputs = [];

  for (const image of artwork) {
    const metadata = await sharp(path.join(root, image.source)).metadata();
    assert.equal(metadata.width, 1672, `${image.source}: unexpected source width`);
    assert.equal(metadata.height, 941, `${image.source}: unexpected source height`);
    for (const width of widths) {
      outputs.push({
        source: image.source,
        target: `${image.stem}-${width}.webp`,
        width,
        height: Math.round(metadata.height * width / metadata.width),
        format: 'webp',
      });
    }
    outputs.push({
      source: image.source,
      target: `${image.stem}-1672.jpg`,
      width: metadata.width,
      height: metadata.height,
      format: 'jpeg',
    });
  }
  outputs.push(...icons);

  for (const output of outputs) {
    const destination = path.join(root, output.target);
    assert.notEqual(destination, path.join(root, output.source), 'Source images must never be overwritten');
    if (!checkOnly) {
      const image = sharp(path.join(root, output.source)).resize({
        width: output.width,
        withoutEnlargement: true,
      });
      if (output.format === 'webp') image.webp({ quality: 84, effort: 6, smartSubsample: true });
      if (output.format === 'jpeg') image.jpeg({ quality: 84, mozjpeg: true });
      if (output.format === 'png') image.png({ compressionLevel: 9, effort: 10 });
      await image.toFile(destination);
    }
    const actual = await sharp(destination).metadata();
    assert.equal(actual.width, output.width, `${output.target}: incorrect width`);
    assert.equal(actual.height, output.height, `${output.target}: incorrect height`);
    assert.equal(actual.format, output.format, `${output.target}: incorrect encoding`);
    const [optimized, original] = await Promise.all([
      fs.stat(destination), fs.stat(path.join(root, output.source)),
    ]);
    assert.ok(optimized.size < original.size, `${output.target}: optimization increased file size`);
    const reduction = (100 * (1 - optimized.size / original.size)).toFixed(1);
    console.log(`${output.target}\t${actual.width}x${actual.height}\t${optimized.size} bytes\t${reduction}% smaller`);
  }

  for (const source of sourcePaths) {
    assert.equal(await digest(source), originalDigests.get(source), `${source}: original was modified`);
  }
  console.log(`${checkOnly ? 'Verified' : 'Generated and verified'} ${outputs.length} assets; all original source files are unchanged.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
