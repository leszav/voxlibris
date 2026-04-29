import React, { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { cn } from "@/lib/utils";
import { modalPrompt, useToast } from "@/hooks/use-toast";
import { SpoilerBlock } from "@/components/ui/spoiler-block-extension";
import {
  Bold, Italic, Strikethrough,
  List, ListOrdered, Quote, Undo, Redo,
  AlignLeft, AlignCenter, AlignRight,
  Link as LinkIcon, ChevronDown, EyeOff,
  Heading1
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

export interface RichTextEditorRef {
  getContent: () => string;
  setContent: (content: string) => void;
  focus: () => void;
}

interface RichTextEditorProps {
  readonly placeholder?: string;
  readonly initialValue?: string;
  readonly onChange?: (content: string) => void;
  readonly className?: string;
  readonly value?: string;
  readonly maxLength?: number;
  readonly enableSpoilerBlocks?: boolean;
}

interface MenuButtonProps {
  readonly onClick: () => void;
  readonly active?: boolean;
  readonly children: React.ReactNode;
  readonly title?: string;
}

function MenuButton({ onClick, active, children, title }: MenuButtonProps): React.ReactElement {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(active && "bg-accent")}
      title={title}
    >
      {children}
    </Button>
  );
}

interface HeadingDropdownProps {
  readonly editor: ReturnType<typeof useEditor>;
}

