"""Export edited character layers back to the registered per-part SVG files."""
import argparse
from copy import deepcopy
import json
from pathlib import Path
from lxml import etree

SVG = 'http://www.w3.org/2000/svg'


def sync(root, only):
    cast = json.loads((root / 'layered-svg/cast.layers.json').read_text())
    parser = etree.XMLParser(resolve_entities=False, no_network=True)
    count = 0
    for character in cast:
        if only and character['name'] not in only:
            continue
        source = etree.parse(str(root / 'layered-svg' / (character['name'] + '.svg')), parser).getroot()
        if source.findall('.//{' + SVG + '}image'):
            raise ValueError('Character layers must remain vector artwork')
        for part in character['parts']:
            layer = next((c for c in source if c.get('id') == part['id']), None)
            if layer is None:
                raise ValueError(f"Missing layer {character['name']}/{part['id']}")
            left, top, right, bottom = part['box']
            out = etree.Element('{' + SVG + '}svg', nsmap={None: SVG})
            out.set('width', str(right - left))
            out.set('height', str(bottom - top))
            out.set('viewBox', f'{left} {top} {right-left} {bottom-top}')
            for child in source:
                if etree.QName(child).localname in ('defs', 'style'):
                    out.append(deepcopy(child))
            copied = deepcopy(layer)
            # A hidden alternate mouth must still be visible when exported alone.
            style = [s for s in copied.get('style', '').split(';')
                     if s and s.partition(':')[0].strip() != 'display']
            copied.set('style', ';'.join(style + ['display:inline']))
            copied.set('display', 'inline')
            out.append(copied)
            target = root / part['svg']
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_suffix('.partial.svg')
            temporary.write_bytes(etree.tostring(out, xml_declaration=True, encoding='utf-8'))
            temporary.replace(target)
            count += 1
    print(f'Synchronized {count} vector layers', flush=True)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('project', type=Path)
    p.add_argument('--only', nargs='*', default=[])
    args = p.parse_args()
    sync(args.project, set(args.only))
