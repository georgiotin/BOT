/**
 * Вьюпорт мини-аппа Telegram: раскрытие на весь экран и safe-area.
 *
 * Без `expand()` Telegram открывает мини-апп «половинкой» — примерно на 50%
 * экрана, и пользователю приходится тянуть шторку вверх руками.
 *
 * `disableVerticalSwipes()` отключает закрытие свайпом вниз: иначе прокрутка
 * внутренних списков и нижних шторок то и дело сворачивает приложение
 * (Bot API 7.7+, дёргаем опционально).
 *
 * `requestFullscreen()` (Bot API 8.0+) отдаёт экран целиком, вместе с областью
 * статус-бара. ВАЖНО: в этом режиме шапка Telegram с крестиком ложится ПОВЕРХ
 * контента, поэтому мы:
 *   1) вешаем на <html> атрибут `data-tg-fullscreen="1"`;
 *   2) держим в переменной `--app-tg-top` высоту верхних отступов;
 *   3) в index.css по этому атрибуту сдвигаем вниз весь #root.
 * Так отступ получают все три дизайна кабинета сразу, без правки их разметки.
 *
 * Значения safe-area приходят асинхронно и меняются (поворот экрана, свёртка),
 * поэтому пересчитываем их по событиям Telegram, а не один раз на старте.
 *
 * Вне Telegram (обычный браузер, PWA) не делаем ничего.
 *
 * FIX (иногда не листается mini-app, 2026-08-14):
 *   Проблема была в гонке при входе в fullscreen: сразу после requestFullscreen()
 *   Telegram возвращает safeAreaInset.top = 0, и это значение "залипает" до
 *   первого срабатывания safeAreaChanged (а это 200–600 мс). Пока --app-tg-top = 0,
 *   шапка Telegram с крестиком лежит ПОВЕРХ контента и перехватывает первые
 *   свайпы — пользователь видит "не листается".
 *
 *   Решение:
 *   1) Применяем fallback-отступ СРАЗУ после requestFullscreen, не дожидаясь
 *      первого события. В TG Android/Bot API 8.0+ это ≈ 44–48px.
 *   2) Ждём "честные" инсеты несколько раз с нарастающей задержкой (300 / 600 /
 *      1200 мс) — если Telegram их так и не прислал, оставляем fallback.
 *   3) Слушаем resize / orientationchange на window — часть Android-клиентов
 *      TG не шлёт viewportChanged, но window.resize приходит всегда.
 *   4) Форсим touch-action: pan-y на <html>, чтобы разморозить скролл, если
 *      WebView его заблокировал после fullscreen.
 */

/** Сумма верхних отступов: системный статус-бар + шапка клиента Telegram. */
function applyTopInset(): void {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  const safe = tg.safeAreaInset?.top ?? 0;
  const content = tg.contentSafeAreaInset?.top ?? 0;
  const total = safe + content;
  document.documentElement.style.setProperty("--app-tg-top", `${total}px`);
}

/**
 * Подбирает отступ сверху. Если Telegram уже отдал честные инсеты —
 * используем их. Если нет — берём fallback (типичная высота статус-бара +
 * заголовок TG в fullscreen). Вызывается многократно, потому что в TG данные
 * приходят с задержкой.
 */
function applyInsetWithFallback(): void {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  const safe = tg.safeAreaInset?.top ?? 0;
  const content = tg.contentSafeAreaInset?.top ?? 0;
  if (safe + content > 0) {
    document.documentElement.style.setProperty("--app-tg-top", `${safe + content}px`);
  } else if (!document.documentElement.style.getPropertyValue("--app-tg-top")) {
    // Fallback для гонки с safeAreaInset: на момент входа в fullscreen Telegram
    // ещё не прислал инсеты. Типовая высота: 24px (статус-бар) + 24px (шапка TG).
    document.documentElement.style.setProperty("--app-tg-top", "48px");
  }
}

/** Форсирует разрешение вертикального скролла, которое TG WebView иногда глушит. */
function ensureScrollUnlocked(): void {
  if (document.documentElement.getAttribute("data-modal-open") === "1") return;
  // Stealth-дизайн использует app-shell модель: скролл идёт внутри
  // #stealth-layout-root, а html/body заблокированы (overflow:hidden).
  // Не форсим тут overflow-y:auto, иначе документ снова сможет скроллиться
  // и вернётся блокировка свайпа на Android / синий фон на iOS.
  if (document.documentElement.getAttribute("data-stealth-scroll") === "1") return;

  const tg = window.Telegram?.WebApp;
  const isDesktop = tg && (tg.platform === "tdesktop" || tg.platform === "web" || tg.platform === "weba" || tg.platform === "webk");

  if (!isDesktop) {
    const html = document.documentElement;
    const body = document.body;
    html.style.touchAction = "pan-y";
    body.style.touchAction = "pan-y";
    html.style.overscrollBehaviorY = "contain";
    html.style.overflowY = "auto";
    body.style.overflowY = "auto";
    html.style.minHeight = "100dvh";
    body.style.minHeight = "100dvh";
  }
}

