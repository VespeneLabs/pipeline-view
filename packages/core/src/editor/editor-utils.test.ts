import { describe, expect, it } from 'vitest';
import { alignmentSnap, snapPoint } from './guides';
import { actionForKey, isEditableTarget } from './keymap';
import {
  adjustWaypoints,
  cleanPath,
  moveSegment,
  removeBend,
  splitSegment,
  toWaypoints,
} from './waypoints';

describe('waypoints', () => {
  const L = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 200, y: 100 },
  ];

  it('cleans duplicates and straight-through points', () => {
    expect(
      cleanPath([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ]);
  });

  it('moves an interior segment perpendicular to itself', () => {
    expect(toWaypoints(moveSegment(L, 1, { x: 30, y: 999 }))).toEqual([
      { x: 130, y: 0 },
      { x: 130, y: 100 },
    ]);
  });

  it('keeps a stub at the port when moving an end segment', () => {
    const path = moveSegment(L, 0, { x: 0, y: 40 }, 12);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(toWaypoints(path)).toEqual([
      { x: 12, y: 0 },
      { x: 12, y: 40 },
      { x: 100, y: 40 },
      { x: 100, y: 100 },
    ]);
  });

  it('turns a straight link into a dog-leg with stubs at both ports', () => {
    const path = moveSegment(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      0,
      { x: 0, y: 30 },
      10,
    );
    expect(cleanPath(path)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 30 },
      { x: 90, y: 30 },
      { x: 90, y: 0 },
      { x: 100, y: 0 },
    ]);
  });

  it('removes and flips bends', () => {
    const Z = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 50 },
      { x: 100, y: 100 },
      { x: 150, y: 100 },
    ];
    // The corner at (50,50) flips to (100,0), which merges the neighbouring runs.
    expect(removeBend(Z, 2)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 150, y: 100 },
    ]);
    // A bend next to a port that can't be removed without turning the port is kept.
    expect(removeBend(L, 1)).toEqual(L);
  });

  it('splits a segment so either half can be dragged', () => {
    const { path, second } = splitSegment(L, 1, { x: 7, y: 40 });
    expect(toWaypoints(moveSegment(path, second, { x: 20, y: 0 }))).toEqual([
      { x: 100, y: 0 },
      { x: 100, y: 40 },
      { x: 120, y: 40 },
      { x: 120, y: 100 },
    ]);
  });

  it('slides end waypoints to follow moved ports', () => {
    const wps = [
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(
      adjustWaypoints(wps, { x: 0, y: 0 }, { x: 0, y: 20 }, { x: 200, y: 100 }, { x: 250, y: 100 }),
    ).toEqual([
      { x: 100, y: 20 },
      { x: 100, y: 100 },
    ]);
  });
});

describe('guides', () => {
  it('snaps to the nearest edge or center within the threshold', () => {
    const r = alignmentSnap(
      { x: 103, y: 0, width: 20, height: 20 },
      [{ x: 100, y: 200, width: 40, height: 40 }],
      5,
    );
    expect(r.dx).toBe(-3);
    expect(r.dy).toBe(0);
    // Left edge meets left edge, and right edge (120) meets the other's center.
    expect(r.guides).toEqual([
      { orientation: 'vertical', pos: 100, from: 0, to: 240 },
      { orientation: 'vertical', pos: 120, from: 0, to: 240 },
    ]);
  });

  it('ignores candidates beyond the threshold', () => {
    const r = alignmentSnap(
      { x: 0, y: 0, width: 10, height: 10 },
      [{ x: 50, y: 50, width: 10, height: 10 }],
      5,
    );
    expect(r).toEqual({ dx: 0, dy: 0, guides: [] });
  });

  it('snaps points to the grid', () => {
    expect(snapPoint({ x: 14, y: -6 }, 10)).toEqual({ x: 10, y: -10 });
  });
});

describe('keymap', () => {
  it.each([
    [{ key: 'z', ctrlKey: true }, 'undo'],
    [{ key: 'Z', metaKey: true, shiftKey: true }, 'redo'],
    [{ key: 'y', ctrlKey: true }, 'redo'],
    [{ key: 'd', metaKey: true }, 'duplicate'],
    [{ key: 'r' }, 'rotate'],
    [{ key: 'R', shiftKey: true }, 'rotateBack'],
    [{ key: 'Backspace' }, 'delete'],
    [{ key: 'ArrowUp' }, 'nudgeUp'],
    [{ key: 'x' }, null],
    [{ key: 'z', altKey: true, ctrlKey: true }, null],
  ])('%o -> %s', (e, action) => {
    expect(actionForKey(e)).toBe(action);
  });
});

describe('isEditableTarget', () => {
  it('detects text inputs and contenteditable', () => {
    const input = document.createElement('input');
    const div = document.createElement('div');
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(div)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(editable)).toBe(editable.isContentEditable);
  });
});
