import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Link2,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export function Toaster() {
  const { messages, dialogs, dismissToast, dismissDialog, resolveDialog } = useToast();
  const [promptValue, setPromptValue] = useState("");

  const activeDialog = dialogs[0];
  const activeMessage = activeDialog ? undefined : messages[0];
  const activeItem = activeDialog ?? activeMessage;
  const isPrompt = activeDialog?.kind === "prompt";

  useEffect(() => {
    if (isPrompt) {
      setPromptValue(activeDialog.defaultValue || "");
      return;
    }
    setPromptValue("");
  }, [activeDialog, isPrompt]);

  const visual = useMemo(() => {
    if (activeDialog?.kind === "confirm") {
      return {
        Icon: AlertTriangle,
        iconContainerClass: "bg-yellow-100",
        iconClass: "text-yellow-700",
        titleClass: "text-yellow-800",
      };
    }

    if (activeDialog?.kind === "prompt") {
      return {
        Icon: Link2,
        iconContainerClass: "bg-blue-100",
        iconClass: "text-blue-700",
        titleClass: "text-blue-800",
      };
    }

    if (activeItem?.variant === "destructive") {
      return {
        Icon: AlertCircle,
        iconContainerClass: "bg-red-100",
        iconClass: "text-red-600",
        titleClass: "text-red-700",
      };
    }

    if (activeDialog?.kind === "alert") {
      return {
        Icon: MessageCircle,
        iconContainerClass: "bg-sky-100",
        iconClass: "text-sky-700",
        titleClass: "text-sky-800",
      };
    }

    return {
      Icon: CheckCircle2,
      iconContainerClass: "bg-green-100",
      iconClass: "text-green-600",
      titleClass: "text-green-700",
    };
  }, [activeDialog, activeItem?.variant]);

  if (!activeItem) {
    return null;
  }

  const title = activeItem.title || "Уведомление";
  const description = activeItem.description;
  const confirmLabel = activeDialog?.confirmLabel || "Понятно";
  const cancelLabel = activeDialog?.cancelLabel || "Отмена";

  const handleClose = () => {
    if (activeDialog) {
      dismissDialog(activeDialog.id);
      return;
    }

    if (activeMessage) {
      dismissToast(activeMessage.id);
    }
  };

  const handleConfirm = () => {
    if (!activeDialog) {
      if (activeMessage) {
        dismissToast(activeMessage.id);
      }
      return;
    }

    if (activeDialog.kind === "confirm") {
      resolveDialog(activeDialog.id, true);
      return;
    }

    if (activeDialog.kind === "prompt") {
      resolveDialog(activeDialog.id, promptValue);
      return;
    }

    resolveDialog(activeDialog.id);
  };

  return (
    <Dialog
      open={Boolean(activeItem)}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          handleClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-[460px] p-0 overflow-hidden">
        <form
          className="p-6 space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            handleConfirm();
          }}
        >
          <DialogHeader className="text-center space-y-4">
            <div className="flex justify-center">
              <div
                className={cn(
                  "flex h-14 w-14 items-center justify-center rounded-full",
                  visual.iconContainerClass,
                )}
              >
                <visual.Icon className={cn("h-7 w-7", visual.iconClass)} />
              </div>
            </div>
            <div className="space-y-2">
              <DialogTitle className={cn("text-2xl font-bold", visual.titleClass)}>
                {title}
              </DialogTitle>
              {description ? (
                <DialogDescription className="text-sm whitespace-pre-line">
                  {description}
                </DialogDescription>
              ) : null}
            </div>
          </DialogHeader>

          {isPrompt ? (
            <Input
              autoFocus
              value={promptValue}
              onChange={(event) => setPromptValue(event.target.value)}
              placeholder={activeDialog.placeholder}
            />
          ) : null}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            {activeDialog?.kind === "confirm" || activeDialog?.kind === "prompt" ? (
              <Button type="button" variant="outline" onClick={handleClose}>
                {cancelLabel}
              </Button>
            ) : null}
            <Button
              type="submit"
              variant={activeItem.variant === "destructive" ? "destructive" : "default"}
            >
              {confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
