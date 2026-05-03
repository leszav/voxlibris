import { Node, mergeAttributes } from "@tiptap/core";

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
      0,
    ];
  },
});
