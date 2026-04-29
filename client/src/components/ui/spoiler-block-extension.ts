import { Node, mergeAttributes } from "@tiptap/core";

export const SPOILER_BLOCK_LABEL = "Спойлер";

export const SpoilerBlock = Node.create({
  name: "spoilerBlock",

  group: "block",

  content: "block+",

  defining: true,

  isolating: true,

  parseHTML() {
    return [
      {
        tag: 'div[data-spoiler-block="true"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-spoiler-block": "true",
      }),
      [
        "div",
        {
          "data-spoiler-label": "true",
          role: "button",
          tabindex: "0",
          contenteditable: "false",
        },
        SPOILER_BLOCK_LABEL,
      ],
      [
        "div",
        {
          "data-spoiler-content": "true",
        },
        0,
      ],
    ];
  },
});
