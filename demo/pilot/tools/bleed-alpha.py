"""Extend edge RGB under transparent pixels for straight-alpha sampling.

Alpha is unchanged. This prevents dark seams where separately clipped SVG
parts meet in Armature's CPU preview renderer.
"""
from pathlib import Path
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

for path in Path(sys.argv[1]).glob('*.png'):
    data=np.asarray(Image.open(path).convert('RGBA')).copy()
    solid=data[:,:,3]>=230
    if not solid.any():continue
    dist,indices=ndimage.distance_transform_edt(~solid,return_indices=True)
    edge=(~solid)&(dist<8)
    rgb=data[indices[0],indices[1],:3]
    data[edge,:3]=rgb[edge]
    Image.fromarray(data).save(path)
