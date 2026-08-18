/**
 * Hero (variant: split) — двух-колоночный hero с акцентным заголовком, CTA
 * и phone-frame мокапом Mini App справа.
 * Текст: badge, headline1, headline2, title, subtitle, hint, ctaText, secondaryCtaText.
 * Мокап: rightCardEyebrow, rightCardTitle, rightCardSubtitle.
 * Props: ctaUrl, secondaryCtaUrl, showRightCard.
 */

import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, BatteryFull, Home, Rocket, Signal, Sparkles, User, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUtmCaptureAndBuildLink, txt, p, SECTION_SCROLL_OFFSET, useLandingTheme } from "../utils";
import type { LandingApiBlock } from "../types";

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

interface HeroSplitProps {
  block: LandingApiBlock;
  serviceName: string;
}

export function HeroSplit({ block, serviceName }: HeroSplitProps) {
  const { accentTheme, resolvedMode } = useLandingTheme();
  const buildLink = useUtmCaptureAndBuildLink();

  const badge = txt(block.text, "badge", "Работает прямо сейчас");
  const headline1 = txt(block.text, "headline1", "Цифровая свобода");
  const headline2 = txt(block.text, "headline2", "без границ");
  const title = txt(block.text, "title", serviceName);
  const subtitle = txt(block.text, "subtitle", "Премиальный доступ, который работает всегда.");
  const hint = txt(block.text, "hint", "Пробный период бесплатно · Карта · СБП · Крипта");
  const ctaText = txt(block.text, "ctaText", "Попробовать бесплатно");
  const secondaryCtaText = txt(block.text, "secondaryCtaText", "Выбрать тариф");
  const ctaUrl = p(block.props, "ctaUrl", "/cabinet/register");
  const secondaryCtaUrl = p(block.props, "secondaryCtaUrl", "#tariffs");
  const showRightCard = block.props.showRightCard !== false;

  const accentBg = `linear-gradient(135deg, ${accentTheme.primary}, ${accentTheme.tertiary})`;
  const accentText: React.CSSProperties = {
    backgroundImage: accentBg,
    color: resolvedMode === "dark" ? accentTheme.tertiary : accentTheme.primary,
  };

  return (
    <section id="home" className={`container mx-auto px-4 pb-12 pt-12 md:pb-20 md:pt-16 ${SECTION_SCROLL_OFFSET}`}>
      <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <motion.div {...fadeUp} className="max-w-3xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] backdrop-blur-xl px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-zinc-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: accentTheme.primary }} />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: accentTheme.primary }} />
            </span>
            {badge}
          </div>

          <h1 className="text-5xl font-black leading-[0.95] tracking-[-0.05em] text-white md:text-6xl lg:text-[5.4rem]">
            {headline1}
            <span className="block bg-clip-text text-transparent" style={accentText}>
              {headline2}
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-300 md:text-xl">
            {title ? <span className="font-semibold text-white">{title}</span> : null}
            {title ? " — " : null}
            {subtitle}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="group h-14 rounded-full border px-7 text-base font-semibold text-white shadow-lg" style={{ background: accentBg, borderColor: "transparent" }}>
              <Link to={buildLink(ctaUrl)} className="flex items-center justify-center gap-2">
                {ctaText}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-14 rounded-full border-white/[0.1] bg-white/[0.04] backdrop-blur-xl px-7 text-base text-white hover:bg-white/[0.08]">
              <Link to={buildLink(secondaryCtaUrl)}>{secondaryCtaText}</Link>
            </Button>
          </div>

          {hint ? <p className="mt-5 text-sm text-zinc-500">{hint}</p> : null}
        </motion.div>

        {showRightCard ? (
          <MiniAppMockup block={block} serviceName={serviceName} accentBg={accentBg} accentPrimary={accentTheme.primary} />
        ) : null}
      </div>
    </section>
  );
}