function HeadingDropdown({ editor }: HeadingDropdownProps): React.ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm">
          <Heading1 className="w-4 h-4" />
          <ChevronDown className="w-3 h-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          Заголовок 1
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          Заголовок 2
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          Заголовок 3
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => editor.chain().focus().setParagraph().run()}>
          Обычный текст
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const RichTextEditor = React.forwardRef<RichTextEditorRef, RichTextEditorProps>(
  ({ initialValue, onChange, className = "", value, maxLength = 3000, enableSpoilerBlocks = false }, ref) => {
    const { toast } = useToast();
    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3],
          },
        }),
        TextStyle,
        Color.configure({
          types: ["textStyle"],
        }),
        Link.configure({
          openOnClick: false,
          linkOnPaste: true,
          autolink: true,
        }),
        TextAlign.configure({
          types: ["heading", "paragraph"],
        }),
        SpoilerBlock,
      ],
      content: value || initialValue || "",
      editorProps: {
        attributes: {
          class: "prose prose-sm max-w-none focus:outline-none p-4",
        },
      },
      onUpdate: ({ editor }) => {
        let content = editor.getHTML();
        // Ограничиваем длину текста
        const textContent = editor.getText();
        if (textContent.length > maxLength) {
          const truncatedText = textContent.substring(0, maxLength);
          editor.commands.setContent(truncatedText);
          content = editor.getHTML();
        }
        onChange?.(content);
      },
    });

    useEffect(() => {
      if (value !== undefined && editor && editor.getHTML() !== value) {
        editor.commands.setContent(value);
      }
    }, [value, editor]);

    const methodsRef = useRef<RichTextEditorRef>({
      getContent: () => {
        return editor?.getHTML() || "";
      },
      setContent: (content: string) => {
        editor?.commands.setContent(content);
      },
      focus: () => {
        editor?.view.focus();
      },
    });

    useEffect(() => {
      if (typeof ref === "function") {
        ref(methodsRef.current);
      } else if (ref) {
        ref.current = methodsRef.current;
      }
    }, [ref, editor]);

    if (!editor) {
      return null;
    }

    const buildSpoilerBlockContent = () => {
      const { from, to, empty } = editor.state.selection;

      if (empty) {
        return null;
      }

      const selectedText = editor.state.doc
        .textBetween(from, to, "\n\n")
        .trim();

      if (!selectedText) {
        return null;
      }

      const paragraphs = selectedText
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.replace(/\n+/g, " ").trim())
        .filter((paragraph) => paragraph.length > 0)
        .map((paragraph) => ({
          type: "paragraph",
          content: [{ type: "text", text: paragraph }],
        }));

      return paragraphs.length > 0 ? paragraphs : null;
    };

    const insertSpoilerBlock = () => {
      const spoilerContent = buildSpoilerBlockContent();
      if (!spoilerContent) {
        toast({
          title: "Сначала выделите текст",
          description: "Спойлер можно создать только для уже выделенного фрагмента текста.",
        });
        return;
      }

      editor.chain().focus().insertContent({
        type: "spoilerBlock",
        content: spoilerContent,
      }).run();
    };

    // Получаем текущую длину текста
    const currentLength = editor.getText().length;
    const isOverLimit = currentLength > maxLength;

    return (
      <div className={cn("border rounded-lg overflow-hidden flex flex-col max-h-[500px]", className)}>
        <style>{`
          .ProseMirror p.is-editor-empty:first-child::before {
            color: hsl(var(--muted-foreground));
            content: attr(data-placeholder);
            float: left;
            height: 0;
            pointer-events: none;
          }
          .ProseMirror {
            outline: none;
            max-height: 400px;
            overflow-y: auto;
            height: 100%;
          }
          .ProseMirror > * + * {
            margin-top: 0.75em;
          }
          .ProseMirror h1, .ProseMirror h2, .ProseMirror h3 {
            line-height: 1.25;
            font-weight: 700;
          }
          .ProseMirror h1 { font-size: 2em; margin-top: 1em; }
          .ProseMirror h2 { font-size: 1.5em; margin-top: 0.75em; }
          .ProseMirror h3 { font-size: 1.25em; margin-top: 0.5em; }
          .ProseMirror ul {
            list-style-type: disc;
            padding-left: 1.5em;
          }
          .ProseMirror ol {
            list-style-type: decimal;
            padding-left: 1.5em;
          }
          .ProseMirror blockquote {
            border-left: 3px solid hsl(var(--primary));
            padding-left: 1em;
            margin-left: 0;
            font-style: italic;
          }
          .ProseMirror a {
            color: hsl(var(--primary));
            text-decoration: underline;
          }
        `}</style>
        <div className="flex items-center gap-1 p-2 border-b bg-muted/50 flex-wrap">
          <HeadingDropdown editor={editor} />
          <MenuButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Жирный (Ctrl+B)">
            <Bold className="w-4 h-4" />
          </MenuButton>
          <MenuButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Курсив (Ctrl+I)">
            <Italic className="w-4 h-4" />
          </MenuButton>
          <MenuButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Зачеркнутый">
            <Strikethrough className="w-4 h-4" />
          </MenuButton>
          <MenuButton onClick={async () => {
            const url = await modalPrompt({
              title: "Добавить ссылку",
              description: "Введите URL:",
              placeholder: "https://example.com",
              confirmLabel: "Добавить",
              cancelLabel: "Отмена",
            });
            if (url) {
              editor.chain().focus().setLink({ href: url }).run();
            }
          }} active={editor.isActive("link")} title="Ссылка">
            <LinkIcon className="w-4 h-4" />
          </MenuButton>
          <div className="w-px h-6 bg-border mx-1" />
          <MenuButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Маркированный список">
            <List className="w-4 h-4" />
          </MenuButton>
          <MenuButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Нумерованный список">
            <ListOrdered className="w-4 h-4" />
          </MenuButton>
          <MenuButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="Цитата">
            <Quote className="w-4 h-4" />
          </MenuButton>
          {enableSpoilerBlocks && (
            <MenuButton onClick={insertSpoilerBlock} title="Скрыть текст в блоке-спойлере">
              <EyeOff className="w-4 h-4" />
            </MenuButton>
          )}
          <div className="w-px h-6 bg-border mx-1" />
          <MenuButton onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="По левому краю">
            <AlignLeft className="w-4 h-4" />
          </MenuButton>
          <MenuButton onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="По центру">
            <AlignCenter className="w-4 h-4" />
          </MenuButton>
          <MenuButton onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="По правому краю">
            <AlignRight className="w-4 h-4" />
          </MenuButton>
          <div className="w-px h-6 bg-border mx-1" />
          <MenuButton onClick={() => editor.chain().focus().undo().run()} title="Отменить (Ctrl+Z)">
            <Undo className="w-4 h-4" />
          </MenuButton>
          <MenuButton onClick={() => editor.chain().focus().redo().run()} title="Повторить (Ctrl+Y)">
            <Redo className="w-4 h-4" />
          </MenuButton>
        </div>
        <div className="flex-1 overflow-hidden min-h-[200px]">
          <EditorContent editor={editor} />
        </div>
        {maxLength !== undefined && (
          <div className={`px-3 py-1 text-xs border-t ${isOverLimit ? 'text-red-500 bg-red-50' : 'text-muted-foreground'}`}>
            Символов: {currentLength}/{maxLength}
          </div>
        )}
      </div>
    );
  }
);

RichTextEditor.displayName = "RichTextEditor";
