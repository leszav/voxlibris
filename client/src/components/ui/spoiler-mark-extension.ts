import { Mark, mergeAttributes } from "@tiptap/core";

export const SpoilerMark = Mark.create({
  name: "spoiler",

  inclusive: true,

  parseHTML() {
    return [
      {
        tag: 'span[data-spoiler="true"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-spoiler": "true",
      }),
      0,
    ];
  },
});
