import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'mediapipe', 'models');

const assets = [
  {
    name: 'pose_landmarker_full.task',
    url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
  },
  {
    name: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  },
];

await mkdir(outDir, { recursive: true });

for (const asset of assets) {
  process.stdout.write(`Fetching ${asset.name}... `);

  const response = await fetch(asset.url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${asset.url}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const sizeMb = (bytes.byteLength / 1024 / 1024).toFixed(2);

  await writeFile(join(outDir, asset.name), bytes);

  console.log(`OK (${sizeMb} MB)`);
  console.log(`  url:    ${asset.url}`);
  console.log(`  sha256: ${sha256}`);
}