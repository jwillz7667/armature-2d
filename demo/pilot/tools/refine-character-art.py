"""Repair Gunner's anatomy and add independent, registered pupil layers."""
import argparse
import copy
import json
import math
from pathlib import Path
from lxml import etree as E
import importlib.util
_spec = importlib.util.spec_from_file_location('character_specs', Path(__file__).with_name('layer-characters.py'))
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
SPECS = _module.SPECS

SVG = 'http://www.w3.org/2000/svg'
INK = 'http://www.inkscape.org/namespaces/inkscape'
EYE_FUR = {
    'Gunner': ['#ea944f']*2, 'Eugene': ['#3c3e4b']*2,
    'Maple': ['#faf0e7', '#e17e2f'], 'George': ['#de9452']*2,
    'Oakley': ['#ea9a4d']*2, 'Kitten': ['#a1908f']*2,
    'Mama': ['#9f908f']*2, 'Pip': ['#3b302c']*2,
    'GeorgeClimb': ['#ed9647']*2,
}


def node(tag, **attrs):
    return E.Element(f'{{{SVG}}}{tag}', {k.replace('_', '-'): str(v) for k, v in attrs.items()})


def vector(box, children):
    l, t, r, b = box
    out = E.Element(f'{{{SVG}}}svg', nsmap={None: SVG}, width=str(r-l), height=str(b-t),
                    viewBox=f'{l} {t} {r-l} {b-t}')
    out.extend(children)
    return out


def ellipse(x, y, rx, ry, fill, **kw):
    return node('ellipse', cx=x, cy=y, rx=rx, ry=ry, fill=fill, **kw)


def put(root, char, part, children):
    path = root / part['svg']
    path.parent.mkdir(parents=True, exist_ok=True)
    E.ElementTree(vector(part['box'], children)).write(str(path), encoding='utf-8', xml_declaration=True)


def capsule(a, b, ra, rb, color, width=5):
    dx, dy = b[0]-a[0], b[1]-a[1]
    length = math.hypot(dx, dy)
    nx, ny = -dy/length, dx/length
    p = lambda v, r: (v[0]+nx*r, v[1]+ny*r)
    al, ar, bl, br = p(a, ra), p(a, -ra), p(b, rb), p(b, -rb)
    xy = lambda v: f'{v[0]:.3f} {v[1]:.3f}'
    d = f'M {xy(al)} L {xy(bl)} Q {b[0]+dx/length*rb:.3f} {b[1]+dy/length*rb:.3f} {xy(br)} L {xy(ar)} Q {a[0]-dx/length*ra:.3f} {a[1]-dy/length*ra:.3f} {xy(al)} Z'
    sides = f'M {xy(al)} L {xy(bl)} M {xy(ar)} L {xy(br)}'
    return [node('path', d=d, fill=color), node('path', d=sides, fill='none', stroke='#68372d', stroke_width=width, stroke_linecap='round')]


