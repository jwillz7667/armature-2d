"""Tighten the edit and direct gaze, reactions and mouth timing from dialogue."""
import argparse
import bisect
import copy
import json
import math
from pathlib import Path
import subprocess
import numpy as np
from scipy.io import wavfile

W, H, FPS, SR = 1920, 1080, 24, 48000
RECIPIENTS = {
 '01':['Gunner','Eugene','Gunner','Eugene','branch','Gunner'],
 '02':['audience']*5,
 '03':['Kitten','Gunner','Gunner','Kitten','Kitten','Gunner'],
 '04':['Gunner','Eugene','Gunner','Eugene','Gunner','Eugene','Maple'],
 '05':['Gunner','Kitten','Gunner','Kitten','Gunner','Maple'],
 '06':['Gunner','Gunner','Kitten','Gunner','Maple','Gunner','Kitten'],
 '07':['Eugene','Gunner','Gunner','George','Gunner','George'],
 '08':['Gunner','Eugene','Oakley','Eugene','Oakley','Gunner'],
 '09':['Gunner','George','Kitten','duck','Gunner','Kitten'],
 '10':['Kitten','Gunner','Kitten','Kitten','GeorgeClimb','Kitten','Kitten'],
 '11':['Mama','Kitten','Gunner','Kitten','Oakley','Eugene','Gunner'],
 '12':['Maple','Gunner','Maple','Oakley','Eugene','Oakley','Gunner','audience'],
}
# Intentional dialogue coverage. Action shots and branch geography retain the
# established wide framing; these cuts provide close views of real exchanges.
COVERAGE = {
 '01':{1:['Gunner','Eugene'],2:['Gunner','Eugene'],3:['Maple','Eugene']},
 '03':{2:['Gunner','Eugene'],4:['Gunner','Maple'],5:['Gunner','Maple']},
 '06':{2:['Gunner','Eugene'],3:['Gunner','Eugene'],4:['Gunner','Maple'],5:['Gunner','Maple']},
 '07':{3:['Gunner','George'],4:['Gunner','George'],5:['Gunner','George']},
 '08':{0:['Gunner','George'],1:['Eugene','Oakley'],2:['Eugene','Oakley'],3:['Eugene','Oakley'],4:['Gunner','Oakley'],5:['Gunner','Oakley']},
 '11':{2:['Kitten','Gunner'],3:['Kitten','Gunner'],4:['Eugene','Oakley'],5:['Eugene','Oakley'],6:['Gunner','George']},
 '12':{0:['Gunner','Maple'],1:['Gunner','Maple'],2:['Gunner','Maple'],3:['Eugene','Oakley'],4:['Eugene','Oakley'],5:['Eugene','Oakley']},
}


def clamp(x, a=0, b=1):return max(a, min(b, x))
def smooth(x):x=clamp(x);return x*x*(3-2*x)
def pulse(t, start, duration):return math.sin(math.pi*clamp((t-start)/duration))**2 if start<t<start+duration else 0


def read_audio(path, channels=1):
    raw = subprocess.check_output(['ffmpeg','-v','error','-i',str(path),'-ac',str(channels),'-ar',str(SR),'-f','f32le','-'])
    return np.frombuffer(raw, dtype='<f4').reshape(-1, channels).copy()


def source_frame(frames, time):
    index = min(len(frames)-1, max(0, int(time*12)))
    f = copy.deepcopy(frames[index])
    if index+1 < len(frames):
        other=frames[index+1];alpha=clamp((time-frames[index]['t'])*12)
        for name, p in f['actors'].items():
            q=other['actors'].get(name)
            if q and p.get('flip')==q.get('flip'):
                for key in ['x','y','h','rootAngle','torsoAngle','torsoY']:
                    if key in p and key in q:p[key]=p[key]+(q[key]-p[key])*alpha
    return f


def eye_point(name, actors, cast):
    if name not in actors:
        return {'branch':(.67*W,.22*H),'Kitten':(.65*W,.22*H),'Mama':(.95*W,.66*H),'duck':(.76*W,.9*H)}.get(name, (.5*W,.5*H))
    p=actors[name];c=cast[name];eyes=[q['pivot'] for q in c['parts'] if q['id'].startswith('eye-')]
    x=sum(q[0] for q in eyes)/len(eyes);y=sum(q[1] for q in eyes)/len(eyes)
    scale=p['h']*H/c['height'];sign=-1 if p.get('flip') else 1
    return p['x']*W+(x-c['width']/2)*scale*sign, p['y']*H+(y-c['height'])*scale


