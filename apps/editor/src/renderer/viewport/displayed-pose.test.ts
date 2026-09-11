import { describe, expect, it } from 'vitest';
import { CreateBoneCommand } from '@marionette/document-core';
import { createInitialDocument } from '../composition-root';
import { bonesInRect, hitTestBone, publishDisplayedWorlds, solveWorldById } from './scene-solve';

describe('selection follows the displayed pose', () => {
  it('uses the rendered bone worlds for clicking, marquee and gizmo lookup', () => {
    const doc = createInitialDocument();
    const id = doc.ids.mint('bone');
    doc.history.execute(
      new CreateBoneCommand(id, null, {
        name: 'bone',
        length: 30,
        x: 0,
        y: 0,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        shearX: 0,
        shearY: 0,
        transformMode: 'normal',
      }),
    );
    publishDisplayedWorlds(doc.model, new Map([['bone', [1, 0, 0, 1, 200, 100] as const]]));
    expect(hitTestBone(doc.model, 215, 100, { x: 0, y: 0, zoom: 1 })).toBe(id);
    expect(hitTestBone(doc.model, 15, 0, { x: 0, y: 0, zoom: 1 })).toBeNull();
    expect(bonesInRect(doc.model, 190, 90, 210, 110)).toEqual([id]);
    expect(solveWorldById(doc.model).get(id)?.slice(4)).toEqual([200, 100]);
    const other = createInitialDocument();
    expect(solveWorldById(other.model).size).toBe(0);
  });
});
