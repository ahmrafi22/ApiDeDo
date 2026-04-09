"use client";

import { useEffect, type CSSProperties } from "react";

export interface ToastItem {
  id: string;
  message: string;
  tone: "info" | "success" | "error";
}

interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastStack({ toasts, onDismiss }: ToastStackProps) {
  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }

    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        onDismiss(toast.id);
      }, 3200),
    );

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [toasts, onDismiss]);

  return (
    <div className="toast-stack" aria-live="polite" aria-label="Notifications">
      {toasts.map((toast, index) => {
        const stackedBefore = toasts.length - index - 1;
        const stackStyle = {
          "--toasts-before": stackedBefore,
        } as CSSProperties;

        return (
          <button
            key={toast.id}
            className={`toast-item toast-${toast.tone}`}
            onClick={() => onDismiss(toast.id)}
            type="button"
            style={stackStyle}
          >
            {toast.message}
          </button>
        );
      })}
    </div>
  );
}
