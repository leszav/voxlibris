import { useState } from "react";
import type { Note } from "@shared/schema";
import { useAddNote, useUpdateNote, useDeleteNote } from "../../hooks/use-reader";
import { modalConfirm } from "../../hooks/use-toast";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Trash2, Plus, Edit2, Check, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface NotesPanelProps {
  bookId: string;
  notes: Note[];
}

const COLOR_OPTIONS = [
  { value: "yellow", label: "Желтый", class: "bg-yellow-200" },
  { value: "blue", label: "Синий", class: "bg-blue-200" },
  { value: "green", label: "Зеленый", class: "bg-green-200" },
  { value: "pink", label: "Розовый", class: "bg-pink-200" },
  { value: "purple", label: "Фиолетовый", class: "bg-purple-200" },
];

export function NotesPanel({ bookId, notes }: NotesPanelProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [newNoteColor, setNewNoteColor] = useState("yellow");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const { mutate: addNote, isPending: isAddingNote } = useAddNote(bookId);
  const { mutate: updateNote } = useUpdateNote(bookId);
  const { mutate: deleteNote } = useDeleteNote(bookId);

  const handleAdd = () => {
    if (!newNoteText.trim()) return;

    // Получаем текущую позицию (в реальности - из ContentRenderer)
    const currentPosition = JSON.stringify({
      scrollTop: 0,
    });

    addNote(
      {
        position: currentPosition,
        noteText: newNoteText,
        color: newNoteColor,
        chapterNumber: 1, // TODO: получать из контекста
      },
      {
        onSuccess: () => {
          setNewNoteText("");
          setNewNoteColor("yellow");
          setIsAdding(false);
        },
      }
    );
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setEditText(note.noteText);
  };

  const handleUpdate = (noteId: string, color: string) => {
    if (!editText.trim()) return;

    updateNote(
      { noteId, noteText: editText, color },
      {
        onSuccess: () => {
          setEditingId(null);
          setEditText("");
        },
      }
    );
  };

  const handleDelete = async (noteId: string) => {
    const confirmed = await modalConfirm({
      title: "Удалить заметку?",
      description: "Это действие необратимо.",
      confirmLabel: "Удалить",
      cancelLabel: "Отмена",
      variant: "destructive",
    });

    if (confirmed) {
      deleteNote(noteId);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-lg">Заметки</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsAdding(!isAdding)}
        >
          {isAdding ? "Отмена" : <Plus className="w-4 h-4" />}
        </Button>
      </div>

      {/* Форма добавления */}
      {isAdding && (
        <div className="space-y-2 p-3 border rounded-lg bg-muted/50">
          <Textarea
            placeholder="Текст заметки"
            value={newNoteText}
            onChange={(e) => setNewNoteText(e.target.value)}
            rows={3}
            autoFocus
          />

          <div className="flex gap-1">
            {COLOR_OPTIONS.map((color) => (
              <button
                key={color.value}
                className={`w-8 h-8 rounded ${color.class} border-2 ${
                  newNoteColor === color.value
                    ? "border-foreground"
                    : "border-transparent"
                }`}
                onClick={() => setNewNoteColor(color.value)}
                title={color.label}
              />
            ))}
          </div>

          <Button
            onClick={handleAdd}
            disabled={isAddingNote || !newNoteText.trim()}
            className="w-full"
            size="sm"
          >
            Добавить заметку
          </Button>
        </div>
      )}

      {/* Список заметок */}
      <div className="space-y-2">
        {notes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Заметок пока нет
          </p>
        ) : (
          notes.map((note) => {
            const color = COLOR_OPTIONS.find((c) => c.value === note.color);
            const isEditing = editingId === note.id;

            return (
              <div
                key={note.id}
                className={`p-3 border rounded-lg transition-colors group ${
                  color?.class || "bg-yellow-50"
                }`}
              >
                <div className="space-y-2">
                  {/* Выделенный текст */}
                  {note.highlightedText && (
                    <p className="text-sm italic text-muted-foreground border-l-2 border-foreground pl-2">
                      "{note.highlightedText}"
                    </p>
                  )}

                  {/* Текст заметки */}
                  {isEditing ? (
                    <Textarea
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      rows={3}
                      className="w-full"
                    />
                  ) : (
                    <p className="text-sm">{note.noteText}</p>
                  )}

                  {/* Метаданные и действия */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div>
                      {note.chapterNumber && (
                        <span className="mr-2">Глава {note.chapterNumber}</span>
                      )}
                      <span>
                        {formatDistanceToNow(new Date(note.createdAt), {
                          addSuffix: true,
                          locale: ru,
                        })}
                      </span>
                    </div>

                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isEditing ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleUpdate(note.id, note.color)}
                          >
                            <Check className="w-3 h-3 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setEditingId(null);
                              setEditText("");
                            }}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => startEdit(note)}
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleDelete(note.id)}
                          >
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
