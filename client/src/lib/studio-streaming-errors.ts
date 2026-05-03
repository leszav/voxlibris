export async function getStudioStreamStartErrorMessage(response: Response): Promise<string | null> {
  if (response.ok) {
    return null;
  }

  const body = await response.json().catch(() => ({}));
  return body.error ?? `Сервер отклонил подключение (${response.status})`;
}

export function getStudioStreamConnectionErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.name === 'AbortError') {
    return null;
  }

  return `Ошибка соединения со стримом: ${error instanceof Error ? error.message : String(error)}`;
}
