import { useState, useEffect, useMemo } from "react";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import { Sun, Moon, Type, AlignJustify } from "lucide-react";

export interface ReaderSettings {
  fontSize: number;
  fontFamily: string;
  theme: "light" | "dark" | "sepia";
  lineHeight: number;
  textAlign: "left" | "justify";
  contentWidth: number;
}

const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 18,
  fontFamily: "Georgia",
  theme: "light",
  lineHeight: 1.8,
  textAlign: "justify",
  contentWidth: 80,
};

const FONT_FAMILIES = [
  { value: "Georgia", label: "Georgia" },
  { value: "Times New Roman", label: "Times New Roman" },
  { value: "Arial", label: "Arial" },
  { value: "Verdana", label: "Verdana" },
  { value: "system-ui", label: "Системный" },
];

interface ReaderControlsProps {
  bookId: string;
}

export function ReaderControls({ bookId: _bookId }: ReaderControlsProps) {
  const [settings, setSettings] = useState<ReaderSettings>(() => {
    const saved = localStorage.getItem("readerSettings");
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  // Применение настроек при монтировании компонента
  useEffect(() => {
    const saved = localStorage.getItem("readerSettings");
    const initialSettings = saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    applySettings(initialSettings);
  }, []);

  // Сохранение настроек
  useEffect(() => {
    localStorage.setItem("readerSettings", JSON.stringify(settings));
    applySettings(settings);
  }, [settings]);

  // Применение настроек к документу
  const applySettings = (settings: ReaderSettings) => {
    const root = document.documentElement;
    root.style.setProperty("--reader-font-size", `${settings.fontSize}px`);
    root.style.setProperty("--reader-font-family", settings.fontFamily);
    root.style.setProperty("--reader-line-height", settings.lineHeight.toString());
    root.style.setProperty("--reader-text-align", settings.textAlign);
    root.style.setProperty("--reader-content-width", `${settings.contentWidth}%`);

    // Тема - применяем через data-атрибут для всей страницы
    root.setAttribute('data-reader-theme', settings.theme);
    
    // Удаляем старые классы и добавляем новые
    document.body.classList.remove("reader-light", "reader-dark", "reader-sepia");
    document.body.classList.add(`reader-${settings.theme}`);
  };

  // Cleanup при размонтировании - удаляем классы и переменные ридера
  useEffect(() => {
    return () => {
      document.body.classList.remove("reader-light", "reader-dark", "reader-sepia");
      const root = document.documentElement;
      root.style.removeProperty("--reader-font-size");
      root.style.removeProperty("--reader-font-family");
      root.style.removeProperty("--reader-line-height");
      root.style.removeProperty("--reader-text-align");
      root.style.removeProperty("--reader-content-width");
      root.removeAttribute('data-reader-theme');
    };
  }, []);

  // Мемоизация для оптимизации
  const updateSetting = useMemo(
    () => (key: keyof ReaderSettings, value: ReaderSettings[typeof key]) => {
      setSettings((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  return (
    <div className="space-y-6">
      <h3 className="font-semibold text-lg mb-4">Настройки чтения</h3>

      {/* Размер шрифта */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm flex items-center">
            <Type className="w-4 h-4 mr-2" />
            Размер шрифта
          </label>
          <span className="text-sm text-muted-foreground">
            {settings.fontSize}px
          </span>
        </div>
        <Slider
          value={[settings.fontSize]}
          onValueChange={(value) => updateSetting("fontSize", value[0])}
          min={12}
          max={32}
          step={1}
          className="w-full"
        />
      </div>

      {/* Шрифт */}
      <div className="space-y-2">
        <label className="text-sm">Шрифт</label>
        <div className="grid grid-cols-2 gap-2">
          {FONT_FAMILIES.map((font) => (
            <Button
              key={font.value}
              variant={settings.fontFamily === font.value ? "secondary" : "outline"}
              size="sm"
              onClick={() => updateSetting("fontFamily", font.value)}
              className="text-xs"
            >
              {font.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Межстрочный интервал */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm flex items-center">
            <AlignJustify className="w-4 h-4 mr-2" />
            Интервал
          </label>
          <span className="text-sm text-muted-foreground">
            {settings.lineHeight.toFixed(1)}
          </span>
        </div>
        <Slider
          value={[settings.lineHeight]}
          onValueChange={(value) => updateSetting("lineHeight", value[0])}
          min={1.2}
          max={2.5}
          step={0.1}
          className="w-full"
        />
      </div>

      {/* Ширина текста */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm">Ширина текста</label>
          <span className="text-sm text-muted-foreground">
            {settings.contentWidth}%
          </span>
        </div>
        <Slider
          value={[settings.contentWidth]}
          onValueChange={(value) => updateSetting("contentWidth", value[0])}
          min={60}
          max={95}
          step={5}
          className="w-full"
        />
      </div>

      {/* Тема */}
      <div className="space-y-2">
        <label className="text-sm">Тема</label>
        <div className="flex gap-2">
          <Button
            variant={settings.theme === "light" ? "secondary" : "outline"}
            size="sm"
            onClick={() => updateSetting("theme", "light")}
            className="flex-1"
          >
            <Sun className="w-4 h-4 mr-2" />
            Светлая
          </Button>
          <Button
            variant={settings.theme === "dark" ? "secondary" : "outline"}
            size="sm"
            onClick={() => updateSetting("theme", "dark")}
            className="flex-1"
          >
            <Moon className="w-4 h-4 mr-2" />
            Темная
          </Button>
          <Button
            variant={settings.theme === "sepia" ? "secondary" : "outline"}
            size="sm"
            onClick={() => updateSetting("theme", "sepia")}
            className="flex-1 text-xs"
          >
            Сепия
          </Button>
        </div>
      </div>

      {/* Выравнивание */}
      <div className="space-y-2">
        <label className="text-sm">Выравнивание</label>
        <div className="flex gap-2">
          <Button
            variant={settings.textAlign === "left" ? "secondary" : "outline"}
            size="sm"
            onClick={() => updateSetting("textAlign", "left")}
            className="flex-1 text-xs"
          >
            По левому краю
          </Button>
          <Button
            variant={settings.textAlign === "justify" ? "secondary" : "outline"}
            size="sm"
            onClick={() => updateSetting("textAlign", "justify")}
            className="flex-1 text-xs"
          >
            По ширине
          </Button>
        </div>
      </div>

      {/* Сброс */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setSettings(DEFAULT_SETTINGS)}
        className="w-full mt-4"
      >
        Сбросить настройки
      </Button>
    </div>
  );
}
