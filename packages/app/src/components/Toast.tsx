import { useEffect, useState, useCallback } from "react";

interface Toast {
  id: string;
  message: string;
  type: "info" | "error" | "success" | "warning";
}

interface ToastProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

const TYPE_STYLES: Record<Toast["type"], { bg: string; border: string; text: string; icon: string }> = {
  info: {
    bg: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-200 dark:border-blue-800",
    text: "text-blue-700 dark:text-blue-300",
    icon: "ℹ️",
  },
  error: {
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-200 dark:border-red-800",
    text: "text-red-700 dark:text-red-300",
    icon: "❌",
  },
  success: {
    bg: "bg-green-50 dark:bg-green-900/20",
    border: "border-green-200 dark:border-green-800",
    text: "text-green-700 dark:text-green-300",
    icon: "✅",
  },
  warning: {
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-800",
    text: "text-amber-700 dark:text-amber-300",
    icon: "⚠️",
  },
};

export default function ToastContainer({ toasts, onDismiss }: ToastProps) {
  return (
    <div className="fixed top-12 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => {
        const styles = TYPE_STYLES[toast.type];
        return (
          <div
            key={toast.id}
            className={`toast-enter ${styles.bg} ${styles.border} border rounded-lg p-3 shadow-lg`}
          >
            <div className="flex items-start gap-2">
              <span className="text-sm shrink-0">{styles.icon}</span>
              <p className={`text-xs flex-1 ${styles.text}`}>{toast.message}</p>
              <button
                onClick={() => onDismiss(toast.id)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