def camera_for(names, actors, cast):
    if not all(n in actors for n in names):return None
    bounds=[]
    for n in names:
        p=actors[n];c=cast[n];half=p['h']*H*c['width']/c['height']/W*.5
        bounds.append((p['x']-half,p['y']-p['h'],p['x']+half,p['y']))
    left=min(b[0] for b in bounds)-.06;right=max(b[2] for b in bounds)+.06
    top=min(b[1] for b in bounds)-.055;bottom=max(b[3] for b in bounds)+.035
    z=max(1,min(1.75,1/(right-left),1/(bottom-top)))
    camera_left=clamp((left+right)/2-.5/z,0,1-1/z)
    focus_left=min(b[0] for b in bounds);focus_right=max(b[2] for b in bounds)
    minimum,maximum=0,1-1/z
    for n,p in actors.items():
        if n in names:continue
        c=cast[n];half=p['h']*H*c['width']/c['height']/W*.5
        a,b=p['x']-half,p['x']+half
        if b<focus_left-.018:minimum=max(minimum,b+.015)
        elif a>focus_right+.018:maximum=min(maximum,a-.015-1/z)
    if minimum<=maximum:camera_left=clamp(camera_left,minimum,maximum)
    return [round(camera_left,5),round(clamp((top+bottom)/2-.5/z,0,1-1/z),5),round(z,5)]


def protect_branch_heads(frame):
    left,top,z=frame['camera']
    for name in ['Kitten','Pip']:
        p=frame['actors'].get(name)
        if p and p['y']<.4 and p['y']-p['h']<top<p['y'] and left<p['x']<left+1/z:
            frame['camera']=[0,0,1]
            break