/** Phone-frame мокап Mini App: статус-бар, карточка подписки, кнопки, нижний таб-бар. */
function MiniAppMockup({
  block,
  serviceName,
  accentBg,
  accentPrimary,
}: {
  block: LandingApiBlock;
  serviceName: string;
  accentBg: string;
  accentPrimary: string;
}) {
  const eyebrow = txt(block.text, "rightCardEyebrow", "Mini App");
  const cardTitle = txt(block.text, "rightCardTitle", "Подписка активна");
  const cardSubtitle = txt(block.text, "rightCardSubtitle", "Все сервисы работают");

  return (
    <motion.aside
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.15 }}
      className="relative mx-auto w-full max-w-[340px]"
    >
      <div
        className="pointer-events-none absolute -inset-8 rounded-full opacity-30 blur-3xl"
        style={{ background: accentBg }}
      />

      <div className="relative rounded-[44px] border border-white/[0.12] bg-zinc-950/90 p-2.5 shadow-2xl backdrop-blur-xl">
        <div className="overflow-hidden rounded-[36px] border border-white/[0.06] bg-[#0d0d10]">
          {/* Статус-бар */}
          <div className="flex items-center justify-between px-6 pb-1 pt-3 text-[11px] font-semibold text-zinc-400">
            <span>9:41</span>
            <div className="h-5 w-24 rounded-full bg-black" />
            <div className="flex items-center gap-1">
              <Signal className="h-3 w-3" />
              <Wifi className="h-3 w-3" />
              <BatteryFull className="h-3.5 w-3.5" />
            </div>
          </div>

          {/* Шапка мини-аппа */}
          <div className="flex items-center justify-between px-5 pb-3 pt-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: accentBg }}>
                <Rocket className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="text-[13px] font-bold leading-tight text-white">{serviceName}</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{eyebrow}</div>
              </div>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04]">
              <User className="h-4 w-4 text-zinc-400" />
            </div>
          </div>

          {/* Карточка подписки */}
          <div className="px-4">
            <div className="rounded-3xl border border-white/[0.08] bg-white/[0.04] p-4">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Подписка</span>
                <span
                  className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                  style={{ background: accentBg }}
                >
                  Активна
                </span>
              </div>
              <div className="mt-2 text-lg font-black text-white">{cardTitle}</div>
              <div className="text-xs text-zinc-400">{cardSubtitle}</div>

              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-[11px] text-zinc-400">
                  <span>Трафик</span>
                  <span className="font-semibold text-zinc-300">128 / 500 ГБ</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: accentBg }}
                    initial={{ width: 0 }}
                    animate={{ width: "26%" }}
                    transition={{ duration: 1, delay: 0.6 }}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] py-2.5">
                  <div className="text-base font-black text-white">27</div>
                  <div className="text-[10px] text-zinc-500">дней осталось</div>
                </div>
                <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] py-2.5">
                  <div className="text-base font-black text-white">5</div>
                  <div className="text-[10px] text-zinc-500">устройств</div>
                </div>
              </div>
            </div>

            {/* Кнопка подключения */}
            <motion.button
              type="button"
              tabIndex={-1}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white shadow-lg"
              style={{ background: accentBg }}
              animate={{ boxShadow: [`0 0 0px 0px ${accentPrimary}00`, `0 0 24px 2px ${accentPrimary}55`, `0 0 0px 0px ${accentPrimary}00`] }}
              transition={{ duration: 2.4, repeat: Infinity }}
            >
              <Sparkles className="h-4 w-4" />
              Подключить
            </motion.button>
          </div>

          {/* Нижний таб-бар */}
          <div className="mt-4 flex items-center justify-around border-t border-white/[0.06] bg-black/40 px-6 pb-5 pt-3">
            <div className="flex flex-col items-center gap-1">
              <Home className="h-4.5 w-4.5" style={{ color: accentPrimary }} />
              <span className="text-[9px] font-semibold" style={{ color: accentPrimary }}>Главная</span>
            </div>
            <div className="flex flex-col items-center gap-1 text-zinc-600">
              <Rocket className="h-4.5 w-4.5" />
              <span className="text-[9px] font-semibold">Тарифы</span>
            </div>
            <div className="flex flex-col items-center gap-1 text-zinc-600">
              <User className="h-4.5 w-4.5" />
              <span className="text-[9px] font-semibold">Профиль</span>
            </div>
          </div>
        </div>
      </div>
    </motion.aside>
  );
}
