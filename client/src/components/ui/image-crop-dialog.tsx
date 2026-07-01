import { useState, useCallback } from "react";
import Cropper from "react-easy-crop";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageCropDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly image: string; // base64 или URL изображения
  readonly aspectRatio?: number; // 16/9 для фонов, 2/3 для обложек, 1 для аватаров
  readonly onCropComplete: (croppedImage: string) => void;
  readonly title?: string;
  readonly maxWidth?: number; // максимальная ширина финального изображения
  readonly maxHeight?: number; // максимальная высота финального изображения
}

// Утилита для создания canvas и обрезки изображения
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: CropArea,
  maxWidth?: number,
  maxHeight?: number
): Promise<string> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('No 2d context');
  }

  // Размеры обрезанной области
  let outputWidth = pixelCrop.width;
  let outputHeight = pixelCrop.height;

  // Если заданы максимальные размеры, масштабируем
  if (maxWidth && outputWidth > maxWidth) {
    const scale = maxWidth / outputWidth;
    outputWidth = maxWidth;
    outputHeight = outputHeight * scale;
  }
  
  if (maxHeight && outputHeight > maxHeight) {
    const scale = maxHeight / outputHeight;
    outputHeight = maxHeight;
    outputWidth = outputWidth * scale;
  }

  canvas.width = outputWidth;
  canvas.height = outputHeight;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputWidth,
    outputHeight
  );

  return canvas.toDataURL('image/webp', 0.9);
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', () => reject(new Error('Failed to load image')));
    image.src = url;
  });
}

export function ImageCropDialog({
  open,
  onOpenChange,
  image,
  aspectRatio = 16 / 9,
  onCropComplete,
  title = "Настройка изображения",
  maxWidth = 1920,
  maxHeight = 1080,
}: Readonly<ImageCropDialogProps>) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropCompleteHandler = useCallback(
    (_croppedArea: CropArea, croppedAreaPixels: CropArea) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const handleSave = async () => {
    if (!croppedAreaPixels) return;
    
    setIsProcessing(true);
    try {
      const croppedImage = await getCroppedImg(
        image,
        croppedAreaPixels,
        maxWidth,
        maxHeight
      );
      onCropComplete(croppedImage);
      onOpenChange(false);
    } catch (error) {
      console.error('Ошибка обрезки изображения:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    onOpenChange(false);
  };

  const handleReset = () => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Переместите и масштабируйте изображение для лучшего вида
          </p>
        </DialogHeader>

        {/* Область кропа */}
        <div className="relative h-[400px] bg-muted rounded-lg overflow-hidden">
          <Cropper
            image={image}
            crop={crop}
            zoom={zoom}
            aspect={aspectRatio}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropCompleteHandler}
            style={{
              containerStyle: {
                backgroundColor: 'hsl(var(--muted))',
              },
            }}
          />
        </div>

        {/* Элементы управления */}
        <div className="space-y-4 py-4">
          {/* Зум */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <ZoomOut className="w-4 h-4" />
                Масштаб
              </Label>
              <span className="text-sm text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Slider
                value={[zoom]}
                onValueChange={([value]) => setZoom(value)}
                min={1}
                max={3}
                step={0.1}
                className="flex-1"
              />
              <ZoomIn className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>

          {/* Сброс */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="w-full"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Сбросить
          </Button>
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isProcessing}
          >
            Отмена
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isProcessing}
          >
            {isProcessing ? "Обработка..." : "Применить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
