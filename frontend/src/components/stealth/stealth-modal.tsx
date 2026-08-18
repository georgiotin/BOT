import { type ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
  scrollable?: boolean;
}

export function StealthModal({ open, onClose, title, children, maxWidth = "28rem", scrollable = true }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);

    document.documentElement.setAttribute("data-modal-open", "1");
    // Убираем touchAction/overscroll со всех элементов которые могут блокировать
    // wheel/touch внутри модалки. Сохраняем предыдущие значения для восстановления.
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlTouch = html.style.touchAction;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyTouch = body.style.touchAction;
    const prevBodyOverscroll = body.style.overscrollBehavior;

    html.style.touchAction = "auto";
    html.style.overscrollBehavior = "none";
    body.style.touchAction = "auto";
    body.style.overscrollBehavior = "none";

    // Также убираем с .tg-fs-pad и main если они есть
    const tgPad = document.querySelector(".tg-fs-pad") as HTMLElement | null;
    const mainEl = document.querySelector("main") as HTMLElement | null;
    const prevTgTouch = tgPad?.style.touchAction ?? "";
    const prevTgOverscroll = tgPad?.style.overscrollBehavior ?? "";
    const prevMainTouch = mainEl?.style.touchAction ?? "";
    const prevMainOverscroll = mainEl?.style.overscrollBehavior ?? "";
    if (tgPad) { tgPad.style.touchAction = "auto"; tgPad.style.overscrollBehavior = "none"; }
    if (mainEl) { mainEl.style.touchAction = "auto"; mainEl.style.overscrollBehavior = "none"; }

    document.querySelectorAll("nav.fixed.bottom-0, .fixed.bottom-0.z-20").forEach((el) => {
      (el as HTMLElement).style.display = "none";
    });

    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.removeAttribute("data-modal-open");
      html.style.touchAction = prevHtmlTouch;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.touchAction = prevBodyTouch;
      body.style.overscrollBehavior = prevBodyOverscroll;
      if (tgPad) { tgPad.style.touchAction = prevTgTouch; tgPad.style.overscrollBehavior = prevTgOverscroll; }
      if (mainEl) { mainEl.style.touchAction = prevMainTouch; mainEl.style.overscrollBehavior = prevMainOverscroll; }
      document.querySelectorAll("nav.fixed.bottom-0, .fixed.bottom-0.z-20").forEach((el) => {
        (el as HTMLElement).style.display = "";
      });
    };
  }, [open, onClose]);

  if (!open) return null;

  const modal = (
    <>
      <style>{`
        .stealth-modal-card :where(input, textarea, select) {
          scroll-margin-top: 80px;
        }
      `}</style>
      <div
        className="fixed inset-0 z-[9999] flex justify-center items-center px-4 py-6"
        style={{ overscrollBehavior: "none", touchAction: "auto" }}
      >
        <div
          className="absolute inset-0 bg-[#0a0a0b]/85 backdrop-blur-md"
          onClick={onClose}
          aria-hidden="true"
        />
        <div
          ref={cardRef}
          className={cn(
            "stealth-modal-card",
            "relative w-full rounded-3xl bg-zinc-900",
            "shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)]",
            "p-5 flex flex-col",
            "animate-in fade-in zoom-in-95 duration-300",
          )}
          style={{
            maxWidth,
            maxHeight: "80dvh",
            overflow: "hidden",
            touchAction: "auto",
          }}
        >
          <div className="pointer-events-none absolute top-0 right-0 h-24 w-24 rounded-full bg-saccent-500/10 blur-3xl" aria-hidden="true" />
          <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
            <h3 className="text-lg font-bold tracking-tight">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="h-8 w-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center hover:bg-white/[0.08] hover:border-white/15 hover:rotate-90 active:scale-95 transition-all duration-300 shrink-0"
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div
            className={cn(
              "flex-1 min-h-0 overflow-x-hidden",
              scrollable && "overflow-y-auto custom-scrollbar",
            )}
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {children}
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modal, document.body);
}
