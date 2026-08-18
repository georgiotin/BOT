/**
 * Stealth-layout — обёртка для всех страниц нового дизайна кабинета.
 *
 * FIX (черная полоса при скролле / в fullscreen Telegram, 2026-08-14)
 * FIX (иногда не листается mini-app, 2026-08-14):
 *   - overflow-x: clip вместо overflow-x: hidden (не создаёт scrolling context,
 *     не блокирует вертикальный скролл на iOS);
 *   - явный touch-action: pan-y — Telegram WebView иногда "забывает" разрешить
 *     вертикальный скролл после fullscreen, это его размораживает;
 *   - -webkit-overflow-scrolling: touch — momentum scroll на iOS WebKit;
 *   - overscroll-behavior-y: contain — убирает rubber-band артефакты.
 *
 * T-fix-no-rubber-band-top (2026-08-15): на iOS Telegram WebView при свайпе
 * от верхнего края экрана сверху проглядывала синяя TG-шапка (gradient между
 * клиентом и нашим body). Юзер попросил «невозможно свайпнуть выше
 * интерфейса». Решение: overscroll-behavior: none + touch-action: none на
 * html, body и main — теперь ни один pull-to-refresh / rubber-band на iOS
 * не подтянет TG-фон. Внутри карточек подписки и picker-модалок скролл
 * сохраняется через локальный overflow-y: auto (touch-action: pan-y на самих
 * контейнерах остался от прошлой версии).
 */

import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Box } from "lucide-react";
import { api, type PublicConfig } from "@/lib/api";
import { BottomTabs } from "@/components/stealth/bottom-tabs";

function hexToRgbTriple(hex: string | null | undefined, fallback = "220 38 38"): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex ?? "").trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

const CONFIG_CACHE_KEY = "stealth_public_config_cache_v1";

const IS_DESKTOP = typeof window !== "undefined" && (() => {
  const tg = (window as { Telegram?: { WebApp?: { platform?: string } } }).Telegram?.WebApp;
  if (!tg?.platform) return false;
  return tg.platform === "tdesktop" || tg.platform === "web" || tg.platform === "weba" || tg.platform === "webk";
})();

function readCachedConfig(): PublicConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY);
    return raw ? (JSON.parse(raw) as PublicConfig) : null;
  } catch {
    return null;
  }
}

