/** Editor keyboard shortcuts (FR-25, FR-28). Pure, so hosts can show or remap them. */

export type EditorAction =
  | 'undo'
  | 'redo'
  | 'delete'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'duplicate'
  | 'selectAll'
  | 'rotate'
  | 'rotateBack'
  | 'flipX'
  | 'flipY'
  | 'cancel'
  | 'editLabel'
  | 'nudgeLeft'
  | 'nudgeRight'
  | 'nudgeUp'
  | 'nudgeDown';

export interface KeyLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/**
 * True for targets that take text input (inputs, textareas, selects, contenteditable). Hosts and the
 * editor controller must not map keys from these targets, since Backspace, Enter and letters are bound.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el !== 'object' || !('tagName' in el)) return false;
  // isContentEditable is missing in some DOMs (jsdom), so fall back to the attribute.
  const ce = el.isContentEditable ?? isEditableAttr(el.getAttribute?.('contenteditable'));
  return !!ce || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/** Maps a keyboard event to an editor action. Ctrl and Cmd are interchangeable. Check `isEditableTarget` first. */
export function actionForKey(e: KeyLike): EditorAction | null {
  const mod = !!(e.ctrlKey || e.metaKey);
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (e.altKey) return null;
  if (mod) {
    switch (key) {
      case 'z':
        return e.shiftKey ? 'redo' : 'undo';
      case 'y':
        return 'redo';
      case 'c':
        return 'copy';
      case 'x':
        return 'cut';
      case 'v':
        return 'paste';
      case 'd':
        return 'duplicate';
      case 'a':
        return 'selectAll';
      default:
        return null;
    }
  }
  switch (key) {
    case 'Delete':
    case 'Backspace':
      return 'delete';
    case 'r':
      return e.shiftKey ? 'rotateBack' : 'rotate';
    case 'h':
      return 'flipX';
    case 'v':
      return 'flipY';
    case 'Escape':
      return 'cancel';
    case 'F2':
    case 'Enter':
      return 'editLabel';
    case 'ArrowLeft':
      return 'nudgeLeft';
    case 'ArrowRight':
      return 'nudgeRight';
    case 'ArrowUp':
      return 'nudgeUp';
    case 'ArrowDown':
      return 'nudgeDown';
    default:
      return null;
  }
}

function isEditableAttr(v: string | null | undefined): boolean {
  return v != null && v !== 'false';
}
