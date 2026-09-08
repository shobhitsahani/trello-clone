"use client";

/* Client overlays: toasts, modal, dropdown menu, switch. */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IconAlert, IconCheck, IconX } from "./icons";
import { cx } from "../lib/utils";

/* ---------- toasts ---------- */

type ToastKind = "ok" | "err";
type ToastItem = { id: number; title: string; msg?: string; kind: ToastKind };

const ToastCtx = createContext<(t: { title: string; msg?: string; kind?: ToastKind }) => void>(
  () => undefined
);

export function useToast() {
  return useContext(ToastCtx);
}

let toastSeq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback(
    ({ title, msg, kind = "ok" }: { title: string; msg?: string; kind?: ToastKind }) => {
      const id = ++toastSeq;
      setToasts((prev) => [...prev.slice(-3), { id, title, msg, kind }]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cx("toast", t.kind === "ok" ? "toast-ok" : "toast-err")}>
            <span className="toast-ico">
              {t.kind === "ok" ? <IconCheck size={12} /> : <IconAlert size={12} />}
            </span>
            <div>
              <div className="toast-title">{t.title}</div>
              {t.msg ? <div className="toast-msg">{t.msg}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- modal ---------- */

export function Modal({
  open,
  onClose,
  title,
  sub,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div className="modal" role="dialog" aria-modal aria-label={title}>
        <div className="modal-head">
          <div>
            <div className="modal-title">{title}</div>
            {sub ? <div className="modal-sub">{sub}</div> : null}
          </div>
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Close">
            <IconX size={14} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ---------- dropdown menu ---------- */

export function Dropdown({
  trigger,
  children,
  align = "left",
  width,
}: {
  trigger: (open: boolean) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "left" | "right";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <div onClick={() => setOpen((v) => !v)} role="presentation">
        {trigger(open)}
      </div>
      {open ? (
        <div
          className="menu"
          role="menu"
          style={{
            top: "calc(100% + 6px)",
            ...(align === "right" ? { right: 0 } : { left: 0 }),
            ...(width ? { width } : undefined),
          }}
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  children,
  onSelect,
  checked,
  hint,
}: {
  children: ReactNode;
  onSelect?: () => void;
  checked?: boolean;
  hint?: string;
}) {
  return (
    <button
      className="menu-item"
      role="menuitem"
      onClick={onSelect}
      type="button"
    >
      {children}
      {hint ? <span className="menu-hint">{hint}</span> : null}
      {checked ? <span className="menu-check"><IconCheck size={13} /></span> : null}
    </button>
  );
}

/* ---------- switch ---------- */

export function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={cx("switch", on && "switch-on")}
      onClick={() => onChange(!on)}
    />
  );
}