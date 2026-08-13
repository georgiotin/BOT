/**
 * Stealth-layout — обёртка для всех страниц нового дизайна кабинета.
 *
 * Структура:
 *   ┌─────────────────────────────┐
 *   │  Header (бренд по центру)    │
 *   │─────────────────────────────│
 *   │  <Outlet/> — контент стр.   │
 *   │─────────────────────────────│
 *   │  BottomTabs (Главная/...)    │
 *   └─────────────────────────────┘
 *
 * + NetworkBg (фикс. фон) на весь экран позади всего.
 */

import { Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { Box } from "lucide-react";
import { api, type PublicConfig } from "@/lib/api";
import { NetworkBg } from "@/components/stealth/network-bg";
import { BottomTabs } from "@/components/stealth/bottom-tabs";

// hex (#RRGGBB) → "R G B" (пробел-разделённые каналы для rgb(var(--stealth-accent) / a)).
function hexToRgbTriple(hex: string | null | undefined, fallback = "220 38 38"): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex ?? "").trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

const CONFIG_CACHE_KEY = "stealth_public_config_cache_v1";

function readCachedConfig(): PublicConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY);
    return raw ? (JSON.parse(raw) as PublicConfig) : null;
  } catch {
    return null;
  }
}

export function StealthLayout() {
  // T-fix-reload-flash (2026-08-13): раньше каждый Обновить страницу /
  // холодный старт заново дожидался /public/config, и на это время
  // ВЕСЬ контент (включая карточку «Подписки») подменялся на
  // полноэкранный StealthBootLoader — выглядело как «страница
  // перезагружается по кругу». Теперь конфиг кэшируется в localStorage:
  // если кэш есть, рендерим сразу с ним (без спиннера), а свежий конфиг
  // подтягиваем в фоне и тихо подменяем при отличии. Полноэкранный
  // лоадер остаётся только для самого первого захода, когда кэша ещё нет.
  const cached = readCachedConfig();
  const [config, setConfig] = useState<PublicConfig | null>(cached);
  const [configLoaded, setConfigLoaded] = useState(cached !== null);

  useEffect(() => {
    api.getPublicConfig()
      .then((c) => {
        setConfig(c);
        setConfigLoaded(true);
        try { localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(c)); } catch { /* ignore */ }
      })
      .catch(() => setConfigLoaded(true));
  }, []);

  const brand = (config?.serviceName ?? "STEALTHNET").toUpperCase();
  const accent = hexToRgbTriple((config as { stealthAccent?: string | null } | null)?.stealthAccent);

  // Ставим акцент ГЛОБАЛЬНО на :root — контент кабинета рендерится в отдельном
  // поддереве (не внутри этого div), поэтому inline-style на div его не покрывает.
  useEffect(() => {
    document.documentElement.style.setProperty("--stealth-accent", accent);
  }, [accent]);

  return (
    <div
      className="tg-fs-pad min-h-screen w-full text-white relative overflow-x-hidden"
      style={{ ["--stealth-accent" as string]: accent }}
    >
      <NetworkBg />

      {/* Header: бренд по центру + ambient glow.
          T-loading-anim (2026-08-13): пока конфиг ещё не пришёл, вместо
          мгновенной вспышки дефолтного "STEALTHNET" — мягкий пульсирующий
          плейсхолдер той же ширины, бренд проявляется fade-in. */}
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
            // FIX (белая полоска при загрузке): bg-white/10 на тёмном фоне читался
            // как светлая/белая вспышка. Тон плейсхолдера теперь тёмно-серый
            // (bg-zinc-800), а не белый — pulse просто меняет прозрачность.
            <div className="h-5 w-32 rounded-full bg-zinc-800 animate-pulse" aria-hidden="true" />
          )}
        </div>
      </header>

      {/* запас снизу под левитирующую glass-панель (высота + отступ + safe-area). */}
      <main className="relative pb-32 max-w-md mx-auto">
        {configLoaded ? <Outlet /> : <StealthBootLoader />}
      </main>

      <BottomTabs />
    </div>
  );
}

/**
 * T-loading-anim (2026-08-13): единый экран загрузки для первого захода в
 * Stealth (пока грузится конфиг). Раньше на этом месте на долю секунды
 * успевал мелькнуть пустой "нет подписки" вид — выглядело как баг.
 */
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
