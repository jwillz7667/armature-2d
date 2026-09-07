"""Trace owned character art into named, editable vector parts for Armature 2D.

Input is an existing production's source-reference PNGs. SVG outputs contain
paths, never embedded bitmaps. Masks describe the art's anatomy, not motion.
Each layer shares the source canvas and records its joint pivot. The body and
limbs overlap at sockets so the native rig can bend without opening seams.
"""
import argparse
import copy
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from lxml import etree as E
import vtracer
from scipy import ndimage

SVG = 'http://www.w3.org/2000/svg'
# The standard namespace, recognized by Inkscape's Layers panel.
INK = 'http://www.inkscape.org/namespaces/inkscape'
SOD = 'http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd'

def poly(*p): return list(p)
def rect(x0,y0,x1,y1): return poly((x0,y0),(x1,y0),(x1,y1),(x0,y1))

# Coordinates are fractions of each tightly cropped source canvas, facing left.
# Legs: shoulder/hip, elbow/knee and sole targets are authored separately.
SPECS = {
 'Gunner': dict(head=poly((0,0),(.64,0),(.66,.48),(.54,.60),(.18,.60),(0,.50)),
  neck=(.38,.55), body=poly((.19,.48),(.63,.43),(.88,.58),(.89,.77),(.73,.86),(.38,.83),(.19,.72)),
  tail=poly((.80,.53),(1,.57),(1,.72),(.83,.70)), tail_p=(.845,.61),
  ears=[poly((.04,0),(.23,0),(.27,.16),(.06,.23)),poly((.45,0),(.64,0),(.66,.25),(.48,.19))],
  eyes=[(.14,.287,.055,.067),(.365,.300,.070,.075)], eye_fur=['#d49762','#d49762'],
  mouth=rect(.00,.355,.495,.565),
  legs=[('back-far',poly((.61,.69),(.73,.70),(.75,.94),(.57,.94)),(.665,.73),(.675,.84),(.65,.92)),
        ('front-far',poly((.19,.59),(.37,.66),(.34,.94),(.10,.94)),(.275,.675),(.295,.80),(.245,.913)),
        ('back-near',poly((.70,.61),(.89,.60),(.925,.97),(.71,1),(.66,.83)),(.785,.705),(.82,.835),(.813,.954)),
        ('front-near',poly((.45,.60),(.65,.60),(.635,.78),(.56,1),(.35,1),(.39,.79)),(.52,.69),(.515,.835),(.466,.968))]),
 'Eugene': dict(head=poly((0,0),(.64,0),(.80,.17),(.75,.35),(.48,.37),(.23,.38),(0,.32)),
  neck=(.35,.335),body=poly((.245,.325),(.485,.325),(.53,.40),(.76,.425),(.87,.50),(.87,.65),(.70,.68),(.55,.70),(.40,.70),(.265,.64),(.225,.51)),
  tail=poly((.77,.435),(.88,.39),(.875,.28),(.95,.25),(1,.34),(1,.45),(.82,.51)),tail_p=(.82,.455),
  ears=[poly((.075,.10),(.165,.07),(.165,.24),(.09,.315),(0,.27),(0,.15)),poly((.52,.03),(.66,.055),(.82,.165),(.83,.245),(.66,.37),(.525,.30))],
  eyes=[(.168,.152,.044,.050),(.352,.165,.060,.058)],eye_fur=['#343540','#363743'],
  mouth=rect(.005,.197,.466,.337),
  legs=[('back-far',poly((.56,.585),(.70,.55),(.75,.68),(.70,.925),(.67,.96),(.50,.965),(.50,.875),(.56,.85)),(.65,.63),(.65,.775),(.604,.915)),
        ('front-far',poly((.225,.47),(.405,.53),(.39,.83),(.365,.94),(.285,.98),(.10,.975),(.105,.884),(.245,.83),(.265,.67)),(.312,.59),(.314,.79),(.268,.937)),
        ('back-near',poly((.715,.47),(.90,.495),(.90,.66),(1,.765),(1,.977),(.82,.984),(.795,.885),(.80,.80),(.728,.73),(.68,.64)),(.791,.582),(.857,.762),(.895,.941)),
        ('front-near',poly((.405,.51),(.545,.51),(.57,.665),(.535,.945),(.49,1),(.32,1),(.325,.889),(.398,.817)),(.473,.588),(.47,.797),(.423,.962))]),
 'Maple': dict(head=poly((0,.03),(.7,0),(.74,.44),(.61,.53),(.30,.56),(.07,.48)),
  neck=(.435,.495),body=poly((.29,.49),(.63,.49),(.63,.55),(.79,.58),(.855,.68),(.85,.83),(.72,.865),(.51,.835),(.37,.83),(.29,.71)),
  tail=poly((.8,.645),(.815,.53),(.75,.40),(.785,.28),(.9,.265),(1,.27),(1,.385),(.92,.455),(.99,.56),(.93,.68),(.83,.72)),tail_p=(.829,.68),
  ears=[poly((.13,.005),(.3,.005),(.33,.16),(.145,.24)),poly((.505,0),(.65,0),(.68,.27),(.54,.20))],
  eyes=[(.245,.306,.043,.054),(.465,.332,.061,.065)],eye_fur=['#faf5ec','#e69b43'],
  mouth=rect(.195,.345,.567,.505),
  legs=[('back-far',poly((.615,.765),(.735,.77),(.725,.943),(.535,.97),(.52,.89)),(.657,.804),(.641,.862),(.626,.929)),
        ('front-far',poly((.299,.672),(.435,.72),(.43,.965),(.205,.98),(.24,.885)),(.349,.761),(.352,.864),(.305,.946)),
        ('back-near',poly((.715,.652),(.855,.652),(.88,.973),(.735,.99),(.745,.875),(.682,.821)),(.778,.755),(.80,.865),(.810,.953)),
        ('front-near',poly((.435,.702),(.604,.703),(.599,.811),(.56,.975),(.405,1),(.38,.945)),(.52,.761),(.497,.871),(.468,.969))]),
 'George': dict(head=poly((0,0),(.49,0),(.52,.47),(.43,.545),(.13,.53),(0,.45)),
  neck=(.315,.496),body=poly((.135,.455),(.48,.418),(.57,.473),(.75,.485),(.833,.61),(.82,.79),(.64,.825),(.43,.82),(.26,.80),(.10,.655)),
  tail=poly((.77,.595),(.85,.64),(.91,.73),(1,.72),(1,.87),(.96,.915),(.835,.895),(.79,.80)),tail_p=(.816,.718),
  ears=[poly((.10,0),(.245,0),(.258,.177),(.11,.24)),poly((.29,0),(.447,0),(.461,.303),(.30,.209))],
  eyes=[(.135,.258,.028,.037),(.252,.275,.039,.052)],eye_fur=['#b37643','#c2864a'],
  mouth=rect(0,.303,.333,.488),
  legs=[('back-far',poly((.53,.71),(.67,.728),(.686,.947),(.505,.97),(.51,.885),(.56,.868)),(.591,.767),(.61,.871),(.582,.946)),
        ('front-far',poly((.17,.657),(.31,.711),(.30,.938),(.23,.977),(.075,.97),(.10,.879),(.18,.861)),(.247,.737),(.233,.846),(.19,.94)),
        ('back-near',poly((.707,.61),(.83,.63),(.825,.84),(.86,.973),(.72,.99),(.70,.91),(.745,.878),(.67,.76)),(.759,.736),(.789,.854),(.792,.952)),
        ('front-near',poly((.33,.628),(.476,.64),(.47,.821),(.43,.98),(.294,1),(.272,.937)),(.405,.734),(.387,.86),(.357,.964))]),
 'Oakley': dict(head=poly((0,0),(.58,0),(.63,.20),(.68,.48),(.56,.545),(.17,.50),(0,.38)),
  neck=(.34,.46),body=poly((.22,.455),(.57,.458),(.70,.492),(.79,.568),(.84,.75),(.74,.841),(.49,.828),(.28,.845),(.19,.70)),
  tail=poly((.75,.525),(.835,.47),(.83,.34),(.92,.345),(1,.443),(1,.585),(.925,.716),(.815,.75)),tail_p=(.816,.645),
  ears=[poly((.135,.177),(.215,.19),(.20,.36),(.23,.535),(.165,.603),(.07,.617),(0,.553),(0,.376)),poly((.40,.08),(.58,.12),(.69,.29),(.72,.486),(.67,.62),(.525,.66),(.397,.61),(.40,.392),(.45,.25))],
  eyes=[(.175,.174,.030,.046),(.33,.204,.049,.057)],eye_fur=['#d79b53','#e4aa65'],
  mouth=rect(.071,.237,.395,.418),
  legs=[('back-far',poly((.60,.731),(.725,.745),(.73,.958),(.56,.975),(.57,.87)),(.656,.786),(.665,.864),(.641,.945)),
        ('front-far',poly((.231,.719),(.374,.727),(.385,.95),(.29,.984),(.153,.975),(.184,.879)),(.298,.799),(.295,.868),(.253,.949)),
        ('back-near',poly((.708,.653),(.827,.661),(.87,.825),(.947,.875),(.90,.983),(.767,.99),(.723,.87),(.668,.78)),(.762,.752),(.82,.881),(.830,.958)),
        ('front-near',poly((.416,.698),(.602,.711),(.573,.87),(.58,.962),(.475,1),(.38,.991),(.355,.933)),(.50,.791),(.49,.88),(.47,.968))]),
 'Kitten': dict(head=poly((0,0),(.71,0),(.745,.515),(.66,.609),(.30,.61),(.08,.52)),
  neck=(.423,.579),body=poly((.275,.57),(.611,.56),(.73,.65),(.77,.848),(.72,.942),(.50,.98),(.32,.93),(.27,.76)),
  tail=poly((.69,.75),(.765,.57),(.85,.455),(1,.457),(1,.60),(.94,.685),(.96,.78),(.87,.90),(.69,.979)),tail_p=(.714,.902),
  ears=[poly((.17,0),(.31,0),(.393,.13),(.165,.258)),poly((.54,.045),(.70,.045),(.71,.348),(.55,.246))],
  eyes=[(.29,.387,.048,.073),(.504,.433,.072,.079)],eye_fur=['#a39a9b','#a2999a'],
  mouth=rect(.25,.446,.576,.584),
  legs=[('back-far',poly((.53,.73),(.68,.72),(.725,.89),(.62,.973),(.46,.96)),(.605,.825),(.62,.888),(.586,.946)),
        ('front-far',poly((.31,.696),(.43,.71),(.43,.924),(.377,.979),(.235,.963),(.24,.885)),(.355,.785),(.353,.879),(.338,.94)),
        ('back-near',poly((.58,.696),(.735,.74),(.75,.878),(.704,.967),(.49,.98),(.49,.897),(.54,.84)),(.646,.818),(.636,.897),(.61,.949)),
        ('front-near',poly((.42,.744),(.538,.712),(.54,.86),(.501,.978),(.362,1),(.338,.963)),(.483,.790),(.459,.895),(.43,.966))]),
 'Mama': dict(head=poly((0,0),(.46,0),(.51,.454),(.43,.562),(.13,.545),(0,.45)),
  neck=(.328,.505),body=poly((.265,.48),(.49,.458),(.64,.426),(.73,.49),(.805,.64),(.791,.824),(.585,.859),(.358,.833),(.208,.693)),
  tail=poly((.725,.60),(.80,.47),(.769,.193),(.9,.17),(1,.32),(1,.52),(.93,.688),(.85,.79),(.74,.82)),tail_p=(.765,.722),
  ears=[poly((.138,0),(.279,0),(.278,.131),(.14,.204)),poly((.337,.017),(.469,.017),(.49,.295),(.367,.225))],
  eyes=[(.166,.306,.029,.054),(.305,.335,.046,.067)],eye_fur=['#9d9696','#a39c9c'],
  mouth=rect(.129,.354,.404,.5),
  legs=[('back-far',poly((.525,.721),(.664,.731),(.68,.954),(.507,.973),(.51,.874)),(.592,.794),(.604,.874),(.573,.949)),
        ('front-far',poly((.264,.714),(.371,.766),(.368,.952),(.263,.985),(.171,.966),(.215,.884)),(.303,.796),(.296,.881),(.265,.946)),
        ('back-near',poly((.694,.624),(.778,.667),(.804,.839),(.801,.963),(.68,.985),(.652,.905),(.691,.824),(.651,.737)),(.719,.752),(.745,.884),(.745,.951)),
        ('front-near',poly((.363,.731),(.507,.714),(.477,.922),(.428,.987),(.315,1),(.28,.951)),(.429,.796),(.408,.899),(.38,.966))]),
 'Pip': dict(head=poly((.01,.05),(.46,0),(.59,.23),(.58,.415),(.27,.475),(.08,.36)),
  neck=(.362,.413),body=poly((.16,.36),(.58,.36),(.726,.596),(.683,.78),(.472,.84),(.231,.767),(.129,.591)),
  tail=poly((.61,.60),(.94,.728),(1,.78),(1,.9),(.865,.913),(.66,.794),(.54,.687)),tail_p=(.650,.735),
  ears=[],eyes=[(.127,.175,.020,.035),(.278,.234,.061,.072)],eye_fur=['#302826','#312825'],
  mouth=rect(0,.228,.173,.318),
  legs=[('foot-far',poly((.26,.754),(.40,.755),(.398,.85),(.329,.90),(.175,.92),(.167,.856)),(.35,.797),(.326,.854),(.283,.90)),
        ('foot-near',poly((.454,.729),(.552,.754),(.488,.873),(.564,.906),(.474,.969),(.355,1),(.304,.966),(.442,.857)),(.514,.784),(.475,.859),(.426,.943))],
  wing=poly((.38,.399),(.564,.41),(.731,.643),(.69,.714),(.54,.704),(.393,.629),(.363,.498)),wing_p=(.422,.44)),
}

