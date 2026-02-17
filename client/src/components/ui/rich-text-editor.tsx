import React, { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import { Spoiler } from "./spoiler-extension";
import { cn } from "@/lib/utils";
import { modalPrompt } from "@/hooks/use-toast";
import {
  Bold, Italic, Strikethrough,
  List, ListOrdered, Quote, Undo, Redo,
  AlignLeft, AlignCenter, AlignRight,
  Link as LinkIcon, ChevronDown,
  Heading1, EyeOff
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
  placeholder?: string;
  initialValue?: string;
  onChange?: (content: string) => void;
  className?: string;
  value?: string;
  maxLength?: number;
}

export const RichTextEditor = React.forwardRef<RichTextEditorRef, RichTextEditorProps>(
  ({ initialValue, onChange, className = "", value, maxLength = 3000 }, ref) => {
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
        Spoiler,
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
    }, [value]);

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

    // Получаем текущую длину текста
    const currentLength = editor?.getText().length || 0;
    const isOverLimit = currentLength > maxLength;

    useEffect(() => {
      if (typeof ref === "function") {
        ref(methodsRef.current);
      } else if (ref) {
        ref.current = methodsRef.current;
      }
    }, [ref]);

    if (!editor) {
      return null;
    }

    const MenuButton = ({ onClick, active, children, title }: { onClick: () => void; active?: boolean; children: React.ReactNode; title?: string }) => (
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

    const HeadingDropdown = () => (
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
          .ProseMirror .spoiler-block {
            background: hsl(var(--muted));
            border: 1px dashed hsl(var(--border));
            border-radius: 4px;
            padding: 8px 12px;
            margin: 4px 0;
            position: relative;
          }
          .ProseMirror .spoiler-block::before {
            content: "СПОЙЛЕР";
            position: absolute;
            top: 2px;
            right: 6px;
            font-size: 10px;
            color: hsl(var(--muted-foreground));
            font-weight: 600;
            text-transform: uppercase;
          }
        `}</style>
        <div className="flex items-center gap-1 p-2 border-b bg-muted/50 flex-wrap">
          <HeadingDropdown />
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
          <MenuButton onClick={() => editor.chain().focus().toggleSpoiler().run()} active={editor.isActive("spoiler")} title="Спойлер (Ctrl+Shift+S)">
            <EyeOff className="w-4 h-4" />
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
        {maxLength && (
          <div className={`px-3 py-1 text-xs border-t ${isOverLimit ? 'text-red-500 bg-red-50' : 'text-muted-foreground'}`}>
            Символов: {currentLength}/{maxLength}
          </div>
        )}
      </div>
    );
  }
);

RichTextEditor.displayName = "RichTextEditor";