export function StealthLayout() {
  const cached = readCachedConfig();
  const [config, setConfig] = useState<PublicConfig | null>(cached);
  const [configLoaded, setConfigLoaded] = useState(cached !== null);
  const location = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rootRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  // T-fix-js-scroller (2026-08-18): нативный touch-скролл внутри Telegram
  // WebView на Android нестабильно работает и с document-scroll, и с
  // overflow-контейнером (полноэкранный жестовый слой клиента перехватывает
  // вертикальные свайпы — юзер не мог листать вообще). Поэтому на мобильных
  // ведём скролл #stealth-layout-root сами: touchstart/touchmove с
  // axis-lock, preventDefault и инерцией. Это заодно гарантированно гасит
  // любой overscroll (синий фон TG на iOS при свайпе за край исчезает —
  // нативный rubber-band просто не получает событие).
  // Жесты внутри input/textarea и вложенных скролл-контейнеров (модалки,
  // списки тарифов/подарков) НЕ перехватываем — они скроллятся нативно.
  useEffect(() => {
    if (IS_DESKTOP) return;
    const el = rootRef.current;
    if (!el) return;

    let active = false;
    let locked = false;
    let scroller: HTMLElement = el;
    let startX = 0;
    let startY = 0;
    let baseScroll = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let raf = 0;

    function stopMomentum() {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }

    // Жесты на полях ввода и внутри модалок не трогаем — там свой скролл.
    function isExcludedTarget(target: EventTarget | null): boolean {
      const t = target as HTMLElement | null;
      if (!t) return true;
      return Boolean(t.closest("input, textarea, select, [contenteditable], .stealth-modal-card"));
    }

    // Ближайший вертикальный скролл-контейнер жеста: вложенный список
    // (тарифы/подарки/подписка) или сам layout-root.
    function findScroller(target: EventTarget | null): HTMLElement {
      let p = (target as HTMLElement | null)?.parentElement ?? null;
      while (p && p !== el) {
        const s = getComputedStyle(p);
        if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) return p;
        p = p.parentElement;
      }
      return el!;
    }

    function onTouchStart(e: TouchEvent) {
      stopMomentum();
      if (e.touches.length !== 1) { active = false; return; }
      if (isExcludedTarget(e.target)) { active = false; return; }
      active = true;
      locked = false;
      scroller = findScroller(e.target);
      startX = e.touches[0].clientX;
      startY = lastY = e.touches[0].clientY;
      baseScroll = scroller.scrollTop;
      lastT = performance.now();
      velocity = 0;
    }

    function onTouchMove(e: TouchEvent) {
      if (!active || e.touches.length !== 1) return;
      const x = e.touches[0].clientX;
      const y = e.touches[0].clientY;
      if (!locked) {
        const dx = Math.abs(x - startX);
        const dy = Math.abs(y - startY);
        if (dx < 8 && dy < 8) return;
        if (dx > dy) { active = false; return; }
        locked = true;
        baseScroll = scroller.scrollTop;
        startY = lastY = y;
        lastT = performance.now();
      }
      e.preventDefault();
      const now = performance.now();
      if (now > lastT) velocity = (y - lastY) / (now - lastT);
      lastY = y;
      lastT = now;
      scroller.scrollTop = baseScroll + (startY - y);
    }

    function onTouchEnd(e: TouchEvent) {
      if (!active) return;
      active = false;
      if (!locked || e.touches.length > 0) return;
      const target = scroller;
      // палец остановился перед отпусканием — инерции нет
      let v = performance.now() - lastT > 100 ? 0 : velocity;
      v = Math.max(-3, Math.min(3, v));
      if (Math.abs(v) < 0.15) return;
      let last = performance.now();
      const step = (now: number) => {
        const dt = Math.min(64, now - last);
        last = now;
        v *= Math.exp(-dt / 325);
        const before = target.scrollTop;
        target.scrollTop = before - v * dt;
        const hitEdge = Math.abs(target.scrollTop - before) < Math.abs(v * dt) - 0.5;
        if (Math.abs(v) > 0.05 && !hitEdge) raf = requestAnimationFrame(step);
        else raf = 0;
      };
      raf = requestAnimationFrame(step);
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    return () => {
      stopMomentum();
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  useEffect(() => {
    api.getPublicConfig()
      .then((c) => {
        setConfig(c);
        setConfigLoaded(true);
        try { localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(c)); } catch { /* ignore */ }
      })
      .catch(() => setConfigLoaded(true));
  }, []);

  const brand = (config?.serviceName ?? "AspectVPN").toUpperCase();
  const accent = hexToRgbTriple((config as { stealthAccent?: string | null } | null)?.stealthAccent);

  useEffect(() => {
    document.documentElement.style.setProperty("--stealth-accent", accent);

    if (!IS_DESKTOP) {
      // T-fix-app-shell-scroll (2026-08-18): скролл страницы на уровне
      // document (html/body) в Telegram WebView нестабилен: на Android в
      // fullscreen он периодически полностью блокируется нативным жестовым
      // слоем клиента, а на iOS rubber-band документа утаскивает страницу
      // за край и обнажает нативный синий фон WebView. Переводим stealth
      // на app-shell модель: document НЕ скроллится вообще (overflow:hidden),
      // единственным скролл-контейнером становится #stealth-layout-root
      // фиксированной высоты 100dvh. Атрибут data-stealth-scroll запрещает
      // telegram-viewport.ts обратно форсить overflow-y:auto на html/body.
      document.documentElement.setAttribute("data-stealth-scroll", "1");
      document.documentElement.style.overflow = "hidden";
      document.body.style.overflow = "hidden";
      document.documentElement.style.overscrollBehavior = "none";
      document.body.style.overscrollBehavior = "none";
      document.documentElement.style.touchAction = "pan-y";
      document.body.style.touchAction = "pan-y";
    }

    function onModalChange() {
      const modalOpen = document.documentElement.getAttribute("data-modal-open") === "1";
      if (modalOpen) {
        document.documentElement.style.touchAction = "auto";
        document.documentElement.style.overscrollBehavior = "none";
        document.body.style.touchAction = "auto";
        document.body.style.overscrollBehavior = "none";
      } else if (!IS_DESKTOP) {
        document.documentElement.style.touchAction = "pan-y";
        document.documentElement.style.overscrollBehavior = "none";
        document.body.style.touchAction = "pan-y";
        document.body.style.overscrollBehavior = "none";
      }
    }

    const observer = new MutationObserver(onModalChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-modal-open"] });
    onModalChange();

    return () => {
      observer.disconnect();
      document.documentElement.removeAttribute("data-stealth-scroll");
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
      document.documentElement.style.touchAction = "";
      document.documentElement.style.overscrollBehavior = "";
      document.body.style.touchAction = "";
      document.body.style.overscrollBehavior = "";
    };
  }, [accent]);



  return (
    <div
      ref={rootRef}
      id="stealth-layout-root"
      className="tg-fs-pad w-full text-white relative bg-[#0a0a0b]"
      style={{
        ["--stealth-accent" as string]: accent,
        overflowX: "clip",
        overflowY: "auto",
        overscrollBehavior: IS_DESKTOP ? undefined : "none",
        touchAction: IS_DESKTOP ? undefined : "pan-y",
        WebkitOverflowScrolling: "touch",
      } as React.CSSProperties}
    >
      {/* T-fix-bleed-fallback (2026-08-15): запасной слой на случай, если
          overscroll всё равно на миллиметр "утянет" за край экрана (это
          зависит от нативного рендера конкретного Telegram-клиента и не
          всегда гасится CSS/JS выше). Залит тем же #0a0a0b и выходит за
          границы viewport на 30vh сверху и снизу — так что, даже если что-то
          и покажется на долю секунды за краем интерфейса, это будет наш
          чёрный, а не синий фон клиента. */}
      <div
        className="fixed inset-x-0 -z-10 bg-[#0a0a0b] pointer-events-none"
        style={{ top: "-30vh", bottom: "-30vh" }}
        aria-hidden="true"
      />
      <header className="relative pt-6 pb-3 px-4 text-center">
        <div className="inline-block relative">
          <span
            className="absolute inset-0 -z-10 blur-2xl opacity-50"
            style={{ background: "radial-gradient(closest-side, rgba(255,255,255,0.18), transparent 70%)" }}
          />
          {configLoaded ? (
            <h1
              className="text-base md:text-lg font-bold tracking-[0.18em] text-white"
              style={{ fontFamily: '"Syncopate", "Inter", system-ui, sans-serif' }}
            >
              {brand}
            </h1>
          ) : (
            <div className="h-5 w-32 rounded-full bg-zinc-800 animate-pulse" aria-hidden="true" />
          )}
        </div>
      </header>

      <main
        className="relative pb-32 max-w-md mx-auto overflow-x-hidden"
        style={{
          touchAction: IS_DESKTOP ? undefined : "pan-y",
          WebkitOverflowScrolling: "touch",
        overscrollBehavior: IS_DESKTOP ? undefined : "none",
        }}
      >
        {configLoaded ? <Outlet /> : <StealthBootLoader />}
      </main>

      <BottomTabs />
    </div>
  );
}

function StealthBootLoader() {
  return (
    <div className="flex flex-col items-center justify-center gap-5 pt-24 pb-16">
      <div className="relative h-20 w-20 flex items-center justify-center">
        <span
          className="absolute inset-0 rounded-full animate-ping"
          style={{ background: "radial-gradient(closest-side, rgb(var(--stealth-accent) / 0.35), transparent 70%)" }}
        />
        <span
          className="absolute inset-0 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "rgb(var(--stealth-accent) / 0.55)", borderTopColor: "transparent" }}
        />
        <Box className="h-8 w-8 text-saccent-500 drop-shadow-[0_0_10px_rgb(var(--stealth-accent)_/_0.6)]" strokeWidth={1.5} />
      </div>
      <p className="text-xs font-medium tracking-wide text-zinc-500 animate-pulse">Загрузка…</p>
    </div>
  );
}