def gunner(root, char):
    # Clean silhouettes replace clipped fragments of neighboring legs. Segment
    # attachments rotate rigidly on upper/lower bones; paw controls stay level.
    coat, far, outline = '#e99549', '#c88147', '#68372d'
    torso = next(p for p in char['parts'] if p['id'] == 'torso')
    torso['box'] = [72, 226, 427, 394]
    put(root, char, torso, [
        node('path', d='M 112 238 C 161 228 234 230 288 246 C 348 238 397 266 413 307 C 430 346 406 375 366 381 C 329 397 276 382 237 384 C 186 394 134 377 107 351 C 81 326 72 274 90 247 Z', fill=coat, stroke=outline, stroke_width=5, stroke_linejoin='round'),
        node('path', d='M 91 268 C 125 292 172 308 218 300 C 205 328 210 357 230 381 C 182 389 137 371 111 344 C 96 321 89 293 91 268 Z', fill='#fff0eb'),
        node('path', d='M 257 357 C 298 371 328 359 347 339 L 353 361 C 323 382 283 383 257 376 Z', fill='#fff0eb')])
    legs = [
        ('back-far', [315, 349], [325, 409], [307, 448], 24, 20, 25),
        ('front-far', [126, 325], [135, 394], [122, 452], 27, 22, 29),
        ('back-near', [369, 332], [391, 405], [379, 469], 40, 27, 35),
        ('front-near', [249, 331], [256, 399], [231, 474], 32, 27, 38),
    ]
    char['legs'] = []
    generated = {}
    for name, hip, knee, foot, upper_r, lower_r, paw_r in legs:
        char['legs'].append({'id': name, 'hip': hip, 'knee': knee, 'foot': foot})
        color = far if 'far' in name else coat
        ankle = [foot[0]+3, foot[1]-16]
        specs = [
            ('joint', knee, [ellipse(knee[0], knee[1], lower_r+1, lower_r+1, color, stroke=outline, stroke_width=5)]),
            ('upper', hip, capsule(hip, knee, upper_r, lower_r, color)),
            ('lower', knee, capsule(knee, ankle, lower_r, lower_r*.78, color)),
        ]
        fx, fy = foot
        paw = [node('path', d=f'M {fx-paw_r} {fy-12} C {fx-paw_r} {fy-33} {fx-7} {fy-36} {fx+14} {fy-32} C {fx+paw_r} {fy-29} {fx+paw_r+3} {fy-12} {fx+paw_r-5} {fy-4} C {fx+15} {fy+2} {fx-paw_r+3} {fy+2} {fx-paw_r} {fy-12} Z', fill='#fff0eb' if 'near' in name else '#e8c6c0', stroke=outline, stroke_width=5, stroke_linejoin='round')]
        for delta in [-paw_r*.40, paw_r*.12]:
            x = fx+delta
            paw.append(node('path', d=f'M {x} {fy-23} Q {x-6} {fy-12} {x-2} {fy-2}', fill='none', stroke=outline, stroke_width=3.5, stroke_linecap='round'))
        specs.append(('paw', foot, paw))
        generated[name] = []
        for segment, pivot, paths in specs:
            if segment == 'joint':a, b, pad = knee, knee, lower_r+5
            elif segment == 'upper':a, b, pad = hip, knee, upper_r+5
            elif segment == 'lower':a, b, pad = knee, ankle, lower_r+5
            else:a, b, pad = [fx-paw_r-7, fy-39], [fx+paw_r+7, fy+5], 0
            box = [math.floor(min(a[0], b[0])-pad), math.floor(min(a[1], b[1])-pad), math.ceil(max(a[0], b[0])+pad), math.ceil(max(a[1], b[1])+pad)]
            ident = f'leg-{name}-{segment}'
            part = {'id': ident, 'svg': f'layered-svg/parts/Gunner/{ident}.svg', 'box': box,
                    'pivot': pivot, 'parent': 'torso', 'visible': True, 'leg': name, 'segment': 'lower' if segment=='joint' else segment}
            put(root, char, part, paths)
            generated[name].append(part)
    old = char['parts']
    replacement = []
    for part in old:
        if part['id'].startswith('leg-'):
            replacement.extend(generated.pop(part['id'][4:], []))
        else:replacement.append(part)
    char['parts'] = replacement
    tag={'id':'collar-tag','svg':'layered-svg/parts/Gunner/collar-tag.svg','box':[114,278,163,335],
         'pivot':[137,294],'parent':'head','visible':True}
    put(root,char,tag,[
        node('path',d='M 136 282 L 136 301',fill='none',stroke=outline,stroke_width=8,stroke_linecap='round'),
        node('path',d='M 136 282 L 136 301',fill='none',stroke='#ffc963',stroke_width=4,stroke_linecap='round'),
        node('path',d='M 127 307 C 124 299 115 302 117 311 L 120 315 C 113 324 120 332 128 324 L 147 324 C 155 332 163 324 156 316 C 163 307 157 300 149 308 Z',fill='#ffd074',stroke=outline,stroke_width=4,stroke_linejoin='round')])
    char['parts'].insert(next(i for i,p in enumerate(char['parts']) if p['id']=='head')+1,tag)


