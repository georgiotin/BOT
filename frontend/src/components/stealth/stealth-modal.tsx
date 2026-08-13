/**
 * StealthModal — lightbox-стиль модалка для Stealth-дизайна.
 *
 * Открывается поверх контента: тёмный backdrop с blur, в центре карточка с
 * заголовком и close-X. Контент модалки — children. Idiom как у Hundler:
 * не fullscreen, а compact-card.
 */

import { type ReactNode, useEffect, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** maxWidth для карточки (по умолчанию 28rem = max-w-md). */
  maxWidth?: string;
}

export function StealthModal({ open, onClose, title, children, maxWidth = "28rem" }: Props) {
  // Реальная высота видимой области (без клавиатуры), считаем через
  // visualViewport — обычный innerHeight на мобилках клавиатуру не учитывает.
  const [viewportH, setViewportH] = useState<number | null>(null);
  // Смещение видимой области от верха layout-viewport. Когда открывается
  // клавиатура, страница на Android/Telegram WebView прокручивается вверх,
  // и visualViewport.offsetTop становится > 0, а наш "fixed inset-0"
  // остаётся привязан к верху layout-viewport — образуется пустой зазор
  // сверху экрана, через который тапы проваливаются на нативный крестик
  // Telegram. Подстраиваем позицию оверлея под этот сдвиг, чтобы зазора
  // не было и оверлей всегда закрывал весь видимый экран.
  const [viewportOffsetTop, setViewportOffsetTop] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const vv = window.visualViewport;
    function update() {
      setViewportH(vv ? vv.height : window.innerHeight);
      setViewportOffsetTop(vv ? vv.offsetTop : 0);
    }
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", update);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      document.body.style.overflow = prev;
      setViewportH(null);
      setViewportOffsetTop(0);
    };
  }, [open, onClose]);

  if (!open) return null;

  // T-fix-modal-gap (2026-08-13): раньше резерв под несуществующий таб-бар
  // (pb-24 = 96px) включался/выключался по эвристике "клавиатура открыта,
  // если видимая область заметно меньше окна". В Telegram WebView эта
  // эвристика часто не срабатывает (visualViewport не сжимается при
  // появлении клавиатуры), из-за чего pb-24 оставался висеть и над
  // клавиатурой образовывался пустой зазор под кнопкой "Отправить" — это
  // видно на скриншоте. Таб-бар всё равно скрыт под непрозрачным backdrop
  // (z-60), так что резервировать под него место не нужно вообще — держим
  // только небольшой постоянный отступ и всегда подгоняем карточку под
  // реальный visualViewport, когда он доступен.
  const hasViewport = viewportH !== null;

  return (
    <div
      className="tg-fs-pad fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-4 pb-3 sm:pb-0"
      style={
        hasViewport
          ? { height: viewportH!, top: viewportOffsetTop, bottom: "auto" }
          : undefined
      }
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Card */}
      <div
        className={cn(
          // Сплошной непрозрачный фон карточки — раньше bg-zinc-900/80 +
          // backdrop-blur-2xl давали "туманную" полупрозрачную шапку, через
          // которую просвечивал размытый фон (видно на скриншоте).
          "relative w-full rounded-3xl border border-white/10 bg-zinc-900",
          "shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7),0_0_60px_-24px_rgb(var(--stealth-accent)_/_0.35),inset_0_1px_0_rgba(255,255,255,0.08)]",
          "p-5 overflow-y-auto overflow-x-hidden",
          "animate-in fade-in slide-in-from-bottom-4 zoom-in-95 duration-300",
        )}
        style={{
          maxWidth,
          touchAction: "pan-y",
          // Высота карточки ограничена реальной видимой областью (за вычетом
          // клавиатуры, если она открыта), иначе — как раньше, 80vh.
          maxHeight: hasViewport ? viewportH! - 24 : "80vh",
        }}
      >
        {/* мягкое rose-свечение в верхнем углу карточки */}
        <div className="pointer-events-none absolute -top-14 -right-14 h-36 w-36 rounded-full bg-saccent-500/10 blur-3xl" aria-hidden="true" />
        <div className="flex items-center justify-between gap-3 mb-4">
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
        {children}
      </div>
    </div>
  );
}
