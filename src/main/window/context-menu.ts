import type { ContextMenuParams, MenuItemConstructorOptions } from 'electron';

/** The parts of the `context-menu` event's params the menu depends on. */
export type ContextMenuInput = Pick<
  ContextMenuParams,
  'isEditable' | 'selectionText' | 'misspelledWord' | 'dictionarySuggestions' | 'editFlags'
>;

/** What the spelling items act on: the window's webContents and its session. */
export interface SpellingTarget {
  replaceMisspelling(text: string): void;
  session: { addWordToSpellCheckerDictionary(word: string): boolean };
}

/**
 * The right-click menu for a point in the page:
 *
 * - On a misspelled word: its suggestions, then "Add to Dictionary".
 * - In an editable field: Cut, Copy, Paste and Select All, each enabled per `editFlags`.
 * - On selected text outside a field: Copy.
 * - Anywhere else: nothing, so no menu opens.
 */
export function contextMenuTemplate(
  params: ContextMenuInput,
  target: SpellingTarget,
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [];

  if (params.isEditable && params.misspelledWord) {
    const word = params.misspelledWord;
    if (params.dictionarySuggestions.length === 0) {
      items.push({ label: 'No Guesses Found', enabled: false });
    }
    for (const suggestion of params.dictionarySuggestions) {
      items.push({ label: suggestion, click: () => target.replaceMisspelling(suggestion) });
    }
    items.push(
      {
        label: 'Add to Dictionary',
        click: () => target.session.addWordToSpellCheckerDictionary(word),
      },
      { type: 'separator' },
    );
  }

  if (params.isEditable) {
    const flags = params.editFlags;
    items.push(
      { role: 'cut', enabled: flags.canCut },
      { role: 'copy', enabled: flags.canCopy },
      { role: 'paste', enabled: flags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', enabled: flags.canSelectAll },
    );
  } else if (params.selectionText.trim() !== '') {
    items.push({ role: 'copy' });
  }

  return items;
}