# Eye positions are registered to the visible sclera in the supplied artwork.
EYES = {
 'Gunner':[(.110,.276,.055,.061),(.364,.280,.076,.064)],
 'Eugene':[(.166,.148,.039,.043),(.355,.166,.060,.050)],
 'Maple':[(.184,.305,.047,.057),(.410,.324,.064,.064)],
 'George':[(.137,.251,.028,.036),(.260,.273,.041,.048)],
 'Oakley':[(.178,.169,.034,.048),(.333,.188,.049,.058)],
 'Kitten':[(.244,.365,.051,.073),(.454,.402,.074,.079)],
 'Mama':[(.170,.282,.035,.056),(.312,.300,.045,.063)],
 'Pip':[(.131,.176,.019,.038),(.282,.220,.060,.064)],
}
for name,eyes in EYES.items():SPECS[name]['eyes']=eyes

SPECS['GeorgeClimb']=dict(
 head=poly((.24,0),(.70,0),(.755,.355),(.62,.399),(.30,.366),(.23,.264)),neck=(.49,.355),
 body=poly((.35,.31),(.65,.32),(.74,.455),(.8,.733),(.645,.825),(.41,.79),(.38,.70),(.29,.56),(.27,.41)),
 tail=poly((.75,.68),(.85,.66),(.88,.57),(.97,.56),(1,.67),(1,.81),(.86,.84),(.73,.79)),tail_p=(.77,.735),
 ears=[poly((.38,0),(.50,.065),(.49,.14),(.38,.145)),poly((.555,0),(.662,0),(.68,.20),(.578,.154))],
 eyes=[(.392,.171,.027,.031),(.490,.191,.043,.037)],eye_fur=['#bb8348','#c99559'],
 mouth=rect(.265,.211,.565,.339),
 legs=[('back-far',poly((.437,.676),(.602,.723),(.611,.847),(.578,.952),(.481,.980),(.357,.974),(.385,.894),(.46,.87)),(.487,.759),(.493,.85),(.475,.941)),
       ('back-near',poly((.578,.65),(.752,.678),(.785,.855),(.86,.969),(.823,1),(.672,1),(.66,.923),(.59,.844)),(.657,.754),(.721,.882),(.762,.973))],
 extras=[
  ('arm-far',poly((.27,.405),(.35,.405),(.34,.50),(.145,.565),(.08,.613),(.005,.59),(0,.51),(.11,.45)),(.33,.443),'torso'),
  ('basket',rect(0,.39,.58,.74),(.31,.55),'torso'),
  ('arm-near',poly((.57,.415),(.74,.419),(.79,.62),(.72,.65),(.55,.655),(.45,.62),(.45,.515)),(.671,.472),'torso'),
  ('basket-front',poly((.005,.525),(.145,.586),(.43,.594),(.57,.548),(.56,.67),(.43,.718),(.25,.735),(.08,.675)),(.31,.55),'torso'),
 ])

