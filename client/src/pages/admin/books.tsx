import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  MoreHorizontal, 
  Search, 
  Download,
  BookOpen,
  Upload,
  Eye,
  Ban,
  CheckCircle,
  AlertTriangle,
  Calendar,
  User,
  Clock,
  Trash2
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  genre: string | null;
  cover_url: string | null;
  file_url: string;
  status: 'active' | 'blocked' | 'pending';
  uploaded_by: string;
  upload_date: string;
  file_size: number;
  downloads_count: number;
  clubs_count: number;
  description: string | null;
  source: 'books' | 'personal_books' | 'club_books';
  club_id: string | null;
}

interface BooksResponse {
  books: Book[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

interface BooksFilters {
  search: string;
  status: string;
  genre: string;
  page: number;
  limit: number;
}

async function fetchBooks(filters: BooksFilters): Promise<BooksResponse> {
  const token = localStorage.getItem('accessToken');
  if (!token) throw new Error('No auth token');

  const params = new URLSearchParams();
  if (filters.search) params.append('search', filters.search);
  if (filters.status && filters.status !== 'all') params.append('status', filters.status);
  if (filters.genre && filters.genre !== 'all') params.append('genre', filters.genre);
  params.append('page', filters.page.toString());
  params.append('limit', filters.limit.toString());

  const response = await fetch(`/api/v1/admin/books?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch books');
  }

  return response.json();
}

async function deleteBook(bookId: string, source: string): Promise<void> {
  const token = localStorage.getItem('accessToken');
  if (!token) throw new Error('No auth token');

  const response = await fetch(`/api/v1/admin/books/${bookId}?source=${source}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to delete book');
  }
}

async function updateBookStatus(bookId: string, status: string, source: string): Promise<void> {
  const token = localStorage.getItem('accessToken');
  if (!token) throw new Error('No auth token');

  const response = await fetch(`/api/v1/admin/books/${bookId}/status`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status, source }),
  });

  if (!response.ok) {
    throw new Error('Failed to update book status');
  }
}