def run(root):
    production=root/'source-edit' if (root/'source-edit/project/timeline.json').exists() else root.parent
    old=json.loads((production/'project/timeline.json').read_text())
    cast={c['name']:c for c in json.loads((root/'cast-assets.json').read_text())}
    original_mix=read_audio(production/'audio/final-mix.m4a',2)
    (root/'scene-controls').mkdir(exist_ok=True);(root/'audio').mkdir(exist_ok=True)
    manifest=[];new_scenes=[];captions=[];chunks=[];episode_start=0;report=[]
    for scene in old['scenes']:
        sid=scene['id'];lead=.55 if sid=='01' else .20
        tail={'02':.9,'06':.6,'10':.65,'12':1.75}.get(sid,.4)
        start_frame=round((scene['speech_offset']-lead)*FPS)
        source_begin=start_frame/FPS
        count=math.ceil((scene['speech_offset']+scene['audio_duration']+tail-source_begin)*FPS)
        duration=count/FPS;source_end=source_begin+duration
        timing=json.loads((production/scene['timing']).read_text())
        segments=timing['voice_segments'];alignment=timing['alignment']
        starts=[s['start_time_seconds'] for s in segments]
        char_times=alignment['character_start_times_seconds'];chars=alignment['characters']
        raw=read_audio(production/scene['audio'])[:,0]
        old_frames=json.loads((root/'source-controls'/f'scene-{sid}.json').read_text())['frames']
        frames=[];gaze_state={};camera_cache={}
        for fi in range(math.ceil(duration*12)+1):
            t=min(duration,fi/12);old_t=t+source_begin;st=old_t-scene['speech_offset']
            index=max(0,min(len(segments)-1,bisect.bisect_right(starts,st)-1))
            segment=segments[index];who=scene['lines'][index][0]
            if st<0 or st>scene['audio_duration']:who='Narrator'
            if who=='George' and sid=='10':who='GeorgeClimb'
            recipient=RECIPIENTS[sid][index]
            f=source_frame(old_frames,old_t);actors=f['actors'];f['t']=t;f['sourceTime']=old_t
            sound=raw[max(0,int((st-.025)*SR)):max(0,int((st+.025)*SR))]
            level=float(np.sqrt(np.mean(sound**2))) if len(sound) else 0
            ci=max(0,min(len(chars)-1,bisect.bisect_right(char_times,st)-1));char=chars[ci].lower()
            since=st-segment['start_time_seconds'];remaining=segment['end_time_seconds']-st
            for name,p in actors.items():
                seed=sum(map(ord,name))*.019
                if sid=='02' or sid=='12' and index==7:target='audience'
                elif name==who:target=recipient
                elif who=='Narrator':target='Kitten' if sid in ['10','11'] else 'Eugene' if sid=='04' else 'Gunner'
                else:target=who
                if name=='Mama' and sid=='11' and index<2:target='Kitten'
                if target==name:target=recipient if recipient!=name else 'Gunner' if name!='Gunner' else 'Eugene'
                if target=='Narrator':target='Gunner' if name!='Gunner' else 'Eugene'
                if target=='audience':gx,gy=0,0
                else:
                    own=eye_point(name,actors,cast);dest=eye_point(target,actors,cast)
                    dx,dy=dest[0]-own[0],dest[1]-own[1];length=max(1,math.hypot(dx,dy))
                    gx,gy=dx/length*(-1 if p.get('flip') else 1),dy/length
                previous=gaze_state.get(name,(gx,gy))
                gx=previous[0]+(gx-previous[0])*.72;gy=previous[1]+(gy-previous[1])*.72
                gaze_state[name]=(gx,gy)
                p['gazeX']=round(gx,4);p['gazeY']=round(gy,4);p['lookAt']=target
                special=sid=='04' and name=='Eugene' or sid=='10' and name=='GeorgeClimb'
                if not special:
                    pitch=-gy*5.5
                    accent=pulse(since,.15,.62)*1.2 if name==who else pulse(remaining,-.05,.4)*.45 if name==recipient else 0
                    p['headAngle']=pitch+accent
                    p['torsoY']=-.00065*math.sin((episode_start+t)*1.4+seed)
                    p['torsoAngle']=0
                    p['tailAngle']=(2.2 if name==who else .8)*math.sin(t*2.7+seed)
                    p['gesture']=.22*pulse(since,.3,1.15) if name==who and name in ['Gunner','Maple','George','Oakley'] and not p.get('walk') else 0
                # Short, smooth blinks are staggered per character. The pupil
                # inherits its eye's scale, so the pair closes together.
                phase=(episode_start+t+seed*2.2)%(3.8+(seed%1))
                blink=1
                if phase<.09:blink=1-.96*smooth(phase/.09)
                elif phase<.135:blink=.04
                elif phase<.245:blink=.04+.96*smooth((phase-.135)/.11)
                p['blink']=blink
                mouths=sum(q['id'].startswith('mouth-') for q in cast[name]['parts'])
                state=0
                if name==who and level>.008 and st>=0:
                    if mouths>=4:
                        state=3 if char in 'ouwq' else 0 if char in 'mpb' else 2 if char in 'aeiy' and level>.025 else 1
                    else:state=1
                p['mouth']=state
            focus=COVERAGE.get(sid,{}).get(index)
            if focus:
                if index not in camera_cache:camera_cache[index]=camera_for(focus,actors,cast)
                if camera_cache[index]:f['camera']=camera_cache[index]
            protect_branch_heads(f)
            frames.append(f)
        item={'id':sid,'start':episode_start,'duration':duration,'frames':frames,'lines':scene['lines'],'source_begin':source_begin,'source_end':source_end}
        (root/'scene-controls'/f'scene-{sid}.json').write_text(json.dumps(item,separators=(',',':'))+'\n')
        manifest.append({k:item[k] for k in ['id','start','duration']})
        new_scenes.append({**scene,'start':episode_start,'duration':duration,'speech_offset':scene['speech_offset']-source_begin})
        for cue in old['captions']:
            if scene['start']<=cue['start']<scene['start']+scene['duration']:
                captions.append({**cue,'start':max(episode_start,cue['start']-scene['start']-source_begin+episode_start),'end':min(episode_start+duration,cue['end']-scene['start']-source_begin+episode_start)})
        a=round((scene['start']+source_begin)*SR);b=a+count*(SR//FPS)
        chunk=original_mix[a:b].copy()
        chunk=np.pad(chunk,((0,max(0,b-a-len(chunk))),(0,0)))
        fade=round(SR*.018);chunk[:fade]*=np.linspace(0,1,fade)[:,None];chunk[-fade:]*=np.linspace(1,0,fade)[:,None]
        chunks.append(chunk)
        report.append({'scene':sid,'before':scene['duration'],'after':duration,'removed':scene['duration']-duration})
        episode_start+=duration
        print(f"Retimed scene {sid}: {duration:.2f}s; removed {scene['duration']-duration:.2f}s padding",flush=True)
    mix=np.concatenate(chunks);wavfile.write(root/'audio/revised-mix.wav',SR,np.asarray(np.clip(mix,-1,1)*32767,dtype=np.int16))
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(root/'audio/revised-mix.wav'),'-af','loudnorm=I=-16:TP=-1.5:LRA=9','-ar','44100','-ac','2','-c:a','aac','-profile:a','aac_low','-b:a','192k',str(root/'audio/final-mix.m4a')],check=True)
    (root/'episode-timeline.json').write_text(json.dumps({'fps':FPS,'duration':episode_start,'scenes':manifest},indent=2)+'\n')
    (root/'performance-timeline.json').write_text(json.dumps({**old,'duration':episode_start,'scenes':new_scenes,'captions':captions},indent=2)+'\n')
    def stamp(t):
        n=round(t*1000);return f'{n//3600000:02}:{n//60000%60:02}:{n//1000%60:02},{n%1000:03}'
    srt='\n\n'.join(f"{i+1}\n{stamp(c['start'])} --> {stamp(c['end'])}\n{c['text']}" for i,c in enumerate(captions))+'\n'
    (root/'script/Gunner-N-Pals-Pilot.en.srt').write_text(srt)
    (root/'qa/edit-review.json').write_text(json.dumps({'before':old['duration'],'after':episode_start,'removed_padding':old['duration']-episode_start,'scenes':report},indent=2)+'\n')


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('project',type=Path);run(p.parse_args().project)