def mask_polygon(size, points):
    im=Image.new('L',size);d=ImageDraw.Draw(im)
    d.polygon([(round(x*size[0]),round(y*size[1])) for x,y in points],fill=255)
    return np.asarray(im).copy()

def ellipse_mask(size, e):
    x,y,rx,ry=e;w,h=size;im=Image.new('L',size)
    ImageDraw.Draw(im).ellipse(((x-rx)*w,(y-ry)*h,(x+rx)*w,(y+ry)*h),fill=255)
    return np.asarray(im).copy()

def trace_rgba(im, output):
    temp=output.with_suffix('.trace.png');im.save(temp)
    vtracer.convert_image_to_svg_py(str(temp),str(output),colormode='color',
      hierarchical='stacked',mode='spline',filter_speckle=3,color_precision=6,
      layer_difference=24,corner_threshold=75,length_threshold=4.0,
      max_iterations=10,splice_threshold=45,path_precision=3)
    temp.unlink()
    return E.parse(str(output)).getroot()

def build(name, spec, root):
    src=root/'source-reference'/f'{name}.png';im=Image.open(src).convert('RGBA')
    w,h=im.size;arr=np.asarray(im).copy();variants=[]
    for p in sorted(src.parent.glob(f'{name}-*.png')):
        if p.stem.rsplit('-',1)[1].isdigit():variants.append(Image.open(p).convert('RGBA').resize((w,h)))
    if not variants:variants=[im]
    out=root/'layered-svg';out.mkdir(exist_ok=True)
    parts=out/'parts'/name;parts.mkdir(parents=True,exist_ok=True)
    full_vectors=[trace_rgba(frame,parts/f'_reference-{i}.svg') for i,frame in enumerate(variants[:4])]
    svg=E.Element(f'{{{SVG}}}svg',nsmap={None:SVG,'inkscape':INK},width=str(w),height=str(h),viewBox=f'0 0 {w} {h}')
    E.SubElement(svg,f'{{{SVG}}}title').text=f'{name} - editable layered character'
    E.SubElement(svg,f'{{{SVG}}}desc').text='Original character appearance converted to vector paths. Named anatomy layers, pivot metadata, hidden mouth variants and joint overlap. No embedded images.'
    manifest={'name':name,'width':w,'height':h,'facing':'left','parts':[],
      'headPivot':[spec['neck'][0]*w,spec['neck'][1]*h],
      'torsoPivot':[.52*w,.63*h], 'legs':[]}
    def add(layer, mask, pivot, parent, image=im, visible=True, extra=None):
        pixels=np.asarray(image).copy();pixels[:,:,3]=np.minimum(pixels[:,:,3],mask)
        isolated=Image.fromarray(pixels);box=isolated.getbbox()
        if not box:return
        # Keep a small transparent margin for filtering at part edges.
        box=(max(0,box[0]-2),max(0,box[1]-2),min(w,box[2]+2),min(h,box[3]+2))
        # Reuse one traced palette and set of paths for all neutral parts.
        # Re-tracing crops independently produces color seams at shared joints.
        vector=E.Element(f'{{{SVG}}}svg',nsmap={None:SVG},
            width=str(box[2]-box[0]),height=str(box[3]-box[1]),
            viewBox=f'{box[0]} {box[1]} {box[2]-box[0]} {box[3]-box[1]}')
        defs=E.SubElement(vector,f'{{{SVG}}}defs')
        clip_id=f'{name}-{layer}-clip'
        clip=E.SubElement(defs,f'{{{SVG}}}clipPath',id=clip_id)
        mask_rgba=np.zeros((h,w,4),dtype=np.uint8)
        mask_rgba[:,:,3]=mask
        mask_vector=trace_rgba(Image.fromarray(mask_rgba),parts/f'_{layer}-mask.svg')
        for child in mask_vector:clip.append(copy.deepcopy(child))
        content=E.SubElement(vector,f'{{{SVG}}}g',attrib={'clip-path':f'url(#{clip_id})'})
        vi=extra.get('mouthState',0) if extra else 0
        for child in full_vectors[vi]:content.append(copy.deepcopy(child))
        if layer=='head':
            for e,color in zip(spec['eyes'],spec['eye_fur']):
                x,y,rx,ry=e
                E.SubElement(content,f'{{{SVG}}}ellipse',cx=str(x*w),cy=str(y*h),rx=str(rx*w),ry=str(ry*h),fill=color)
        if layer.startswith('eye-'):
            # Smooth vector eye shapes keep the small raster reference's
            # antialiasing from becoming lumpy contours at close-up scale.
            for child in list(content):content.remove(child)
            i=0 if layer=='eye-far' else 1
            x,y,rx,ry=spec['eyes'][i];x*=w;y*=h;rx*=w;ry*=h
            edge='#492724' if name not in ['Kitten','Mama'] else '#494044'
            iris='#55864f' if name=='Maple' else '#4c9ab9' if name in ['Kitten','Mama'] else '#97643a'
            stroke=max(1.2,h*.0045)
            def ellipse(cx,cy,rrx,rry,fill,**kw):E.SubElement(content,f'{{{SVG}}}ellipse',cx=str(cx),cy=str(cy),rx=str(rrx),ry=str(rry),fill=fill,**kw)
            ellipse(x,y,rx*.95,ry*.95,'#fffdf9',stroke=edge,**{'stroke-width':str(stroke)})
            ellipse(x-rx*.12,y+ry*.025,rx*.69,ry*.83,iris)
            ellipse(x-rx*.13,y+ry*.025,rx*.48,ry*.64,'#392a2c')
            ellipse(x-rx*.30,y-ry*.39,rx*.25,ry*.245,'#ffffff')
            ellipse(x+rx*.28,y+ry*.39,rx*.11,ry*.105,'#ffffff')
        E.ElementTree(vector).write(str(parts/f'{layer}.svg'),encoding='UTF-8',xml_declaration=True)
        group=E.SubElement(svg,f'{{{SVG}}}g',id=layer)
        group.set(f'{{{INK}}}groupmode','layer');group.set(f'{{{INK}}}label',layer.replace('-',' ').title())
        group.set('data-pivot',f'{pivot[0]*w:.3f},{pivot[1]*h:.3f}')
        group.set('data-parent',parent)
        if not visible:group.set('style','display:none')
        inner=copy.deepcopy(vector);inner.set('x',str(box[0]));inner.set('y',str(box[1]));group.append(inner)
        record={'id':layer,'svg':f'layered-svg/parts/{name}/{layer}.svg','box':list(box),
         'pivot':[pivot[0]*w,pivot[1]*h],'parent':parent,'visible':visible}
        if extra:record.update(extra)
        manifest['parts'].append(record)
    masks={'tail':mask_polygon(im.size,spec['tail']),
           'torso':mask_polygon(im.size,spec['body']),
           'head':mask_polygon(im.size,spec['head'])}
    masks.update({'leg-'+n:mask_polygon(im.size,p) for n,p,*_ in spec['legs']})
    for i,p in enumerate(spec['ears']):masks['ear-'+str(i)]=mask_polygon(im.size,p)
    if 'wing' in spec:masks['wing']=mask_polygon(im.size,spec['wing'])
    for name_,shape,*_ in spec.get('extras',[]):masks[name_]=mask_polygon(im.size,shape)
    # Assign uncovered silhouette pixels to the closest anatomical layer. This
    # preserves full paws, fur tips, whiskers and the collar across the cut lines.
    union=np.maximum.reduce(list(masks.values()))>0
    missing=(arr[:,:,3]>0)&~union
    keys=list(masks)
    distances=np.stack([ndimage.distance_transform_edt(masks[k]==0) for k in keys])
    nearest=np.argmin(distances,axis=0)
    for i,k in enumerate(keys):
        masks[k][missing&(nearest==i)]=255
        masks[k]=ndimage.maximum_filter(masks[k],size=3)
    add('tail',masks['tail'],spec['tail_p'],'torso')
    leg_masks={n:masks['leg-'+n] for n,p,*_ in spec['legs']}
    for n,p,j,k,f in spec['legs']:
        manifest['legs'].append({'id':n,'hip':[j[0]*w,j[1]*h],
           'knee':[k[0]*w,k[1]*h],'foot':[f[0]*w,f[1]*h]})
        if 'far' in n:add('leg-'+n,leg_masks[n],j,'torso')
    body=masks['torso']
    add('torso',body,(.52,.63),'root')
    for n,p,j,k,f in spec['legs']:
        if 'near' in n:add('leg-'+n,leg_masks[n],j,'torso')
    if 'wing' in spec:add('wing',masks['wing'],spec['wing_p'],'torso')
    for name_,shape,pivot,parent in spec.get('extras',[]):add(name_,masks[name_],pivot,parent)
    head=masks['head']
    ears=[masks['ear-'+str(i)] for i,p in enumerate(spec['ears'])]
    if ears:
        # The far ear is behind the skull; both are pivoted independently.
        p=spec['ears'][0];pivot=(sum(x for x,y in p)/len(p),max(y for x,y in p)*.78)
        add('ear-far',ears[0],pivot,'head')
    head_base=arr.copy()
    # Remove eye art from the skull layer and fill under the eyelid with local fur.
    # All visible eye contours are retained on their own vector layers.
    for e,color in zip(spec['eyes'],spec['eye_fur']):
        mask=ellipse_mask(im.size,e)>0
        rgb=tuple(int(color[i:i+2],16) for i in (1,3,5))
        head_base[mask,:3]=rgb
    # Ear root overlap remains inside the skull, covering the joint at small turns.
    for idx,mask in enumerate(ears):
        ys=np.arange(h)[:,None]/h
        min_y=min(y for x,y in spec['ears'][idx]);max_y=max(y for x,y in spec['ears'][idx])
        hide=(mask>0)&(ys<min_y+(max_y-min_y)*.75)
        head[hide]=0
    add('head',head,spec['neck'],'torso',Image.fromarray(head_base))
    if len(ears)>1:
        p=spec['ears'][1];pivot=(sum(x for x,y in p)/len(p),max(y for x,y in p)*.74)
        add('ear-near',ears[1],pivot,'head')
    for i,e in enumerate(spec['eyes']):
        add('eye-'+('far' if i==0 else 'near'),ellipse_mask(im.size,e),(e[0],e[1]),'head')
    # Replacement muzzle layers inherit the head transform, all in identical
    # source coordinates. They therefore swap without changing skull scale.
    mm=mask_polygon(im.size,spec['mouth'])
    for j,frame in enumerate(variants[:4]):
        add('mouth-'+['closed','small','wide','round'][j],mm,spec['neck'],'head',frame,j==0,{'mouthState':j})
    metadata=E.SubElement(svg,f'{{{SVG}}}metadata')
    metadata.text=json.dumps({'authoring':'Armature 2D','rig':manifest},separators=(',',':'))
    E.ElementTree(svg).write(str(out/f'{name}.svg'),encoding='UTF-8',xml_declaration=True,pretty_print=True)
    (out/f'{name}.layers.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(name,len(manifest['parts']),'vector layers',flush=True)
    return manifest

def main():
    parser=argparse.ArgumentParser();parser.add_argument('project',type=Path);parser.add_argument('--only',nargs='+');args=parser.parse_args()
    manifests=[]
    for name,spec in SPECS.items():
        if args.only and name not in args.only:
            manifests.append(json.loads((args.project/'layered-svg'/f'{name}.layers.json').read_text()))
        else:manifests.append(build(name,spec,args.project))
    (args.project/'layered-svg'/'cast.layers.json').write_text(json.dumps(manifests,indent=2)+'\n')

if __name__=='__main__':main()
