"""Join validated native scene renders and the existing stereo soundtrack."""
import argparse
import json
from pathlib import Path
import subprocess


def probe(path):
    return json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-count_frames', '-show_streams',
        '-show_format', '-of', 'json', str(path)]))


def assemble(root, audio, output):
    timeline = json.loads((root / 'episode-timeline.json').read_text())
    fps = timeline['fps']
    total = 0
    lines = []
    for scene in timeline['scenes']:
        name = f"scene-{scene['id']}.mp4"
        path = root / 'render' / name
        info = probe(path)
        video = next(s for s in info['streams'] if s['codec_type'] == 'video')
        expected = round(scene['duration'] * fps)
        if int(video['nb_read_frames']) != expected:
            raise RuntimeError(f'{name}: incomplete scene render')
        total += expected
        lines.append(f"file '{name}'")
    concat = root / 'render' / 'episode.ffconcat'
    concat.write_text('ffconcat version 1.0\n' + '\n'.join(lines) + '\n')
    output.parent.mkdir(parents=True, exist_ok=True)
    partial = output.with_suffix('.partial.mp4')
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-xerror', '-y',
        '-f', 'concat', '-safe', '1', '-i', str(concat), '-i', str(audio),
        '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac',
        '-profile:a', 'aac_low', '-b:a', '192k', '-ar', '44100', '-ac', '2', '-t', str(total / fps),
        '-disposition:a:0', 'default', '-metadata:s:a:0', 'language=eng',
        '-metadata:s:a:0', 'handler_name=Gunner N Pals Stereo Sound',
        '-metadata', 'title=Gunner N Pals: The Kitten in the Old Oak',
        '-metadata', 'comment=Authored with native Armature 2D rigs and layered SVG artwork',
        '-movflags', '+faststart', str(partial)], check=True)
    info = probe(partial)
    video = next(s for s in info['streams'] if s['codec_type'] == 'video')
    sound = next(s for s in info['streams'] if s['codec_type'] == 'audio')
    assert int(video['nb_read_frames']) == total
    assert (video['width'], video['height']) == (1920, 1080)
    assert video['r_frame_rate'] == f'{fps}/1'
    assert sound['channels'] == 2 and int(sound['sample_rate']) == 44100
    assert abs(float(video['duration']) - total / fps) < 0.01
    subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(partial),
                    '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'], check=True)
    partial.replace(output)
    report = {'frames': total, 'duration': total / fps, 'fps': fps,
              'width': 1920, 'height': 1080, 'audio': 'AAC-LC stereo 44.1 kHz, default English track',
              'full_decode': 'passed', 'scenes': len(timeline['scenes'])}
    (root / 'qa' / 'episode-verification.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('project', type=Path)
    parser.add_argument('audio', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    assemble(args.project, args.audio, args.output)