let viewportInitialized = false;

export function initTelegramViewport(): void {
  if (viewportInitialized) return;
  if (typeof window === "undefined") return;
  const tg = window.Telegram?.WebApp;
  // Пустой initData = страницу открыли не из Telegram; вьюпорт не трогаем.
  if (!tg || !tg.initData?.trim()) return;
  viewportInitialized = true;

  try {
    tg.ready();
  } catch {
    /* старый клиент — не критично */
  }
  try {
    // T-fix-native-blue-chrome (2026-08-15): "синий фон" на свайпе — это не
    // наш CSS, а нативный цвет шапки/фона самого Telegram-клиента (дефолт
    // его тёмной темы — тёмно-синий). CSS его перекрасить не может: рубер-бэнд
    // и системные жесты рисуются TG, а не WebView. Единственный способ —
    // явно сказать самому Telegram, каким цветом красить свою шапку/фон,
    // чтобы он совпадал с нашим #0a0a0b и «синевы» не было видно в принципе.
    tg.setHeaderColor?.("#0a0a0b");
    tg.setBackgroundColor?.("#0a0a0b");
  } catch {
    /* Bot API < 6.1 — нет этих методов, ничего не поделать через JS */
  }

  const isDesktop = tg.platform === "tdesktop" || tg.platform === "web" || tg.platform === "weba" || tg.platform === "webk";

  try {
    tg.expand();
  } catch {
    /* не поддерживается — останется высота по умолчанию */
  }

  if (!isDesktop) {
    // T-fix-no-disable-vertical-swipes (2026-08-18): disableVerticalSwipes()
    // на части Android-клиентов Telegram приводит к тому, что нативный слой
    // начинает перехватывать ВСЕ вертикальные жесты и страница перестаёт
    // скроллиться вовсе (юзер несколько раз подтверждал «не свайпает»).
    // Метод экспериментальный (Bot API 7.7), поэтому убираем его: скролл
    // важнее защиты от случайного закрытия шторки свайпом.
    ensureScrollUnlocked();

    // Полный экран — только на мобильных устройствах
    if (typeof tg.requestFullscreen === "function") {
      try {
        tg.requestFullscreen();
      } catch {
        applyTopInset();
        return;
      }

      document.documentElement.dataset.tgFullscreen = "1";
      applyInsetWithFallback();

      setTimeout(() => { applyInsetWithFallback(); ensureScrollUnlocked(); }, 300);
      setTimeout(() => { applyInsetWithFallback(); ensureScrollUnlocked(); }, 600);
      setTimeout(() => { applyInsetWithFallback(); ensureScrollUnlocked(); }, 1200);
      setTimeout(ensureScrollUnlocked, 2000);

      for (const ev of ["safeAreaChanged", "contentSafeAreaChanged", "viewportChanged"]) {
        try {
          tg.onEvent?.(ev, () => { applyTopInset(); ensureScrollUnlocked(); });
        } catch {
          /* событие неизвестно этой версии клиента */
        }
      }
      try {
        tg.onEvent?.("fullscreenChanged", () => {
          if (tg.isFullscreen === false) {
            delete document.documentElement.dataset.tgFullscreen;
          } else {
            document.documentElement.dataset.tgFullscreen = "1";
            applyTopInset();
            ensureScrollUnlocked();
            try {
              tg.setHeaderColor?.("#0a0a0b");
              tg.setBackgroundColor?.("#0a0a0b");
            } catch {
              /* Bot API < 6.1 */
            }
          }
        });
      } catch {
        /* Bot API < 8.0 */
      }

      window.addEventListener("resize", () => { applyTopInset(); ensureScrollUnlocked(); }, { passive: true });
      window.addEventListener("orientationchange", () => {
        setTimeout(() => { applyTopInset(); ensureScrollUnlocked(); }, 250);
      }, { passive: true });
    } else {
      applyTopInset();
    }
  } else {
    applyTopInset();
  }
}
