import { describe, expect, it, vi } from 'vitest';

import type { ContextMenuInput } from '../context-menu';
import { contextMenuTemplate } from '../context-menu';

const allEdits = {
  canUndo: true,
  canRedo: true,
  canCut: true,
  canCopy: true,
  canPaste: true,
  canDelete: true,
  canSelectAll: true,
  canEditRichly: false,
};

const params = (overrides: Partial<ContextMenuInput> = {}): ContextMenuInput => ({
  isEditable: false,
  selectionText: '',
  misspelledWord: '',
  dictionarySuggestions: [],
  editFlags: allEdits,
  ...overrides,
});

function target() {
  return {
    replaceMisspelling: vi.fn(),
    session: { addWordToSpellCheckerDictionary: vi.fn(() => true) },
  };
}

const labels = (items: ReturnType<typeof contextMenuTemplate>) =>
  items.map((item) => item.role ?? item.label ?? item.type);

describe('contextMenuTemplate', () => {
  it('shows nothing on a plain part of the page', () => {
    expect(contextMenuTemplate(params(), target())).toEqual([]);
  });

  it('shows nothing for a whitespace-only selection', () => {
    expect(contextMenuTemplate(params({ selectionText: '  \n' }), target())).toEqual([]);
  });

  it('offers Copy for selected text outside a field', () => {
    expect(labels(contextMenuTemplate(params({ selectionText: 'Album' }), target()))).toEqual([
      'copy',
    ]);
  });

  it('offers the edit items in a text field', () => {
    expect(labels(contextMenuTemplate(params({ isEditable: true }), target()))).toEqual([
      'cut',
      'copy',
      'paste',
      'separator',
      'selectAll',
    ]);
  });

  it('disables edit items the field does not allow', () => {
    const items = contextMenuTemplate(
      params({ isEditable: true, editFlags: { ...allEdits, canCut: false, canCopy: false } }),
      target(),
    );
    expect(items.map((item) => item.enabled)).toEqual([false, false, true, undefined, true]);
  });

  it('puts spelling suggestions first and applies them', () => {
    const spelling = target();
    const items = contextMenuTemplate(
      params({
        isEditable: true,
        misspelledWord: 'phtoo',
        dictionarySuggestions: ['photo', 'photon'],
      }),
      spelling,
    );
    expect(labels(items)).toEqual([
      'photo',
      'photon',
      'Add to Dictionary',
      'separator',
      'cut',
      'copy',
      'paste',
      'separator',
      'selectAll',
    ]);

    items[1].click?.({} as never, undefined, {} as never);
    expect(spelling.replaceMisspelling).toHaveBeenCalledWith('photon');
    items[2].click?.({} as never, undefined, {} as never);
    expect(spelling.session.addWordToSpellCheckerDictionary).toHaveBeenCalledWith('phtoo');
  });

  it('says so when there are no suggestions', () => {
    const items = contextMenuTemplate(
      params({ isEditable: true, misspelledWord: 'nubes' }),
      target(),
    );
    expect(items[0]).toEqual({ label: 'No Guesses Found', enabled: false });
    expect(items[1].label).toBe('Add to Dictionary');
  });
});
