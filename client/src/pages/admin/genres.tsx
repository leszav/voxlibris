import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { modalAlert } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Search, Save } from "lucide-react";

interface AdminGenre {
  id: string;
  code: string;
  labelRu: string;
  labelEn: string | null;
  groupKey: string | null;
  description: string | null;
  aliases: string[];
  sortOrder: number;
  isActive: boolean;
}

interface GenreFormState {
  code: string;
  labelRu: string;
  labelEn: string;
  groupKey: string;
  description: string;
  aliases: string;
  sortOrder: string;
  isActive: boolean;
}

const emptyForm: GenreFormState = {
  code: "",
  labelRu: "",
  labelEn: "",
  groupKey: "",
  description: "",
  aliases: "",
  sortOrder: "0",
  isActive: true,
};

async function fetchGenres(search: string): Promise<AdminGenre[]> {
  const params = new URLSearchParams();
  if (search.trim()) {
    params.append("search", search.trim());
  }

  const query = params.toString();
  const url = query ? `/api/v1/admin/genres?${query}` : "/api/v1/admin/genres";

  return apiRequest<AdminGenre[]>(url);
}

async function createGenre(payload: GenreFormState): Promise<void> {
  await apiRequest("/api/v1/admin/genres", {
    method: "POST",
    body: JSON.stringify({
      code: payload.code.trim(),
      labelRu: payload.labelRu.trim(),
      labelEn: payload.labelEn.trim() || null,
      groupKey: payload.groupKey.trim() || null,
      description: payload.description.trim() || null,
      aliases: payload.aliases.split(",").map((item) => item.trim()).filter(Boolean),
      sortOrder: Number(payload.sortOrder || 0),
      isActive: payload.isActive,
    }),
  });
}

async function updateGenre(code: string, payload: GenreFormState): Promise<void> {
  await apiRequest(`/api/v1/admin/genres/${code}`, {
    method: "PUT",
    body: JSON.stringify({
      labelRu: payload.labelRu.trim(),
      labelEn: payload.labelEn.trim() || null,
      groupKey: payload.groupKey.trim() || null,
      description: payload.description.trim() || null,
      aliases: payload.aliases.split(",").map((item) => item.trim()).filter(Boolean),
      sortOrder: Number(payload.sortOrder || 0),
      isActive: payload.isActive,
    }),
  });
}

function mapGenreToForm(genre: AdminGenre): GenreFormState {
  return {
    code: genre.code,
    labelRu: genre.labelRu,
    labelEn: genre.labelEn || "",
    groupKey: genre.groupKey || "",
    description: genre.description || "",
    aliases: genre.aliases.join(", "),
    sortOrder: String(genre.sortOrder),
    isActive: genre.isActive,
  };
}

export default function AdminGenres() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [form, setForm] = useState<GenreFormState>(emptyForm);

  const { data: genres = [], isLoading } = useQuery({
    queryKey: ["admin-genres", search],
    queryFn: () => fetchGenres(search),
  });

  const selectedGenre = useMemo(
    () => genres.find((genre) => genre.code === selectedCode) ?? null,
    [genres, selectedCode],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (selectedGenre) {
        return updateGenre(selectedGenre.code, form);
      }

      return createGenre(form);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-genres"] });
      await modalAlert({
        title: selectedGenre ? "Жанр обновлён" : "Жанр создан",
        description: selectedGenre ? "Изменения сохранены" : "Новый жанр добавлен в каталог",
      });
      if (!selectedGenre) {
        setForm(emptyForm);
      }
    },
    onError: async (error: Error) => {
      await modalAlert({
        title: "Не удалось сохранить жанр",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const canEdit = user?.role === "admin";

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Жанры</h1>
          <p className="mt-2 text-gray-600">Ручное управление каталогом жанров без правки seed-файлов.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-start">
          <Card>
            <CardContent className="flex h-[70vh] flex-col p-4 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по коду или названию"
                  className="pl-9"
                />
              </div>

              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-gray-600">
                      <th className="p-3 w-20">Порядок</th>
                      <th className="p-3">Код</th>
                      <th className="p-3">Название</th>
                      <th className="p-3">Группа</th>
                      <th className="p-3">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!isLoading && genres.map((genre) => (
                      <tr
                        key={genre.id}
                        className={`cursor-pointer border-b hover:bg-gray-50 ${selectedCode === genre.code ? "bg-blue-50" : ""}`}
                        onClick={() => {
                          setSelectedCode(genre.code);
                          setForm(mapGenreToForm(genre));
                        }}
                      >
                        <td className="p-3 font-medium text-gray-700">{genre.sortOrder}</td>
                        <td className="p-3 font-mono text-xs">{genre.code}</td>
                        <td className="p-3">{genre.labelRu}</td>
                        <td className="p-3">{genre.groupKey || "-"}</td>
                        <td className="p-3">
                          <Badge variant={genre.isActive ? "secondary" : "outline"}>
                            {genre.isActive ? "Активен" : "Выключен"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!isLoading && genres.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">Ничего не найдено.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">{selectedGenre ? "Редактирование жанра" : "Новый жанр"}</h2>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedCode(null);
                    setForm(emptyForm);
                  }}
                >
                  Новый
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="genre-code">Код</Label>
                <Input
                  id="genre-code"
                  value={form.code}
                  disabled={Boolean(selectedGenre)}
                  onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="genre-label-ru">Название RU</Label>
                <Input
                  id="genre-label-ru"
                  value={form.labelRu}
                  onChange={(e) => setForm((prev) => ({ ...prev, labelRu: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="genre-label-en">Название EN</Label>
                <Input
                  id="genre-label-en"
                  value={form.labelEn}
                  onChange={(e) => setForm((prev) => ({ ...prev, labelEn: e.target.value }))}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="genre-group">Группа</Label>
                  <Input
                    id="genre-group"
                    value={form.groupKey}
                    onChange={(e) => setForm((prev) => ({ ...prev, groupKey: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="genre-sort">Порядок</Label>
                  <Input
                    id="genre-sort"
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Меньше число = выше в списке. Например: 50 встанет между 40 и 60.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="genre-aliases">Алиасы</Label>
                <Input
                  id="genre-aliases"
                  value={form.aliases}
                  onChange={(e) => setForm((prev) => ({ ...prev, aliases: e.target.value }))}
                  placeholder="Через запятую"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="genre-description">Описание</Label>
                <Textarea
                  id="genre-description"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  rows={4}
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                />
                Жанр активен
              </label>

              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!canEdit || saveMutation.isPending || !form.code.trim() || !form.labelRu.trim()}
                className="w-full"
              >
                <Save className="mr-2 h-4 w-4" />
                Сохранить
              </Button>

              {!canEdit && (
                <p className="text-sm text-muted-foreground">Редактирование доступно только администраторам.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
