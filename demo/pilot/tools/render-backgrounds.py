"""Render the fixed camera cuts for offline compositing beneath native rigs."""
import argparse
from bisect import bisect_right
from pathlib import Path
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

def render(root,sid):
    data=json.loads((root/f'scene-controls/scene-{sid}.json').read_text())
    out=root/'render-background';out.mkdir(exist_ok=True)
    frames=data['frames'];sources={};shots=[];last=None
    for f in frames:
        key=(f['set'],*f['camera'])
        if key!=last:shots.append((f['t'],key));last=key
    count=round(data['duration']*24)
    output=out/f'scene-{sid}.mp4';temporary=out/f'scene-{sid}.partial.mp4'
    proc=subprocess.Popen(['ffmpeg','-hide_banner','-v','error','-xerror','-y',
      '-f','rawvideo','-pix_fmt','rgb24','-s','1920x1080','-r','24','-i','pipe:0',
      '-frames:v',str(count),'-an','-c:v','libx264','-preset','veryfast','-crf','18',
      '-pix_fmt','yuv420p','-threads','2','-movflags','+faststart',str(temporary)],stdin=subprocess.PIPE)
    times=[f['t'] for f in frames];cache={}
    try:
        for n in range(count):
            f=frames[max(0,bisect_right(times,n/24)-1)]
            name=f['set'];l,t,z=f['camera'];key=(name,l,t,z)
            if key not in cache:
                if name not in sources:sources[name]=Image.open(root/f'source-layers/scene/background-{name}.png').convert('RGB')
                image=sources[name].crop((round(l*1920),round(t*1080),round((l+1/z)*1920),round((t+1/z)*1080))).resize((1920,1080),Image.Resampling.LANCZOS)
                cache[key]=image.tobytes()
            proc.stdin.write(cache[key])
        proc.stdin.close()
        if proc.wait():raise RuntimeError(f'Background {sid} encoder failed')
    except BaseException:
        proc.kill();proc.wait();raise
    info=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=nb_frames','-of','json',str(temporary)]))
    actual=int(info['streams'][0]['nb_frames'])
    if actual!=count:raise RuntimeError(f'Background {sid}: expected {count} frames, got {actual}')
    temporary.replace(output)
    print('Background',sid,count,'frames',flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('project',type=Path);p.add_argument('scenes',nargs='*');a=p.parse_args()
    scenes=a.scenes or [s['id'] for s in json.loads((a.project/'episode-timeline.json').read_text())['scenes']]
    with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(lambda sid:render(a.project,sid),scenes))
