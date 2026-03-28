import { useMemo } from "react";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import { Sun, Moon, Type, AlignJustify } from "lucide-react";
import type { ReaderSettings } from "@/lib/reader-settings";

const FONT_FAMILIES = [
  { value: "Georgia", label: "Georgia" },
  { value: "Times New Roman", label: "Times New Roman" },
  { value: "Arial", label: "Arial" },
  { value: "Verdana", label: "Verdana" },
  { value: "system-ui", label: "Системный" },
];

interface ReaderControlsProps {
  readonly settings: ReaderSettings;
  readonly onSettingsChange: (settings: ReaderSettings) => void;
  readonly onResetSettings?: () => void;
  readonly isSaving?: boolean;
}

export function ReaderControls({
  settings,
  onSettingsChange,
  onResetSettings,
  isSaving = false,
}: ReaderControlsProps) {
  const updateSetting = useMemo(
    () => (key: keyof ReaderSettings, value: ReaderSettings[typeof key]) => {
      onSettingsChange({ ...settings, [key]: value });
    },
    [onSettingsChange, settings]
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="font-semibold text-lg">Настройки чтения</h3>
        {isSaving && (
          <p className="text-xs text-muted-foreground">Сохраняем настройки...</p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="font-size-slider" className="text-sm flex items-center">
            <Type className="w-4 h-4 mr-2" />
            Размер шрифта
          </label>
          <span className="text-sm text-muted-foreground">
            {settings.fontSize}px
          </span>
        </div>
        <Slider
          id="font-size-slider"
          value={[settings.fontSize]}
          onValueChange={(value) => updateSetting("fontSize", value[0])}
          min={12}
          max={32}
          step={1}
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <span className="text-sm">Шрифт</span>
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
          <label htmlFor="line-height-slider" className="text-sm flex items-center">
            <AlignJustify className="w-4 h-4 mr-2" />
            Интервал
          </label>
          <span className="text-sm text-muted-foreground">
            {settings.lineHeight.toFixed(1)}
          </span>
        </div>
        <Slider
          id="line-height-slider"
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
          <label htmlFor="content-width-slider" className="text-sm">Ширина текста</label>
          <span className="text-sm text-muted-foreground">
            {settings.contentWidth}%
          </span>
        </div>
        <Slider
          id="content-width-slider"
          value={[settings.contentWidth]}
          onValueChange={(value) => updateSetting("contentWidth", value[0])}
          min={60}
          max={95}
          step={5}
          className="w-full"
        />
      </div>

      <div className="space-y-2">
        <span className="text-sm">Тема</span>
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

      <div className="space-y-2">
        <span className="text-sm">Выравнивание</span>
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

      {onResetSettings && (
        <Button
          variant="outline"
          size="sm"
          onClick={onResetSettings}
          className="w-full mt-4"
        >
          Сбросить настройки
        </Button>
      )}
    </div>
  );
}
