import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { MessageCircle, Send, Loader2 } from "lucide-react";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FeedbackFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

const subjectOptions = [
  { value: "general", label: "Общий вопрос" },
  { value: "technical", label: "Техническая проблема" },
  { value: "feature", label: "Предложение функции" },
  { value: "bug", label: "Сообщение об ошибке" },
  { value: "partnership", label: "Партнерство" },
  { value: "other", label: "Другое" },
];

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [formData, setFormData] = useState<FeedbackFormData>({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<FeedbackFormData>>({});

  const validateForm = (): boolean => {
    const newErrors: Partial<FeedbackFormData> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Имя обязательно";
    } else if (formData.name.length > 100) {
      newErrors.name = "Имя слишком длинное";
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim()) {
      newErrors.email = "Email обязателен";
    } else if (!emailRegex.test(formData.email)) {
      newErrors.email = "Некорректный email";
    }

    if (!formData.subject) {
      newErrors.subject = "Выберите тему сообщения";
    }

    if (!formData.message.trim()) {
      newErrors.message = "Сообщение обязательно";
    } else if (formData.message.length < 10) {
      newErrors.message = "Сообщение слишком короткое";
    } else if (formData.message.length > 2000) {
      newErrors.message = "Сообщение слишком длинное";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/v1/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        toast({
          title: "Сообщение отправлено",
          description: result.message || "Мы свяжемся с вами в ближайшее время.",
        });
        
        // Сбрасываем форму и закрываем модал
        setFormData({ name: "", email: "", subject: "", message: "" });
        setErrors({});
        onClose();
      } else {
        // Обрабатываем ошибки валидации
        if (result.errors && Array.isArray(result.errors)) {
          const fieldErrors: Partial<FeedbackFormData> = {};
          result.errors.forEach((error: { field: string; message: string }) => {
            fieldErrors[error.field as keyof FeedbackFormData] = error.message;
          });
          setErrors(fieldErrors);
        }
        
        toast({
          title: "Ошибка отправки",
          description: result.message || "Не удалось отправить сообщение. Попробуйте позже.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Feedback submission error:", error);
      toast({
        title: "Ошибка сети",
        description: "Не удалось отправить сообщение. Проверьте подключение к интернету.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof FeedbackFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Очищаем ошибку для поля при изменении
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <MessageCircle className="h-6 w-6 text-primary" />
            Обратная связь
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="feedback-name">Имя *</Label>
            <Input
              id="feedback-name"
              type="text"
              placeholder="Ваше имя"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              disabled={isSubmitting}
              className={errors.name ? "border-destructive" : ""}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-email">Email *</Label>
            <Input
              id="feedback-email"
              type="email"
              placeholder="your@email.com"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              disabled={isSubmitting}
              className={errors.email ? "border-destructive" : ""}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-subject">Тема *</Label>
            <Select
              value={formData.subject}
              onValueChange={(value) => handleInputChange("subject", value)}
              disabled={isSubmitting}
            >
              <SelectTrigger className={errors.subject ? "border-destructive" : ""}>
                <SelectValue placeholder="Выберите тему сообщения" />
              </SelectTrigger>
              <SelectContent>
                {subjectOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.subject && (
              <p className="text-sm text-destructive">{errors.subject}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-message">Сообщение *</Label>
            <Textarea
              id="feedback-message"
              placeholder="Опишите ваш вопрос или предложение..."
              value={formData.message}
              onChange={(e) => handleInputChange("message", e.target.value)}
              disabled={isSubmitting}
              rows={4}
              className={errors.message ? "border-destructive" : ""}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              {errors.message && (
                <span className="text-destructive">{errors.message}</span>
              )}
              <span className={`ml-auto ${
                formData.message.length > 2000 ? "text-destructive" : ""
              }`}>
                {formData.message.length}/2000
              </span>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1"
            >
              Отмена
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="flex-1"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Отправка...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Отправить
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