function BookStatusBadge({ status }: { status: Book['status'] }) {
  switch (status) {
    case 'active':
      return (
        <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-200">
          <CheckCircle className="w-3 h-3 mr-1" />
          Активна
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="secondary" className="bg-yellow-50 text-yellow-700 border-yellow-200">
          <Clock className="w-3 h-3 mr-1" />
          На модерации
        </Badge>
      );
    case 'blocked':
      return (
        <Badge variant="secondary" className="bg-red-50 text-red-700 border-red-200">
          <Ban className="w-3 h-3 mr-1" />
          Заблокирована
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function BookActionsMenu({ book }: { book: Book }) {
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const deleteBookMutation = useMutation({
    mutationFn: ({ bookId, source }: { bookId: string; source: string }) => deleteBook(bookId, source),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-books'] });
      setShowDeleteDialog(false);
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ bookId, status, source }: { bookId: string; status: string; source: string }) =>
      updateBookStatus(bookId, status, source),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-books'] });
    },
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a href={book.file_url} target="_blank" rel="noopener noreferrer">
              <Eye className="w-4 h-4 mr-2" />
              Просмотреть файл
            </a>
          </DropdownMenuItem>
          {book.status === 'pending' && (
            <DropdownMenuItem
              onClick={() => updateStatusMutation.mutate({ bookId: book.id, status: 'active', source: book.source })}
              disabled={updateStatusMutation.isPending}
              className="text-green-600"
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              Одобрить
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => updateStatusMutation.mutate({ 
              bookId: book.id, 
              status: book.status === 'blocked' ? 'active' : 'blocked',
              source: book.source
            })}
            disabled={updateStatusMutation.isPending}
            className={book.status === 'blocked' ? 'text-green-600' : 'text-red-600'}
          >
            {book.status === 'blocked' ? (
              <>
                <CheckCircle className="w-4 h-4 mr-2" />
                Разблокировать
              </>
            ) : (
              <>
                <Ban className="w-4 h-4 mr-2" />
                Заблокировать
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            disabled={deleteBookMutation.isPending}
            className="text-red-600"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Удалить
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить книгу?</AlertDialogTitle>
            <AlertDialogDescription>
              Вы собираетесь удалить книгу "{book.title}". Это действие необратимо — книга будет удалена окончательно из системы.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteBookMutation.mutate({ bookId: book.id, source: book.source })}
              className="bg-red-600 hover:bg-red-700"
              disabled={deleteBookMutation.isPending}
            >
              {deleteBookMutation.isPending ? 'Удаление...' : 'Удалить'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function BooksTable({ books }: { books: Book[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left p-4 font-medium text-gray-600">Книга</th>
            <th className="text-left p-4 font-medium text-gray-600">Автор</th>
            <th className="text-left p-4 font-medium text-gray-600">Статус</th>
            <th className="text-left p-4 font-medium text-gray-600">Загрузка</th>
            <th className="text-left p-4 font-medium text-gray-600">Популярность</th>
            <th className="text-right p-4 font-medium text-gray-600">Действия</th>
          </tr>
        </thead>
        <tbody>
          {books.map((book) => (
            <tr key={book.id} className="border-b hover:bg-gray-50">
              <td className="p-4">
                <div className="flex items-center gap-3">
                  {book.cover_url ? (
                    <img 
                      src={book.cover_url} 
                      alt={book.title}
                      className="w-12 h-16 object-cover rounded"
                    />
                  ) : (
                    <div className="w-12 h-16 bg-gray-200 rounded flex items-center justify-center">
                      <BookOpen className="h-6 w-6 text-gray-400" />
                    </div>
                  )}
                  <div>
                    <div className="font-medium text-gray-900">{book.title}</div>
                    {book.genre && (
                      <div className="text-sm text-gray-500">{book.genre}</div>
                    )}
                    {book.isbn && (
                      <div className="text-xs text-gray-400">ISBN: {book.isbn}</div>
                    )}
                  </div>
                </div>
              </td>
              <td className="p-4">
                <div className="font-medium text-gray-900">{book.author}</div>
              </td>
              <td className="p-4">
                <BookStatusBadge status={book.status} />
              </td>
              <td className="p-4">
                <div className="text-sm">
                  <div className="flex items-center gap-1 text-gray-500">
                    <User className="w-3 h-3" />
                    {book.uploaded_by}
                  </div>
                  <div className="flex items-center gap-1 text-gray-500">
                    <Calendar className="w-3 h-3" />
                    {new Date(book.upload_date).toLocaleDateString('ru')}
                  </div>
                  <div className="text-gray-400">
                    {formatFileSize(book.file_size)}
                  </div>
                </div>
              </td>
              <td className="p-4">
                <div className="text-sm">
                  <div>{book.downloads_count} загрузок</div>
                  <div className="text-gray-500">{book.clubs_count} клубов</div>
                </div>
              </td>
              <td className="p-4 text-right">
                <BookActionsMenu book={book} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BooksTableSkeleton() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left p-4 font-medium text-gray-600">Книга</th>
            <th className="text-left p-4 font-medium text-gray-600">Автор</th>
            <th className="text-left p-4 font-medium text-gray-600">Статус</th>
            <th className="text-left p-4 font-medium text-gray-600">Загрузка</th>
            <th className="text-left p-4 font-medium text-gray-600">Популярность</th>
            <th className="text-right p-4 font-medium text-gray-600">Действия</th>
          </tr>
        </thead>
        <tbody>
          {[...Array(5)].map((_, i) => (
            <tr key={i} className="border-b">
              <td className="p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-12 h-16 rounded" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              </td>
              <td className="p-4">
                <Skeleton className="h-4 w-24" />
              </td>
              <td className="p-4">
                <Skeleton className="h-6 w-20" />
              </td>
              <td className="p-4">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </td>
              <td className="p-4">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </td>
              <td className="p-4 text-right">
                <Skeleton className="h-8 w-8" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminBooks() {
  const [filters, setFilters] = useState<BooksFilters>({
    search: '',
    status: 'all',
    genre: 'all',
    page: 1,
    limit: 20,
  });

  const { data, isLoading, error } = useQuery<BooksResponse>({
    queryKey: ['admin-books', filters],
    queryFn: () => fetchBooks(filters),
  });

  const handleSearchChange = (search: string) => {
    setFilters(prev => ({ ...prev, search, page: 1 }));
  };

  const handleStatusChange = (status: string) => {
    setFilters(prev => ({ ...prev, status, page: 1 }));
  };

  const handleGenreChange = (genre: string) => {
    setFilters(prev => ({ ...prev, genre, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900">Ошибка загрузки</h3>
            <p className="text-gray-600 mt-2">Не удалось загрузить книги</p>
            <p className="text-sm text-gray-500 mt-1">{errorMessage}</p>
            <Button className="mt-4" onClick={() => window.location.reload()}>
              Попробовать снова
            </Button>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Управление книгами</h1>
            <p className="text-gray-600 mt-2">
              {data && `Найдено ${data.pagination.total} книг`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Экспорт
            </Button>
            <Button>
              <Upload className="h-4 w-4 mr-2" />
              Загрузить книгу
            </Button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Всего книг</p>
                  <p className="text-2xl font-bold">{data?.pagination.total || 0}</p>
                </div>
                <BookOpen className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Активные</p>
                  <p className="text-2xl font-bold text-green-600">
                    {data?.books.filter(b => b.status === 'active').length || 0}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">На модерации</p>
                  <p className="text-2xl font-bold text-yellow-600">
                    {data?.books.filter(b => b.status === 'pending').length || 0}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Заблокированные</p>
                  <p className="text-2xl font-bold text-red-600">
                    {data?.books.filter(b => b.status === 'blocked').length || 0}
                  </p>
                </div>
                <Ban className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Поиск по названию, автору или ISBN..."
                    value={filters.search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Select value={filters.status} onValueChange={handleStatusChange}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Статус" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все статусы</SelectItem>
                  <SelectItem value="active">Активные</SelectItem>
                  <SelectItem value="pending">На модерации</SelectItem>
                  <SelectItem value="blocked">Заблокированные</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.genre} onValueChange={handleGenreChange}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Жанр" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все жанры</SelectItem>
                  <SelectItem value="fiction">Художественная литература</SelectItem>
                  <SelectItem value="non-fiction">Научная литература</SelectItem>
                  <SelectItem value="mystery">Детектив</SelectItem>
                  <SelectItem value="romance">Романтика</SelectItem>
                  <SelectItem value="science-fiction">Научная фантастика</SelectItem>
                  <SelectItem value="fantasy">Фэнтези</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Books Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <BooksTableSkeleton />
            ) : data && data.books.length > 0 ? (
              <BooksTable books={data.books} />
            ) : (
              <div className="text-center py-12">
                <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900">Книги не найдены</h3>
                <p className="text-gray-600 mt-2">Попробуйте изменить фильтры поиска</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {data && data.pagination.total > filters.limit && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Показано {Math.min(filters.limit, data.pagination.total)} из {data.pagination.total} книг
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page === 1}
                onClick={() => handlePageChange(filters.page - 1)}
              >
                Предыдущая
              </Button>
              <span className="text-sm text-gray-600">
                Страница {filters.page} из {Math.ceil(data.pagination.total / filters.limit)}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={filters.page >= Math.ceil(data.pagination.total / filters.limit)}
                onClick={() => handlePageChange(filters.page + 1)}
              >
                Следующая
              </Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}