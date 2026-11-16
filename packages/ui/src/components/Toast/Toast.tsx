import { AlertIcon, CloseIcon, DoneIcon, type Icon, InfoIcon, WarningIcon } from "@dueproof/icons";
import { Toast as RadixToast } from "radix-ui";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, MotionFeatures, m, standard, useReducedMotion } from "../../motion";
import { cx } from "../../utils/cx";
import styles from "./Toast.module.css";

export type ToastTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** One action, e.g. Undo. Its `altText` tells screen-reader users how to do it another way. */
  action?: { label: string; onClick: () => void; altText?: string };
  /** ms before it hides; default 5000 (8000 with an action). `Infinity` to keep it. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  open: boolean;
}

interface ToastApi {
  /** Show a toast; returns its id. */
  toast: (options: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Show toasts from anywhere under <ToastProvider> (included in UIProvider). */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider> or <UIProvider>.");
  return api;
}

const toneIcon: Record<ToastTone, Icon | null> = {
  neutral: null,
  success: DoneIcon,
  warning: WarningIcon,
  danger: AlertIcon,
  info: InfoIcon,
};

export interface ToastProviderProps {
  children: ReactNode;
  /** Label for the landmark that holds toasts (F8 jumps to it). */
  label?: string;
}

/** Holds the toast queue and the viewport (bottom-right on desktop, bottom on phones). */
export function ToastProvider({ children, label = "Notifications" }: ToastProviderProps) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const reduce = useReducedMotion();

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((options: ToastOptions) => {
    const id = nextId.current++;
    setItems((list) => [...list.slice(-2), { ...options, id, open: true }]);
    return id;
  }, []);

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      <RadixToast.Provider label={label} swipeDirection="right">
        {children}
        <MotionFeatures>
          <AnimatePresence initial={false}>
            {items.map((t) => {
              const tone = t.tone ?? "neutral";
              const ToneIcon = toneIcon[tone];
              const duration = t.duration ?? (t.action ? 8000 : 5000);
              return (
                <RadixToast.Root
                  key={t.id}
                  asChild
                  forceMount
                  open={t.open}
                  duration={duration}
                  type={tone === "danger" ? "foreground" : "background"}
                  onOpenChange={(open) => {
                    if (!open) dismiss(t.id);
                  }}
                >
                  <m.li
                    className={cx(styles.toast, styles[tone])}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
                    transition={standard}
                  >
                    {ToneIcon ? <ToneIcon size={18} className={styles.icon} /> : null}
                    <div className={styles.text}>
                      <RadixToast.Title className={styles.title}>{t.title}</RadixToast.Title>
                      {t.description ? (
                        <RadixToast.Description className={styles.description}>
                          {t.description}
                        </RadixToast.Description>
                      ) : null}
                    </div>
                    {t.action ? (
                      <RadixToast.Action
                        altText={t.action.altText ?? t.action.label}
                        className={styles.action}
                        onClick={t.action.onClick}
                      >
                        {t.action.label}
                      </RadixToast.Action>
                    ) : null}
                    <RadixToast.Close className={styles.close} aria-label="Dismiss">
                      <CloseIcon size={14} />
                    </RadixToast.Close>
                  </m.li>
                </RadixToast.Root>
              );
            })}
          </AnimatePresence>
        </MotionFeatures>
        <RadixToast.Viewport className={styles.viewport} />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}
