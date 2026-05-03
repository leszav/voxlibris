import { useEffect, useState } from "react";

export interface GridBreakpoints {
  /** Ширина (px), с которой переходим с 1 на 2 колонки. По умолчанию 640 (sm). */
  sm: number;
  /** Ширина (px), с которой переходим с 2 на 3 колонки. По умолчанию 1280 (xl). */
  lg: number;
}

const DEFAULT_BREAKPOINTS: GridBreakpoints = { sm: 640, lg: 1280 };

type GridColumns = 1 | 2 | 3;

function getColumns(width: number, bp: GridBreakpoints): GridColumns {
  if (width >= bp.lg) return 3;
  if (width >= bp.sm) return 2;
  return 1;
}

/**
 * Возвращает текущее количество колонок грида карточек (1 | 2 | 3).
 *
 * По умолчанию использует breakpoints каталога (sm=640, xl=1280).
 * Для главной страницы передайте { sm: 768, lg: 1024 } (md/lg).
 */
export function useGridColumns(breakpoints: GridBreakpoints = DEFAULT_BREAKPOINTS): GridColumns {
  const [cols, setCols] = useState<GridColumns>(() =>
    globalThis.window === undefined ? 3 : getColumns(globalThis.window.innerWidth, breakpoints),
  );

  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? globalThis.window.innerWidth;
      setCols(getColumns(width, breakpoints));
    });
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  // breakpoints — объект, поэтому стабилизируем через sm/lg
  }, [breakpoints.sm, breakpoints.lg]);

  return cols;
}
