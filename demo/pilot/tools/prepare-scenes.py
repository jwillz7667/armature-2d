"""Carry the approved story/audio timing into editable Armature scene controls.

The existing production supplies the soundtrack, dialogue alignment, artwork and
camera plan. This exporter describes poses only; Armature authors and solves the
actual bones, IK and animation timelines through its native command layer.
"""
import argparse
import json
import math
from pathlib import Path
import sys
from PIL import Image, ImageDraw

def smooth(x):
    x=max(0,min(1,x));return x*x*(3-2*x)

def run(root):
    source=root.parent;sys.path.insert(0,str(source/'project'))
    import render_revised as old
    import render_episode as base
    out=root/'scene-controls';out.mkdir(exist_ok=True)
    extras=root/'source-layers/scene';extras.mkdir(parents=True,exist_ok=True)
    for name,img in base.BACKGROUNDS.items():img.convert('RGBA').save(extras/f'background-{name}.png')
    for name,img in base.PROPS.items():img.crop(img.getbbox()).save(extras/f'prop-{name}.png')
    shadow=Image.new('RGBA',(250,36));ImageDraw.Draw(shadow).ellipse((4,3,246,31),fill=(30,47,25,54));shadow.save(extras/'shadow.png')
    title=Image.new('RGBA',(1920,1080))
    base.text_center(title,'Gunner N Pals',100,145,'#ffd75d','#793c29',10)
    base.text_center(title,'The Kitten in the Old Oak',270,56,'#fff9e8','#704937',5)
    title.save(extras/'title.png')
    end=Image.new('RGBA',(1920,1080))
    base.text_center(end,'Every paw can help!',98,102,'#fff5bf','#734934',7)
    base.text_center(end,'See you next time!',235,58,'#ffffff','#734934',4)
    end.save(extras/'end-card.png')
    card=Image.new('RGBA',(1920,1080));d=ImageDraw.Draw(card)
    d.rounded_rectangle((85,65,414,139),radius=25,fill=(251,247,225,234));d.text((110,71),'Maple Hollow',font=base.font(45),fill='#4f6b3f');card.save(extras/'location-card.png')
    manifest=[]
    for scene in old.TIMELINE['scenes']:
        sid=scene['id'];duration=scene['duration'];frames=[]
        count=round(duration*12)
        for fi in range(count+1):
            t=min(duration,fi/12);gt=scene['start']+t
            _,who,st=base.active_segment(scene,t)
            actors=old.blocking(scene,t);cam=old.shot(scene,t,actors)
            setname=scene['set'];setname='tree' if setname=='branch' else setname
            if sid=='07':setname='tree' if t<old.cue(scene,3)-.55 else 'park'
            props=[]
            def prop(name,x,y,h,**kw):props.append(dict(name=name,x=x,y=y,h=h,**kw))
            if sid in ['09','10']:prop('ladder',.76,.88,.625)
            if sid=='05':prop('basket',.78,.91,.12);prop('notebook',.615,.95,.065)
            if sid=='09':
                prop('basket',.712,.90,.103);prop('blanket',.56,.944,.068);prop('notebook',.487,.937,.055)
            if sid in ['08','09']:prop('duck',.744,.927,.09)
            if sid in ['11','12']:prop('duck',.944,.912,.086)
            for name,a in actors.items():
                seed=sum(map(ord,name))*.019
                a['headAngle']=(1.7*math.sin(t*2.1+seed) if name==who else .35*math.sin(t*.7+seed))+(6.0 if a.get('look_up') else 0)
                a['tailAngle']=(5 if name==who else 2)*math.sin(gt*3.2+seed)
                a['torsoY']=-.003*math.sin(gt*1.8+seed)
                a['torsoAngle']=0;a['rootAngle']=0
                a['mouth']=min(3,old.expression(scene,name,t,who,st)) if name==who else 0
                a['blink']=.04 if ((gt+seed)%5.3)<.15 else 1
                a['gesture']=0
                if name==who and name in ['Gunner','Maple','George','Oakley']:
                    a['gesture']=max(0,math.sin((st%3.1)/3.1*math.pi))*.18
                if a.get('walk'):a['gesture']=0
                # Foot targets and body movement replace the old whole-pose swaps.
                if sid=='04' and name=='Eugene':
                    a.update(h=.375,x=.414,y=.89,flip=True)
                    start=old.cue(scene,0)+.8;fall=old.cue(scene,4);recover=old.cue(scene,6)
                    if start<t<fall:
                        rise=smooth((t-start)/.8)
                        a.update(reach=rise,torsoY=-.038*rise,torsoAngle=4*rise,headAngle=9)
                    elif fall<=t<fall+.8:
                        q=smooth((t-fall)/.8)
                        a.update(x=.414-.068*q,y=.89,rootAngle=75*q,reach=1-q,headAngle=3)
                        prop('leaves',.475,.926,.16,front=True)
                    elif fall+.8<=t<recover:
                        a.update(x=.346,y=.895,rootAngle=75,headAngle=0,blink=1)
                        prop('leaves',.475,.926,.16,front=True)
                    elif t>=recover:
                        q=1-smooth((t-recover)/1.2)
                        a.update(x=.414-.068*q,rootAngle=75*q,headAngle=0)
                        prop('leaves',.49,.94,.12,front=True)
            if sid=='10':
                levels=[.483,.571,.666,.762,.88]
                progress=max(0,min(4,(t-old.cue(scene,6)-.35)/1.2))
                step_index=min(3,int(progress));u=progress-step_index
                gx,gh=.738,.44
                gy=levels[step_index]+(levels[step_index+1]-levels[step_index])*smooth(u)
                stepping=.05<u<.95
                a=dict(x=gx,y=gy,h=gh,flip=False,headAngle=4,tailAngle=1.2*math.sin(t*2),torsoY=0,torsoAngle=0,rootAngle=0,
                       blink=.04 if (gt%5.3)<.15 else 1,mouth=int(who=='George' and base.mouth(scene,'George',st,gt)>0),gesture=0,carry=True,step=stepping)
                a['climbProgress']=progress
                a['footY']={}
                for leg,start_phase in [('back-far',.02),('back-near',.49)]:
                    q=max(0,min(1,(u-start_phase)/.46))
                    foot=levels[step_index]+(levels[step_index+1]-levels[step_index])*smooth(q)-.009*math.sin(q*math.pi)
                    a['footY'][leg]=foot-gy
                actors['GeorgeClimb']=a
                # Both front paws support the rim; the basket and kitten share
                # George's descent, while each back paw changes rung in turn.
                bx=gx-.105*gh;by=.328+(gy-.50)
                into=smooth((t-old.cue(scene,4))/2.4)
                k=actors['Kitten'];k.update(x=.645+(bx-.645)*into,y=.268+(by-.268)*into,flip=True)
                k['hop']=-.012*math.sin(into*math.pi)
                k['y']+=k['hop']
            if sid in ['11','12']:
                arrive=old.cue(scene,1)+1 if sid=='11' else -10
                q=smooth((t-arrive-2.5)/1.2)
                if 'Kitten'in actors and 'Mama'in actors:
                    actors['Kitten']['x']+=.019*q
                    actors['Kitten']['headAngle']=3*q+math.sin(t)*.5
                    actors['Mama']['headAngle']=-4*q+math.sin(t*.8)*.4
            frames.append(dict(t=t,set=setname,camera=cam,actors=actors,props=props,
              title='title' if sid=='02' else 'location-card' if sid=='01' and t<5 else 'end-card' if sid=='12' and t>scene['speech_offset']+scene['audio_duration']-.1 else None))
        data={'id':sid,'start':scene['start'],'duration':duration,'frames':frames,'lines':scene['lines']}
        (out/f'scene-{sid}.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
        manifest.append({k:data[k] for k in ['id','start','duration']})
        print('Prepared scene',sid,len(frames),'control samples',flush=True)
    (root/'episode-timeline.json').write_text(json.dumps({'fps':24,'duration':old.TIMELINE['duration'],'scenes':manifest},indent=2)+'\n')

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('project',type=Path);run(p.parse_args().project)