def eyes(root, char):
    spec = SPECS[char['name']]
    # Eye pixels also occur in overlapping ear and mouth crops. Remove them
    # from every backing part so blinks cannot reveal a second frozen eye.
    for part in char['parts']:
        if part['id'].startswith(('eye-', 'pupil-')):continue
        left,top,right,bottom=part['box']
        zones=[]
        for i,(x,y,rx,ry) in enumerate(spec['eyes']):
            x*=char['width'];rx*=char['width'];y*=char['height'];ry*=char['height']
            if x+rx*1.22>left and x-rx*1.22<right and y+ry*1.22>top and y-ry*1.22<bottom:
                zones.append((x,y,rx*1.22,ry*1.22,EYE_FUR[char['name']][i]))
        if not zones:continue
        path=root/part['svg'];art=E.parse(str(path)).getroot()
        if part['id']=='head':
            for old,new in zip(spec['eye_fur'],EYE_FUR[char['name']]):
                for patch in art.xpath('.//*[@fill=$color]',color=old):patch.set('fill',new)
            E.ElementTree(art).write(str(path),encoding='utf-8',xml_declaration=True)
        ident=f"{char['name']}-{part['id']}-clean-eyes"
        if art.xpath('.//*[@id=$ident]',ident=ident):continue
        defs=E.SubElement(art,f'{{{SVG}}}defs')
        mask=E.SubElement(defs,f'{{{SVG}}}mask',id=ident,maskUnits='userSpaceOnUse',x=str(left),y=str(top),width=str(right-left),height=str(bottom-top))
        mask.append(node('rect',x=left,y=top,width=right-left,height=bottom-top,fill='white'))
        for x,y,rx,ry,_ in zones:mask.append(ellipse(x,y,rx,ry,'black'))
        group=E.SubElement(art,f'{{{SVG}}}g',mask=f'url(#{ident})')
        for child in list(art):
            if child is not defs and child is not group:group.append(child)
        if part['id']=='head':
            for x,y,rx,ry,color in zones:art.append(ellipse(x,y,rx,ry,color))
        E.ElementTree(art).write(str(path),encoding='utf-8',xml_declaration=True)
    parts = []
    for part in char['parts']:
        if part['id'].startswith('pupil-'):continue
        parts.append(part)
        if not part['id'].startswith('eye-'):continue
        side = part['id'][4:]
        index = 0 if side == 'far' else 1
        x, y, rx, ry = spec['eyes'][index]
        x *= char['width'];rx *= char['width'];y *= char['height'];ry *= char['height']
        edge = '#492724' if char['name'] not in ['Kitten', 'Mama'] else '#494044'
        iris = '#55864f' if char['name'] == 'Maple' else '#4c9ab9' if char['name'] in ['Kitten', 'Mama'] else '#97643a'
        put(root, char, part, [ellipse(x, y, rx*.95, ry*.95, '#fffdf9', stroke=edge, stroke_width=max(1.2, char['height']*.0045))])
        ident = 'pupil-'+side
        pupil = {'id': ident, 'svg': f"layered-svg/parts/{char['name']}/{ident}.svg", 'box': part['box'],
                 'pivot': [x, y], 'parent': part['id'], 'visible': True, 'gazeRange': [rx*.29, ry*.20]}
        put(root, char, pupil, [ellipse(x, y, rx*.61, ry*.73, iris), ellipse(x, y, rx*.405, ry*.54, '#392a2c'),
             ellipse(x-rx*.21, y-ry*.30, rx*.22, ry*.22, '#ffffff'), ellipse(x+rx*.22, y+ry*.31, rx*.095, ry*.09, '#ffffff')])
        parts.append(pupil)
        lid_id = 'lid-'+side
        lid = {'id': lid_id, 'svg': f"layered-svg/parts/{char['name']}/{lid_id}.svg",
               'box': part['box'], 'pivot': [x,y], 'parent': 'head', 'visible': False}
        put(root,char,lid,[node('path',d=f'M {x-rx*.84} {y-ry*.05} Q {x} {y+ry*.48} {x+rx*.84} {y-ry*.05}',
            fill='none',stroke=edge,stroke_width=max(1.5,char['height']*.006),stroke_linecap='round')])
        parts.append(lid)
    char['parts'] = parts


def assemble(root, char):
    out = E.Element(f'{{{SVG}}}svg', nsmap={None: SVG, 'inkscape': INK}, width=str(char['width']), height=str(char['height']), viewBox=f"0 0 {char['width']} {char['height']}")
    E.SubElement(out, f'{{{SVG}}}title').text = char['name']+' - editable articulated character'
    for part in char['parts']:
        group = E.SubElement(out, f'{{{SVG}}}g', id=part['id'])
        group.set(f'{{{INK}}}groupmode', 'layer');group.set(f'{{{INK}}}label', part['id'].replace('-', ' ').title())
        group.set('data-parent', part['parent']);group.set('data-pivot', ','.join(map(str, part['pivot'])))
        if not part.get('visible', True):group.set('style', 'display:none')
        art = E.parse(str(root / part['svg'])).getroot()
        art.set('x', str(part['box'][0]));art.set('y', str(part['box'][1]))
        group.append(copy.deepcopy(art))
    E.ElementTree(out).write(str(root / 'layered-svg' / (char['name']+'.svg')), encoding='utf-8', xml_declaration=True)
    (root / 'layered-svg' / (char['name']+'.layers.json')).write_text(json.dumps(char, indent=2)+'\n')


def run(root):
    path = root / 'layered-svg/cast.layers.json'
    baseline = root / 'source-reference/base-cast.layers.json'
    if not baseline.exists():baseline.write_text(path.read_text())
    cast = json.loads(baseline.read_text())
    for char in cast:
        if char['name'] == 'Gunner':gunner(root, char)
        eyes(root, char);assemble(root, char)
    path.write_text(json.dumps(cast, indent=2)+'\n')
    print('Refined', len(cast), 'rigs;', sum(len(c['parts']) for c in cast), 'vector parts')


if __name__ == '__main__':
    p = argparse.ArgumentParser();p.add_argument('project', type=Path);run(p.parse_args().project)
