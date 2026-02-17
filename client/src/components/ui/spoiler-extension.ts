import { Node, mergeAttributes } from '@tiptap/core';

export interface SpoilerOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    spoiler: {
      /**
       * Toggle a spoiler
       */
      toggleSpoiler: () => ReturnType;
      /**
       * Set a spoiler
       */
      setSpoiler: () => ReturnType;
      /**
       * Unset a spoiler
       */
      unsetSpoiler: () => ReturnType;
    };
  }
}

export const Spoiler = Node.create<SpoilerOptions>({
  name: 'spoiler',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  group: 'block',

  content: 'inline*',

  parseHTML() {
    return [
      {
        tag: 'div[data-spoiler]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-spoiler': 'true',
        class: 'spoiler-block',
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setSpoiler:
        () =>
        ({ commands }) => {
          return commands.wrapIn(this.name);
        },
      toggleSpoiler:
        () =>
        ({ commands }) => {
          return commands.toggleWrap(this.name);
        },
      unsetSpoiler:
        () =>
        ({ commands }) => {
          return commands.lift(this.name);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-s': () => this.editor.commands.toggleSpoiler(),
    };
  },
});
