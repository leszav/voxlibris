import { useMemo } from "react";
import { Button } from "../../ui/button";
import { Slider } from "../../ui/slider";
import { Sun, Moon, Type, AlignJustify } from "lucide-react";
import {
  DEFAULT_READER_SETTINGS,
  type ReaderSettings as ClubReaderSettings,
} from "@/lib/reader-settings";

export { DEFAULT_READER_SETTINGS as DEFAULT_CLUB_SETTINGS };
export type { ReaderSettings as ClubReaderSettings } from "@/lib/reader-settings";

const FONT_FAMILIES = [
  { value: "Georgia", label: "Georgia" },
  { value: "Times New Roman", label: "Times New Roman" },
  { value: "Arial", label: "Arial" },
  { value: "Verdana", label: "Verdana" },
  { value: "system-ui", label: "Системный" },
];

interface ClubReaderControlsProps {
  settings: ClubReaderSettings;
  onSettingsChange: (settings: ClubReaderSettings) => void;
  onResetSettings?: () => void;
  isSaving?: boolean;
}

export function ClubReaderControls({
  settings,
  onSettingsChange,
  onResetSettings,
  isSaving = false,
}: ClubReaderControlsProps) {
  const updateSetting = useMemo(
    () => (key: keyof ClubReaderSettings, value: ClubReaderSettings[typeof key]) => {
      onSettingsChange({ ...settings, [key]: value });
    },
    [settings, onSettingsChange]
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="space-y-1">
        <h3 className="font-semibold text-sm sm:text-lg">Настройки чтения</h3>
        {isSaving && (
          <p className="text-xs text-muted-foreground">Сохраняем настройки...</p>
        )}
      </div>

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

      <Button
        variant="outline"
        size="sm"
        onClick={onResetSettings ?? (() => onSettingsChange(DEFAULT_READER_SETTINGS))}
        className="w-full mt-4"
      >
        Сбросить настройки
      </Button>
    </div>
  );
}
