import * as React from "react";
import { Calendar, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type NativePickerInputProps = Omit<React.ComponentProps<typeof Input>, "type"> & {
  type: "date" | "time";
};

const pickerMeta = {
  date: {
    label: "Открыть календарь",
    icon: Calendar,
  },
  time: {
    label: "Открыть выбор времени",
    icon: Clock,
  },
} as const;

const NativePickerInput = React.forwardRef<HTMLInputElement, NativePickerInputProps>(
  ({ type, disabled, ...props }, ref) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);
    const Icon = pickerMeta[type].icon;

    const setRefs = React.useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;

        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref],
    );

    const openPicker = () => {
      const input = inputRef.current;
      input?.focus();
      input?.showPicker?.();
    };

    return (
      <div className="flex gap-2">
        <Input ref={setRefs} type={type} disabled={disabled} {...props} />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={pickerMeta[type].label}
          disabled={disabled}
          onClick={openPicker}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </div>
    );
  },
);
NativePickerInput.displayName = "NativePickerInput";

export { NativePickerInput };
