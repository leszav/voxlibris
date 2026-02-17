import { useMemo } from "react";
import { Button } from "../../ui/button";
import { Slider } from "../../ui/slider";
import { Sun, Moon, Type, AlignJustify } from "lucide-react";

export type ClubReaderSettings = {
  fontSize: number;
  fontFamily: string;
  theme: "light" | "dark" | "sepia";
  lineHeight: number;
  textAlign: "left" | "justify";
  contentWidth: number;
};

export const DEFAULT_CLUB_SETTINGS: ClubReaderSettings = {
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

interface ClubReaderControlsProps {
  clubId: string;
  bookId: string;
  settings: ClubReaderSettings;
  onSettingsChange: (settings: ClubReaderSettings) => void;
}

export function ClubReaderControls({ clubId, bookId, settings, onSettingsChange }: ClubReaderControlsProps) {
  // Мемоизация для оптимизации
  const updateSetting = useMemo(
    () => (key: keyof ClubReaderSettings, value: ClubReaderSettings[typeof key]) => {
      const newSettings = { ...settings, [key]: value };
      // Сохраняем в localStorage
      localStorage.setItem(`clubReaderSettings_${clubId}_${bookId}`, JSON.stringify(newSettings));
      // Уведомляем родителя
      onSettingsChange(newSettings);
    },
    [settings, clubId, bookId, onSettingsChange]
  );

  // Сброс настроек
  const resetSettings = () => {
    localStorage.setItem(`clubReaderSettings_${clubId}_${bookId}`, JSON.stringify(DEFAULT_CLUB_SETTINGS));
    onSettingsChange(DEFAULT_CLUB_SETTINGS);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <h3 className="font-semibold text-sm sm:text-lg mb-3 sm:mb-4">Настройки чтения</h3>

      {/* Размер шрифта */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs sm:text-sm flex items-center">
            <Type className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
            Размер шрифта
          </label>
          <span className="text-xs sm:text-sm text-muted-foreground">
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
        <label className="text-xs sm:text-sm">Тема</label>
        <div className="flex gap-1 sm:gap-2">
          <Button
            variant={settings.theme === "light" ? "secondary" : "outline"}
            size="sm"
            onClick={() => updateSetting("theme", "light")}
            className="flex-1 text-xs py-1"
          >
            <Sun className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
            <span className="hidden sm:inline">Светлая</span>
            <span className="sm:hidden">Св.</span>
          </Button>
          <Button
            variant={settings.theme === "dark" ? "secondary" : "outline"}
            size="sm"
            onClick={() => updateSetting("theme", "dark")}
            className="flex-1 text-xs py-1"
          >
            <Moon className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
            <span className="hidden sm:inline">Темная</span>
            <span className="sm:hidden">Тем.</span>
          </Button>
          <Button
            variant={settings.theme === "sepia" ? "secondary" : "outline"}
            size="sm"
            onClick={() => updateSetting("theme", "sepia")}
            className="flex-1 text-xs py-1"
          >
            <span className="hidden sm:inline">Сепия</span>
            <span className="sm:hidden">Сеп.</span>
          </Button>
        </div>
      </div>

      {/* Выравнивание */}
      <div className="space-y-2">
        <label className="text-xs sm:text-sm">Выравнивание</label>
        <div className="flex gap-1 sm:gap-2">
          <Button
            variant={settings.textAlign === "left" ? "secondary" : "outline"}
            size="sm"
            onClick={() => updateSetting("textAlign", "left")}
            className="flex-1 text-xs py-1"
          >
            <span className="hidden sm:inline">По левому</span>
            <span className="sm:hidden">Лев.</span>
          </Button>
          <Button
            variant={settings.textAlign === "justify" ? "secondary" : "outline"}
            size="sm"
            onClick={() => updateSetting("textAlign", "justify")}
            className="flex-1 text-xs py-1"
          >
            <span className="hidden sm:inline">По ширине</span>
            <span className="sm:hidden">Ширина</span>
          </Button>
        </div>
      </div>

      {/* Сброс */}
      <Button
        variant="outline"
        size="sm"
        onClick={resetSettings}
        className="w-full mt-4"
      >
        Сбросить настройки
      </Button>
    </div>
  );
}