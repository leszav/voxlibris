import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Slider } from "../ui/slider";
import { Sun, Moon, Type, AlignJustify } from "lucide-react";
import {
  applyReaderSettings,
  DEFAULT_READER_SETTINGS,
  normalizeReaderSettings,
  type ReaderSettings,
} from "@/lib/reader-settings";
import { useIsMobile } from "@/hooks/use-mobile";
import { SyncStatusIndicator } from "./SyncStatusIndicator";

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
  readonly onPreviewSettings?: (settings: ReaderSettings) => void;
  readonly onResetSettings?: () => void;
  /** @deprecated Use SyncStatusIndicator component instead */
  readonly isSaving?: boolean;
}

export function ReaderControls({
  settings,
  onSettingsChange,
  onPreviewSettings,
  onResetSettings,
  isSaving: _isSaving = false,
}: ReaderControlsProps) {
  const [localSettings, setLocalSettings] = useState<ReaderSettings>(() => normalizeReaderSettings(settings));
  const commitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMobile = useIsMobile();

  const commitSettings = useCallback((nextSettings: ReaderSettings, delayMs = 180) => {
    if (commitTimeoutRef.current) {
      clearTimeout(commitTimeoutRef.current);
    }

    commitTimeoutRef.current = setTimeout(() => {
      onSettingsChange(nextSettings);
      commitTimeoutRef.current = null;
    }, delayMs);
  }, [onSettingsChange]);

  useEffect(() => {
    const normalizedIncoming = normalizeReaderSettings(settings);
    setLocalSettings(normalizedIncoming);
    applyReaderSettings(normalizedIncoming, "personal");
  }, [settings]);

  useEffect(() => {
    return () => {
      if (commitTimeoutRef.current) {
        clearTimeout(commitTimeoutRef.current);
      }
    };
  }, []);

  const updateSetting = useMemo(
    () => (key: keyof ReaderSettings, value: ReaderSettings[typeof key]) => {
      setLocalSettings((prev) => {
        const nextSettings = normalizeReaderSettings({ ...prev, [key]: value });
        if (onPreviewSettings) {
          onPreviewSettings(nextSettings);
        } else {
          applyReaderSettings(nextSettings, "personal");
        }
        commitSettings(nextSettings);
        return nextSettings;
      });
    },
    [commitSettings, onPreviewSettings]
  );

  const handleReset = useCallback(() => {
    const nextSettings = normalizeReaderSettings(DEFAULT_READER_SETTINGS);
    setLocalSettings(nextSettings);

    if (onResetSettings) {
      onResetSettings();
      return;
    }

    if (onPreviewSettings) {
      onPreviewSettings(nextSettings);
    } else {
      applyReaderSettings(nextSettings, "personal");
    }

    onSettingsChange(nextSettings);
  }, [onPreviewSettings, onResetSettings, onSettingsChange]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Настройки чтения</h3>
          <SyncStatusIndicator showText size="sm" />
        </div>
        {isMobile && (
          <p className="text-xs text-muted-foreground">
            На телефоне используются отдельные настройки этого устройства. При первом открытии применяются 12px / 1.2 / 95%, дальше вы настраиваете их отдельно от десктопа.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="font-size-slider" className="text-sm flex items-center">
            <Type className="w-4 h-4 mr-2" />
            Размер шрифта
          </label>
          <span className="text-sm text-muted-foreground">
            {localSettings.fontSize}px
          </span>
        </div>
        <Slider
          id="font-size-slider"
          value={[localSettings.fontSize]}
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
              variant={localSettings.fontFamily === font.value ? "secondary" : "outline"}
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
            {localSettings.lineHeight.toFixed(1)}
          </span>
        </div>
        <Slider
          id="line-height-slider"
          value={[localSettings.lineHeight]}
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
            {localSettings.contentWidth}%
          </span>
        </div>
        <Slider
          id="content-width-slider"
          value={[localSettings.contentWidth]}
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
            variant={localSettings.theme === "light" ? "secondary" : "outline"}
            size="sm"
            onClick={() => updateSetting("theme", "light")}
            className="flex-1"
          >
            <Sun className="w-4 h-4 mr-2" />
            Светлая
          </Button>
          <Button
            variant={localSettings.theme === "dark" ? "secondary" : "outline"}
            size="sm"
            onClick={() => updateSetting("theme", "dark")}
            className="flex-1"
          >
            <Moon className="w-4 h-4 mr-2" />
            Темная
          </Button>
          <Button
            variant={localSettings.theme === "sepia" ? "secondary" : "outline"}
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
            variant={localSettings.textAlign === "left" ? "secondary" : "outline"}
            size="sm"
            onClick={() => updateSetting("textAlign", "left")}
            className="flex-1 text-xs"
          >
            По левому краю
          </Button>
          <Button
            variant={localSettings.textAlign === "justify" ? "secondary" : "outline"}
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
          onClick={handleReset}
          className="w-full mt-4"
        >
          Сбросить настройки
        </Button>
      )}
    </div>
  );
}
