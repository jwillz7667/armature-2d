import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { renderFrame, renderSequence } from '../../../packages/render-preview/src/index';
import { decodePng } from '../../../packages/atlas-pack/src/index';
import { parseDocument } from '../../../packages/format/src/index';

const root = process.env.ARMATURE_PILOT_DIR;
if (!root) throw new Error('Set ARMATURE_PILOT_DIR');
const [sid, mode = 'video', ...times] = process.argv.slice(2);
if (!sid) throw new Error('Give a scene ID');
const dir = join(root, mode === 'stills' ? 'qa/scenes' : 'render');
mkdirSync(dir, { recursive: true });
const source =
  mode === 'stills'
    ? `scenes/Scene-${sid}.armature.json`
    : `render-input/Scene-${sid}.foreground.armature.json`;
const document = parseDocument(JSON.parse(readFileSync(join(root, source), 'utf8')), {
  verifyHash: true,
});
const pages = new Map(
  document.atlas.pages.map((p) => [p.file, decodePng(readFileSync(join(root, p.file)))]),
);
const atlas = { pages };
const viewport = { width: 1920, height: 1080, fit: { x: 0, y: 0, w: 1920, h: 1080 } };
if (mode === 'stills') {
  for (const time of times.map(Number)) {
    const began = Date.now();
    const result = renderFrame({ document, atlas, viewport, animation: 'pilot', time });
    writeFileSync(join(dir, `${sid}-${time}.png`), result.png);
    console.log(`Scene ${sid}, ${time}s: rendered native frame in ${Date.now() - began}ms`);
  }
} else {
  const frameCount = Math.round(document.animations.pilot!.duration * 24);
  const background = join(root, `render-background/scene-${sid}.mp4`);
  const output = join(dir, `scene-${sid}.mp4`);
  const partial = join(dir, `scene-${sid}.partial.mp4`);
  const encoder = spawn(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-xerror',
      '-y',
      '-i',
      background,
      '-f',
      'rawvideo',
      '-pixel_format',
      'rgba',
      '-video_size',
      '1920x1080',
      '-framerate',
      '24',
      '-i',
      'pipe:0',
      '-filter_complex',
      '[0:v][1:v]overlay=shortest=1:format=auto,format=yuv420p[v]',
      '-map',
      '[v]',
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '18',
      '-threads',
      '2',
      '-frames:v',
      String(frameCount),
      '-movflags',
      '+faststart',
      partial,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );
  const sequence = renderSequence({
    document,
    atlas,
    viewport,
    animation: 'pilot',
    fps: 24,
    to: { frame: frameCount },
  });
  const began = Date.now();
  try {
    for (const frame of sequence.frames()) {
      // RGBA belongs to a reused runtime scratch buffer. Copy before queuing an
      // asynchronous pipe write; advancing the generator would overwrite it.
      if (!encoder.stdin!.write(Buffer.from(frame.rgba))) await once(encoder.stdin!, 'drain');
      if (frame.index % 240 === 0) console.log(`Scene ${sid}: ${frame.index}/${frameCount} frames`);
    }
    encoder.stdin!.end();
    const [code] = await once(encoder, 'exit');
    if (code !== 0) throw new Error(`FFmpeg ${code}`);
  } catch (error) {
    encoder.kill('SIGTERM');
    throw error;
  }
  const count = Number(
    execFileSync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-count_frames',
        '-show_entries',
        'stream=nb_read_frames',
        '-of',
        'csv=p=0',
        partial,
      ],
      { encoding: 'utf8' },
    ).trim(),
  );
  if (count !== frameCount) throw new Error(`Expected ${frameCount} frames, decoded ${count}`);
  renameSync(partial, output);
  console.log(
    `Rendered scene ${sid}: ${frameCount} native frames in ${((Date.now() - began) / 1000).toFixed(1)}s`,
  );
}
