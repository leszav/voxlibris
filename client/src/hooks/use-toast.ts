import * as React from "react";

const TOAST_LIMIT = 50;

export type ToastVariant = "default" | "destructive";

export type ToastMessage = {
  id: string;
  kind: "toast";
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: ToastVariant;
};

type DialogBase = {
  id: string;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ToastVariant;
};

export type AlertDialogRequest = DialogBase & {
  kind: "alert";
};

export type ConfirmDialogRequest = DialogBase & {
  kind: "confirm";
};

export type PromptDialogRequest = DialogBase & {
  kind: "prompt";
  placeholder?: string;
  defaultValue?: string;
};

export type DialogRequest =
  | AlertDialogRequest
  | ConfirmDialogRequest
  | PromptDialogRequest;

interface State {
  messages: ToastMessage[];
  dialogs: DialogRequest[];
}

type Action =
  | {
      type: "ADD_MESSAGE";
      message: ToastMessage;
    }
  | {
      type: "UPDATE_MESSAGE";
      message: Partial<ToastMessage> & { id: string };
    }
  | {
      type: "REMOVE_MESSAGE";
      messageId?: string;
    }
  | {
      type: "ADD_DIALOG";
      dialog: DialogRequest;
    }
  | {
      type: "REMOVE_DIALOG";
      dialogId: string;
    };

let count = 0;
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_MESSAGE":
      return {
        ...state,
        messages: [...state.messages, action.message].slice(-TOAST_LIMIT),
      };
    case "UPDATE_MESSAGE":
      return {
        ...state,
        messages: state.messages.map((message) =>
          message.id === action.message.id
            ? { ...message, ...action.message }
            : message,
        ),
      };
    case "REMOVE_MESSAGE":
      if (action.messageId === undefined) {
        return { ...state, messages: [] };
      }
      return {
        ...state,
        messages: state.messages.filter((message) => message.id !== action.messageId),
      };
    case "ADD_DIALOG":
      return {
        ...state,
        dialogs: [...state.dialogs, action.dialog],
      };
    case "REMOVE_DIALOG":
      return {
        ...state,
        dialogs: state.dialogs.filter((dialog) => dialog.id !== action.dialogId),
      };
    default:
      return state;
  }
};

const listeners: Array<(state: State) => void> = [];
const dialogResolvers = new Map<string, (value: unknown) => void>();
const dialogFallbackValues = new Map<string, unknown>();

let memoryState: State = { messages: [], dialogs: [] };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

type ToastInput = Omit<ToastMessage, "id" | "kind">;

function toast(props: ToastInput) {
  const id = genId();

  const update = (nextProps: ToastInput) =>
    dispatch({
      type: "UPDATE_MESSAGE",
      message: { ...nextProps, id },
    });

  const dismiss = () =>
    dispatch({
      type: "REMOVE_MESSAGE",
      messageId: id,
    });

  dispatch({
    type: "ADD_MESSAGE",
    message: {
      id,
      kind: "toast",
      ...props,
    },
  });

  return {
    id,
    dismiss,
    update,
  };
}

function dismissToast(messageId?: string) {
  dispatch({
    type: "REMOVE_MESSAGE",
    messageId,
  });
}

function enqueueDialog<T>(
  dialog: Omit<DialogRequest, "id">,
  fallbackValue: T,
): Promise<T> {
  const id = genId();
  const dialogWithId: DialogRequest = {
    ...dialog,
    id,
  } as DialogRequest;

  dispatch({
    type: "ADD_DIALOG",
    dialog: dialogWithId,
  });

  dialogFallbackValues.set(id, fallbackValue);

  return new Promise<T>((resolve) => {
    dialogResolvers.set(id, (value) => {
      resolve(value as T);
    });
  });
}

function settleDialog(dialogId: string, value?: unknown) {
  const resolver = dialogResolvers.get(dialogId);
  if (resolver) {
    const resolvedValue =
      value === undefined ? dialogFallbackValues.get(dialogId) : value;
    resolver(resolvedValue);
  }

  dialogResolvers.delete(dialogId);
  dialogFallbackValues.delete(dialogId);

  dispatch({
    type: "REMOVE_DIALOG",
    dialogId,
  });
}

type DialogInput = string | Partial<Omit<DialogBase, "id">>;
type PromptDialogInput =
  | string
  | (Partial<Omit<DialogBase, "id">> & {
      placeholder?: string;
      defaultValue?: string;
    });

function normalizeDialogInput(
  input: DialogInput,
  fallbackTitle: string,
): Omit<DialogBase, "id"> {
  if (typeof input === "string") {
    return {
      title: fallbackTitle,
      description: input,
    };
  }

  return {
    title: input.title || fallbackTitle,
    description: input.description,
    confirmLabel: input.confirmLabel,
    cancelLabel: input.cancelLabel,
    variant: input.variant,
  };
}

function modalAlert(input: DialogInput): Promise<void> {
  const options = normalizeDialogInput(input, "Уведомление");
  return enqueueDialog<void>(
    {
      kind: "alert",
      ...options,
    },
    undefined,
  );
}

function modalConfirm(input: DialogInput): Promise<boolean> {
  const options = normalizeDialogInput(input, "Подтвердите действие");
  return enqueueDialog<boolean>(
    {
      kind: "confirm",
      ...options,
    },
    false,
  );
}

function modalPrompt(input: PromptDialogInput): Promise<string | null> {
  if (typeof input === "string") {
    return enqueueDialog<string | null>(
      {
        kind: "prompt",
        title: "Введите значение",
        description: input,
      },
      null,
    );
  }

  const options = normalizeDialogInput(input, "Введите значение");
  return enqueueDialog<string | null>(
    {
      kind: "prompt",
      ...options,
      placeholder: input.placeholder,
      defaultValue: input.defaultValue,
    } as Omit<PromptDialogRequest, "id">,
    null,
  );
}

function resolveDialog(dialogId: string, value?: unknown) {
  settleDialog(dialogId, value);
}

function dismissDialog(dialogId: string) {
  settleDialog(dialogId);
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: dismissToast,
    dismissToast,
    resolveDialog,
    dismissDialog,
    alert: modalAlert,
    confirm: modalConfirm,
    prompt: modalPrompt,
  };
}

export { useToast, toast, modalAlert, modalConfirm, modalPrompt };
