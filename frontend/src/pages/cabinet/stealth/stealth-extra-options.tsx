/**
 * StealthExtraOptions — «Доп. опции» (докупка трафика / устройств / серверов)
 * в стиле Stealth (Hundler-подобный неоновый дизайн).
 *
 * T-stealth-extras (2026-08-13): рескин Classic-страницы client-extra-options.tsx
 * под Stealth. Бизнес-логика (цены, прорейт устройств по остатку дней,
 * выбор подписки, провайдеры оплаты) скопирована один-в-один с Classic —
 * менялась только разметка/стили, чтобы «Итого» и реальное списание совпадали.
 *
 * T-fix-clamp (2026-08-14): на узких карточках 2-колоночной сетки текст вроде
 * «+1 доп. устройство» обрезался `truncate` с многоточием — юзер не мог
 * прочитать, что внутри. Заменил `truncate` на `line-clamp-2 min-h-[2.4rem]`
 * для заголовка и `line-clamp-1` для подзаголовка: текст теперь переносится
 * на 2 строки вместо обрезки.
 *
 * T-fix-price-overflow (2026-08-15): красная цена 125₽ в карточке оплаты
 * имела `drop-shadow-[0_0_12px_rgb(var(--stealth-accent)_/_0.35)]` —
 * `rounded-2xl` НЕ даёт overflow:hidden по умолчанию (только border-radius),
 * поэтому красное свечение выходило за правый скруглённый край карточки.
 * Добавил `overflow-hidden` на контейнер + `min-w-0` + `text-right` + явный
 * `max-w` на спан с ценой — drop-shadow теперь клиппится по краям, цена
 * не вылезает за рамки.
 *
 * Структура:
 *   1. Компактный intro-блок (заголовок + пояснение)
 *   2. Секции по типу опции (Трафик / Устройства / Серверы) —
 *      2-колоночная сетка карточек в стиле Stealth
 *   3. Клик по карточке → StealthModal с:
 *      - ценой (+ прорейт-пояснение для устройств)
 *      - выбором подписки, если их несколько
 *      - сеткой способов оплаты (тайлы, как в Тарифах)
 *      - большой белой CTA-кнопкой «Оплатить»
 */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Wifi, Smartphone, Server, Wallet, Bitcoin, Check, ChevronRight,
  Loader2, AlertCircle, Sparkles, Layers, Calendar, Plus, Minus,
} from "lucide-react";
import { useClientAuth } from "@/contexts/client-auth";
import { api } from "@/lib/api";
import type { PublicSellOption } from "@/lib/api";
import { StadiumButton } from "@/components/stealth/stadium-button";
import { StealthModal } from "@/components/stealth/stealth-modal";
import { cn } from "@/lib/utils";

function fmtPrice(n: number, currency: string) {
  const sym = currency.toUpperCase() === "RUB" ? "₽" : currency.toUpperCase() === "USD" ? "$" : currency.toUpperCase();
  return `${Math.round(n)}${sym}`;
}

function optionLabel(o: PublicSellOption): string {
  if (o.kind === "traffic") return `+${o.trafficGb} ГБ трафика`;
  if (o.kind === "devices") return `+${o.deviceCount} ${o.deviceCount === 1 ? "устройство" : "устройства"}`;
  if (o.kind === "servers") {
    const traffic = (o.trafficGb ?? 0) > 0 ? ` + ${o.trafficGb} ГБ` : "";
    return (o.name || "Доп. сервер") + traffic;
  }
  return "Доп. опция";
}

function optionIcon(o: PublicSellOption) {
  if (o.kind === "traffic") return Wifi;
  if (o.kind === "devices") return Smartphone;
  return Server;
}

type PayMethod =
  | { kind: "platega"; id: number; label: string; icon: typeof Wallet }
  | { kind: "yookassa"; label: string; icon: typeof Wallet }
  | { kind: "yoomoney"; label: string; icon: typeof Wallet }
  | { kind: "cryptopay"; label: string; icon: typeof Bitcoin }
  | { kind: "heleket"; label: string; icon: typeof Bitcoin }
  | { kind: "rollypay"; label: string; icon: typeof Wallet }
  | { kind: "lava"; label: string; icon: typeof Wallet }
  | { kind: "overpay"; label: string; icon: typeof Wallet }
  | { kind: "balance"; label: string; icon: typeof Wallet };

export function StealthExtraOptions() {
  const { state, refreshProfile } = useClientAuth();
  const token = state.token;
  const balance = state.client?.balance ?? 0;

  const [options, setOptions] = useState<PublicSellOption[]>([]);
  const [sellOptionsEnabled, setSellOptionsEnabled] = useState(false);
  const [plategaMethods, setPlategaMethods] = useState<{ id: number; label: string }[]>([]);
  const [yoomoneyEnabled, setYoomoneyEnabled] = useState(false);
  const [yookassaEnabled, setYookassaEnabled] = useState(false);
  const [cryptopayEnabled, setCryptopayEnabled] = useState(false);
  const [heleketEnabled, setHeleketEnabled] = useState(false);
  const [rollypayEnabled, setRollypayEnabled] = useState(false);
  const [lavaEnabled, setLavaEnabled] = useState(false);
  const [overpayEnabled, setOverpayEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const [payModal, setPayModal] = useState<PublicSellOption | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PayMethod | null>(null);
  const [deviceMethod, setDeviceMethod] = useState<PayMethod | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const [userSubs, setUserSubs] = useState<{ id: string; subscriptionIndex: number; label: string; expireAt: string | null; emoji: string | null; type: "root" | "secondary"; extraDevices: number; extraDevicesMonthlyPrice: number }[]>([]);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [deviceQty, setDeviceQty] = useState(1);

  useEffect(() => {
    api.getPublicConfig().then((c) => {
      setSellOptionsEnabled(Boolean(c.sellOptionsEnabled));
      setOptions(c.sellOptions ?? []);
      setPlategaMethods(c.plategaMethods ?? []);
      setYoomoneyEnabled(Boolean(c.yoomoneyEnabled));
      setYookassaEnabled(Boolean(c.yookassaEnabled));
      setCryptopayEnabled(Boolean(c.cryptopayEnabled));
      setHeleketEnabled(Boolean(c.heleketEnabled));
      setRollypayEnabled(Boolean((c as { rollypayEnabled?: boolean }).rollypayEnabled));
      setLavaEnabled(Boolean(c.lavaEnabled));
      setOverpayEnabled(Boolean(c.overpayEnabled));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!token) return;
    api.clientAllSubscriptions(token).then((r) => {
      const list = (r.items ?? []).map((it) => {
        const raw = it.subscription as Record<string, unknown> | null;
        const payload = (raw && typeof raw === "object" && raw.response && typeof raw.response === "object")
          ? (raw.response as Record<string, unknown>)
          : (raw ?? null);
        const expireAt = payload && typeof payload.expireAt === "string" ? payload.expireAt : null;
        const idx = it.subscriptionIndex ?? 0;
        return {
          id: it.id,
          subscriptionIndex: idx,
          label: it.tariffDisplayName?.trim() || `Подписка #${idx}`,
          expireAt,
          emoji: it.tariffMenuEmoji ?? null,
          type: it.type ?? "root",
          extraDevices: it.extraDevices ?? 0,
          extraDevicesMonthlyPrice: it.extraDevicesMonthlyPrice ?? 0,
        };
      });
      setUserSubs(list);
    }).catch(() => { /* not critical */ });
  }, [token]);

  useEffect(() => {
    if (payModal) {
      setSelectedSubId((prev) => prev && userSubs.some((s) => s.id === prev) ? prev : (userSubs[0]?.id ?? null));
    } else {
      setSelectedSubId(null);
      setSelectedMethod(null);
      setPayError(null);
    }
  }, [payModal, userSubs]);

  function computeOptionPrice(option: PublicSellOption | null, sub: { expireAt: string | null } | null): { price: number; daysLeft: number; coef: number } {
    const base = option?.price ?? 0;
    if (!option || option.kind !== "devices" || !sub?.expireAt) return { price: base, daysLeft: 0, coef: 1 };
    const exp = new Date(sub.expireAt).getTime();
    if (Number.isNaN(exp)) return { price: base, daysLeft: 0, coef: 1 };
    const daysLeft = Math.max(0, (exp - Date.now()) / 86_400_000);
    const coef = Math.max(1, daysLeft / 30);
    return { price: Math.floor(base * coef), daysLeft: Math.round(daysLeft), coef: Math.round(coef * 10) / 10 };
  }

  const selSub = userSubs.find((s) => s.id === selectedSubId) ?? null;
  const eff = computeOptionPrice(payModal, selSub);
  const qty = payModal?.kind === "devices" ? deviceQty : 1;
  const totalPrice = eff.price * qty;
  const hasBalance = balance >= totalPrice;
  const isDeviceProrata = payModal?.kind === "devices" && eff.coef > 1;

  function buildMethods(currency: string | undefined): PayMethod[] {
    const cur = currency?.toUpperCase();
    const list: PayMethod[] = [];
    plategaMethods.forEach((m) => list.push({ kind: "platega", id: m.id, label: m.label, icon: Wallet }));
    if (yookassaEnabled && cur === "RUB") list.push({ kind: "yookassa", label: "YooKassa", icon: Wallet });
    if (yoomoneyEnabled && cur === "RUB") list.push({ kind: "yoomoney", label: "YooMoney", icon: Wallet });
    if (cryptopayEnabled) list.push({ kind: "cryptopay", label: "Crypto Pay", icon: Bitcoin });
    if (heleketEnabled) list.push({ kind: "heleket", label: "Heleket", icon: Bitcoin });
    if (rollypayEnabled) list.push({ kind: "rollypay", label: "RollyPay", icon: Wallet });
    if (lavaEnabled && cur === "RUB") list.push({ kind: "lava", label: "LAVA", icon: Wallet });
    if (overpayEnabled) list.push({ kind: "overpay", label: "Overpay", icon: Wallet });
    return list;
  }

  const availableMethods: PayMethod[] = useMemo(
    () => buildMethods(payModal?.currency),
    [plategaMethods, yookassaEnabled, yoomoneyEnabled, cryptopayEnabled, heleketEnabled, rollypayEnabled, lavaEnabled, overpayEnabled, payModal],
  );

  const addDeviceOption = useMemo(() => {
    const devs = options.filter((o) => o.kind === "devices");
    return devs.find((o) => o.deviceCount === 1) || devs[0] || null;
  }, [options]);

  const deviceMethods: PayMethod[] = useMemo(
    () => buildMethods(addDeviceOption?.currency),
    [plategaMethods, yookassaEnabled, yoomoneyEnabled, cryptopayEnabled, heleketEnabled, rollypayEnabled, lavaEnabled, overpayEnabled, addDeviceOption],
  );

  useEffect(() => {
    if (!selectedMethod && availableMethods.length > 0) setSelectedMethod(availableMethods[0]);
  }, [availableMethods, selectedMethod]);

  useEffect(() => {
    if (!deviceMethod && deviceMethods.length > 0) setDeviceMethod(deviceMethods[0]);
  }, [deviceMethods, deviceMethod]);

  // --- Управление доп. устройствами (+/-) ---
  const [removeDevicesSubId, setRemoveDevicesSubId] = useState<string | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  function computeRefund(sub: { extraDevicesMonthlyPrice: number; expireAt: string | null } | null): { refund: number; daysLeft: number } {
    if (!sub || sub.extraDevicesMonthlyPrice <= 0 || !sub.expireAt) return { refund: 0, daysLeft: 0 };
    const exp = new Date(sub.expireAt).getTime();
    if (Number.isNaN(exp)) return { refund: 0, daysLeft: 0 };
    const daysLeft = Math.max(0, (exp - Date.now()) / 86_400_000);
    const refund = Math.floor(sub.extraDevicesMonthlyPrice * (daysLeft / 30));
    return { refund: Math.max(0, refund), daysLeft: Math.round(daysLeft) };
  }

  async function doRemoveExtraDevices() {
    if (!token || !removeDevicesSubId) return;
    const sub = userSubs.find((s) => s.id === removeDevicesSubId);
    if (!sub) return;
    setRemoveLoading(true);
    try {
      await api.clientRemoveExtraDevices(token, sub.type, sub.id);
      setRemoveDevicesSubId(null);
      await refreshProfile();
      api.clientAllSubscriptions(token).then((r) => {
        const list = (r.items ?? []).map((it) => {
          const raw = it.subscription as Record<string, unknown> | null;
          const payload = (raw && typeof raw === "object" && raw.response && typeof raw.response === "object")
            ? (raw.response as Record<string, unknown>) : (raw ?? null);
          const expireAt = payload && typeof payload.expireAt === "string" ? payload.expireAt : null;
          const idx = it.subscriptionIndex ?? 0;
          return {
            id: it.id, subscriptionIndex: idx,
            label: it.tariffDisplayName?.trim() || `Подписка #${idx}`,
            expireAt, emoji: it.tariffMenuEmoji ?? null,
            type: it.type ?? "root",
            extraDevices: it.extraDevices ?? 0,
            extraDevicesMonthlyPrice: it.extraDevicesMonthlyPrice ?? 0,
          };
        });
        setUserSubs(list);
      }).catch(() => {});
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Ошибка удаления устройств");
    } finally {
      setRemoveLoading(false);
    }
  }

  async function payWith(option: PublicSellOption, method: PayMethod, subId: string | null, qty: number, total: number) {
    if (!token) return;
    setPaying(true);
    setPayError(null);
    const extraOption = { kind: option.kind, productId: option.id, ...(option.kind === "devices" ? { deviceCount: qty } : {}), targetSubscriptionId: subId ?? undefined };
    try {
      if (method.kind === "balance") {
        if (balance < total) { setPayError("Недостаточно средств на балансе"); return; }
        await api.clientPayOptionByBalance(token, { extraOption: { kind: option.kind, productId: option.id, ...(option.kind === "devices" ? { deviceCount: qty } : {}) }, targetSubscriptionId: subId ?? undefined });
        setPayModal(null);
        await refreshProfile();
        return;
      }
      let url: string | null = null;
      if (method.kind === "platega") {
        const r = await api.clientCreatePlategaPayment(token, { paymentMethod: method.id, extraOption });
        url = r.paymentUrl;
      } else if (method.kind === "yookassa") {
        const r = await api.yookassaCreatePayment(token, { extraOption });
        url = r.confirmationUrl;
      } else if (method.kind === "yoomoney") {
        const r = await api.yoomoneyCreateFormPayment(token, { paymentType: "AC", extraOption });
        url = r.paymentUrl;
      } else if (method.kind === "cryptopay") {
        const r = await api.cryptopayCreatePayment(token, { extraOption });
        url = r.miniAppPayUrl ?? r.webAppPayUrl ?? r.payUrl;
      } else if (method.kind === "heleket") {
        const r = await api.heleketCreatePayment(token, { extraOption });
        url = r.payUrl;
      } else if (method.kind === "rollypay") {
        const r = await api.rollypayCreatePayment(token, { extraOption });
        url = r.payUrl;
      } else if (method.kind === "lava") {
        const r = await api.lavaCreatePayment(token, { extraOption });
        url = r.payUrl;
      } else if (method.kind === "overpay") {
        const r = await api.overpayCreatePayment(token, { extraOption });
        url = r.payUrl;
      }
      if (url) window.location.href = url;
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Ошибка создания платежа");
    } finally {
      setPaying(false);
    }
  }

  async function doPay() {
    if (!payModal || !selectedMethod) return;
    await payWith(payModal, selectedMethod, selectedSubId, qty, totalPrice);
  }

  async function doPayDevice() {
    if (!addDeviceOption || !deviceMethod) return;
    const subId = selectedSubId ?? userSubs[0]?.id ?? null;
    const sub = userSubs.find((s) => s.id === subId) ?? null;
    const unitEff = computeOptionPrice(addDeviceOption, sub);
    await payWith(addDeviceOption, deviceMethod, subId, deviceQty, unitEff.price * deviceQty);
  }

  if (loading) {
    return (
      <div className="px-4 pt-2 space-y-4 pb-2">
        {[164, 120, 120].map((h, i) => (
          <div key={i} className="rounded-3xl bg-white/[0.03] border border-white/[0.06] overflow-hidden relative" style={{ height: h }}>
            <motion.div
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.06] to-transparent"
              animate={{ x: ["-100%", "400%"] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "linear", delay: 0.2 + i * 0.2 }}
            />
          </div>
        ))}
      </div>
    );
  }

  if (!sellOptionsEnabled || options.length === 0) {
    return (
      <div className="px-4 pt-4 space-y-4 pb-2">
        <h1 className="text-lg font-bold tracking-tight flex items-center gap-2">
          <Layers className="h-5 w-5 text-saccent-400" />
          Доп. опции
        </h1>
        <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/40 p-6 text-center">
          <p className="text-sm text-zinc-400">
            {!sellOptionsEnabled
              ? "Продажа доп. опций отключена."
              : "Дополнительные опции пока не настроены. Оформите подписку в разделе «Тарифы», затем здесь можно будет докупить трафик, устройства или серверы."}
          </p>
        </div>
      </div>
    );
  }

  const trafficOptions = options.filter((o) => o.kind === "traffic");
  const deviceOptions = options.filter((o) => o.kind === "devices");
  const serverOptions = options.filter((o) => o.kind === "servers");

  const sections: { title: string; icon: typeof Wifi; items: PublicSellOption[]; ctaLabel: string; suffix?: string }[] = [
    { title: "Дополнительный трафик", icon: Wifi, items: trafficOptions, ctaLabel: "Купить пакет" },
    { title: "Дополнительные серверы", icon: Server, items: serverOptions, ctaLabel: "Купить сервер" },
  ];

  return (
    <div className="px-4 pt-2 space-y-6 pb-2">
      {/* Intro */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-zinc-950/50 backdrop-blur-2xl p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-3xl"
          style={{
            background:
              "radial-gradient(160px 160px at calc(100% + 20px) -20px, rgb(var(--stealth-accent) / 0.18), transparent 70%)",
          }}
        />
        <div className="relative flex items-center gap-2.5 mb-1.5">
          <div className="p-1.5 rounded-lg bg-saccent-500/15 shrink-0">
            <Layers className="h-4 w-4 text-saccent-400" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">Доп. опции</h1>
        </div>
        <p className="relative text-[13px] text-zinc-400 leading-relaxed">
          Не хватает трафика или нужны доп. устройства? Прокачайте текущую подписку —
          опции применяются сразу после оплаты.
        </p>
      </motion.div>

      {sections.filter((s) => s.items.length > 0).map((section) => {
        const SectionIcon = section.icon;
        return (
          <section key={section.title} className="space-y-3">
            <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.12em] text-zinc-400 px-1">
              <SectionIcon className="h-3.5 w-3.5 text-saccent-400" />
              {section.title}
            </h2>
            <div className="grid grid-cols-2 gap-2.5">
              {section.items.map((opt) => {
                const Icon = optionIcon(opt);
                return (
                  <motion.button
                    key={`${opt.kind}-${opt.id}`}
                    type="button"
                    onClick={() => setPayModal(opt)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    className="text-left rounded-2xl border border-white/[0.07] bg-zinc-950/40 backdrop-blur-xl p-3.5 flex flex-col gap-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-saccent-500/30 hover:bg-white/[0.03] transition-all duration-300"
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="h-9 w-9 shrink-0 rounded-xl bg-saccent-500/10 border border-saccent-500/20 flex items-center justify-center text-saccent-400">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold leading-tight break-words line-clamp-2 min-h-[2.4rem]">
                          {opt.name || optionLabel(opt)}
                        </p>
                        <p className="text-[11px] text-zinc-500 leading-snug break-words line-clamp-1 mt-0.5">
                          {optionLabel(opt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.06]">
                      <div className="flex items-baseline gap-1 min-w-0">
                        <span className="text-base font-extrabold tabular-nums truncate">{fmtPrice(opt.price, opt.currency)}</span>
                        {section.suffix && <span className="text-[10px] text-zinc-500 font-medium shrink-0">{section.suffix}</span>}
                      </div>
                      <span className="h-6 w-6 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center shrink-0">
                        <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Дополнительные устройства — единый интерфейс */}
      {deviceOptions.length > 0 && userSubs.length > 0 && (() => {
        const addOpt = findAddDeviceOption();
        if (!addOpt) return null;
        const selSub = userSubs.find((s) => s.id === selectedSubId) ?? userSubs[0] ?? null;
        const unitEff = computeOptionPrice(addOpt, selSub);
        const totalPriceDev = unitEff.price * deviceQty;
        return (
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.12em] text-zinc-400 px-1">
              <Smartphone className="h-3.5 w-3.5 text-saccent-400" />
              Дополнительные устройства
            </h2>
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-4 space-y-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-10 w-10 shrink-0 rounded-xl bg-saccent-500/10 border border-saccent-500/20 flex items-center justify-center text-saccent-400">
                    <Smartphone className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-[13px] font-bold text-white">Количество устройств</p>
                    <p className="text-[10px] text-zinc-500">{fmtPrice(unitEff.price, addOpt.currency)} за 1 шт. / 30 дн.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    className="h-9 w-9 rounded-xl border border-white/[0.08] text-zinc-300 hover:bg-white/[0.06] transition-colors disabled:opacity-30 flex items-center justify-center"
                    disabled={deviceQty <= 1}
                    onClick={() => setDeviceQty((q) => Math.max(1, q - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="text-2xl font-black tabular-nums text-white min-w-[2.5ch] text-center">{deviceQty}</span>
                  <button
                    type="button"
                    className="h-9 w-9 rounded-xl border border-saccent-500/30 text-saccent-400 hover:bg-saccent-500/10 transition-colors flex items-center justify-center"
                    onClick={() => setDeviceQty((q) => q + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-saccent-400" />
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-400">К какой подписке</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {userSubs.map((s) => {
                    const sEff = computeOptionPrice(addOpt, s);
                    const active = s.id === (selectedSubId ?? userSubs[0]?.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedSubId(s.id)}
                        className={cn(
                          "w-full text-left rounded-xl border p-3 transition-all flex items-center gap-2.5",
                          active
                            ? "border-saccent-500/40 bg-saccent-500/[0.08] ring-1 ring-saccent-500/30"
                            : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-saccent-500/20"
                        )}
                      >
                        <div className={cn("h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-sm border", active ? "bg-saccent-500/15 border-saccent-500/30" : "bg-white/[0.04] border-white/[0.08]")}>
                          {s.emoji || "📦"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-bold leading-tight truncate">
                            #{s.subscriptionIndex} · <span className="font-medium text-zinc-400">{s.label}</span>
                          </p>
                          <p className="text-[10px] text-zinc-500 mt-0.5 tabular-nums">
                            {fmtPrice(sEff.price * deviceQty, addOpt.currency)}
                            {sEff.coef > 1 && <span className="text-saccent-400/80"> · ×{sEff.coef} за {sEff.daysLeft} дн</span>}
                          </p>
                        </div>
                        {active ? <Check className="h-4 w-4 text-saccent-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3 flex items-center justify-between">
                <span className="text-[11px] text-zinc-500">Итого:</span>
                <span className="text-xl font-black text-saccent-400 tabular-nums drop-shadow-[0_0_8px_rgb(var(--stealth-accent)_/_0.3)]">{fmtPrice(totalPriceDev, addOpt.currency)}</span>
              </div>

              <StadiumButton
                className="w-full"
                onClick={() => {
                  if (!selSub) return;
                  setSelectedSubId(selSub.id);
                  setPayModal(addOpt);
                }}
                iconLeft={<Sparkles className="h-4 w-4" />}
              >
                Оплатить {fmtPrice(totalPriceDev, addOpt.currency)}
              </StadiumButton>
            </div>
          </section>
        );
      })()}

      {/* Payment lightbox */}
      <StealthModal open={!!payModal} onClose={() => { if (!paying) setPayModal(null); }} title="Оплата опции">
        {payModal && (
          <div className="space-y-4">
            {/* T-fix-price-overflow (2026-08-15): родитель получил
                overflow-hidden — drop-shadow на цене клиппится по скруглённым
                краям карточки (раньше свечение 125₽ уходило за правую рамку).
                Цена обёрнута в min-w-0 контейнер с text-right + max-w + truncate
                — при длинной цене она сожмётся до границ, а не будет разрывать
                вёрстку. */}
            <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/60 p-4 overflow-hidden">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-zinc-400 font-medium">{payModal.name || optionLabel(payModal)}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{optionLabel(payModal)}</p>
                </div>
                <span className="text-2xl font-black tabular-nums text-saccent-400 drop-shadow-[0_0_12px_rgb(var(--stealth-accent)_/_0.35)] shrink-0 text-right max-w-[45%] truncate">
                  {fmtPrice(totalPrice, payModal.currency)}
                </span>
              </div>
              {isDeviceProrata && (
                <p className="text-[11px] text-zinc-500 mt-2.5 flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  {fmtPrice(payModal.price, payModal.currency)}/30 дн × {eff.coef} (осталось ~{eff.daysLeft} дн)
                </p>
              )}
            </div>

            {userSubs.length === 0 ? (
              <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.08] p-3.5 text-xs text-amber-300">
                Сначала оформите подписку в разделе «Тарифы» — потом опцию можно будет применить.
              </div>
            ) : userSubs.length > 1 ? (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 px-1">К какой подписке</p>
                <div className="space-y-2">
                  {userSubs.map((s) => {
                    const sEff = computeOptionPrice(payModal, s);
                    const active = s.id === selectedSubId;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSelectedSubId(s.id)}
                        className={cn(
                          "w-full text-left rounded-2xl border p-3 transition-all flex items-center gap-3 shadow-[inset_0_0_0_1px_transparent]",
                          active ? "border-saccent-500/50 bg-saccent-500/10 shadow-[inset_0_0_0_1px_rgb(var(--stealth-accent)_/_0.15)]" : "border-white/[0.08] bg-zinc-900/40 hover:border-white/20",
                        )}
                      >
                        <div className={cn("h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-sm border", active ? "bg-saccent-500/15 border-saccent-500/30" : "bg-white/[0.04] border-white/10")}>
                          {s.emoji || "📦"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold leading-tight truncate">
                            {s.subscriptionIndex} · <span className="font-medium text-zinc-400">{s.label}</span>
                          </p>
                          <p className="text-[10px] text-zinc-500 mt-0.5 tabular-nums">
                            {fmtPrice(sEff.price, payModal.currency)}
                            {payModal.kind === "devices" && sEff.coef > 1 && (
                              <span className="text-saccent-400"> · ×{sEff.coef} (~{sEff.daysLeft} дн)</span>
                            )}
                          </p>
                        </div>
                        {active ? <Check className="h-4 w-4 text-saccent-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-500 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {availableMethods.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-500 px-1">Способ оплаты</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {availableMethods.map((m) => {
                    const active = selectedMethod && (
                      (selectedMethod.kind === "platega" && m.kind === "platega" && selectedMethod.id === m.id) ||
                      (selectedMethod.kind === m.kind && m.kind !== "platega" && selectedMethod.kind !== "platega")
                    );
                    const Icon = m.icon;
                    return (
                      <motion.button
                        key={`${m.kind}-${m.kind === "platega" ? m.id : ""}`}
                        type="button"
                        onClick={() => setSelectedMethod(m)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        className={cn(
                          "rounded-2xl border p-3.5 transition-colors duration-300 flex flex-col items-center gap-1.5 backdrop-blur-xl shadow-[inset_0_0_0_1px_transparent]",
                          active
                            ? "bg-white/[0.06] border-saccent-500/45 shadow-[0_0_28px_-10px_rgb(var(--stealth-accent)_/_0.5),inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_0_1px_rgb(var(--stealth-accent)_/_0.2)]"
                            : "bg-white/[0.02] border-white/[0.06] hover:border-white/20 hover:bg-white/[0.04]",
                        )}
                      >
                        <Icon className={cn("h-4 w-4", active ? "text-saccent-400 drop-shadow-[0_0_8px_rgb(var(--stealth-accent)_/_0.6)]" : "text-zinc-500")} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">{m.label}</span>
                      </motion.button>
                    );
                  })}
                  <motion.button
                    type="button"
                    onClick={() => hasBalance && setSelectedMethod({ kind: "balance", label: "Баланс", icon: Wallet })}
                    disabled={!hasBalance}
                    whileHover={hasBalance ? { scale: 1.02 } : undefined}
                    whileTap={hasBalance ? { scale: 0.97 } : undefined}
                    className={cn(
                      "rounded-2xl border p-3.5 transition-colors duration-300 flex flex-col items-center gap-1 backdrop-blur-xl shadow-[inset_0_0_0_1px_transparent]",
                      selectedMethod?.kind === "balance"
                        ? "bg-emerald-500/[0.08] border-emerald-500/35 shadow-[0_0_28px_-10px_rgba(52,211,153,0.45),inset_0_1px_0_rgba(255,255,255,0.07),inset_0_0_0_1px_rgba(52,211,153,0.2)]"
                        : hasBalance
                          ? "bg-white/[0.02] border-white/[0.06] hover:border-white/20 hover:bg-white/[0.04]"
                          : "bg-zinc-900/20 border-white/[0.04] opacity-60 cursor-not-allowed",
                    )}
                  >
                    <Wallet className={cn("h-4 w-4", selectedMethod?.kind === "balance" ? "text-emerald-400" : hasBalance ? "text-zinc-500" : "text-zinc-600")} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Баланс</span>
                    <span className={cn("text-[9px] font-medium tabular-nums", hasBalance ? "text-emerald-400/90" : "text-zinc-500")}>
                      {hasBalance ? fmtPrice(balance, payModal.currency) : "не хватает"}
                    </span>
                  </motion.button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-white/[0.08] bg-zinc-900/40 p-3 text-xs text-zinc-400 text-center">
                Способы оплаты не настроены.
              </div>
            )}

            {payError && (
              <div className="rounded-xl bg-saccent-500/10 border border-saccent-500/30 p-3 flex items-start gap-2 text-xs">
                <AlertCircle className="h-4 w-4 text-saccent-400 shrink-0 mt-0.5" />
                <span className="text-saccent-300">{payError}</span>
              </div>
            )}

            <StadiumButton
              variant="white"
              size="lg"
              onClick={doPay}
              disabled={paying || !selectedMethod || userSubs.length === 0}
              iconLeft={paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            >
              {paying ? "Создаём платёж…" : `Оплатить ${fmtPrice(totalPrice, payModal.currency)}`}
            </StadiumButton>
          </div>
        )}
      </StealthModal>

      {/* Диалог подтверждения удаления доп. устройств */}
      <StealthModal open={!!removeDevicesSubId} onClose={() => { if (!removeLoading) setRemoveDevicesSubId(null); }} title="Удалить доп. устройства?">
        <div className="space-y-4 p-1">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-2 rounded-xl bg-red-500/10 border border-red-500/20">
              <Minus className="h-5 w-5 text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-white">Удалить доп. устройства?</h3>
          </div>
          {(() => {
            const sub = userSubs.find((s) => s.id === removeDevicesSubId);
            if (!sub) return null;
            const { refund, daysLeft } = computeRefund(sub);
            return (
              <div className="space-y-3">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-2">
                  <p className="text-xs text-zinc-400">Подписка: <span className="font-bold text-white">{sub.label}</span></p>
                  <p className="text-xs text-zinc-400">Доп. устройств: <span className="font-bold text-white">{sub.extraDevices}</span></p>
                  <p className="text-xs text-zinc-400">Осталось дней: <span className="font-bold text-white">{daysLeft}</span></p>
                  <div className="pt-2 border-t border-white/[0.06] flex items-baseline gap-2">
                    <span className="text-xs text-zinc-400">Возврат на баланс:</span>
                    <span className="text-xl font-black text-emerald-400">{fmtPrice(refund, "RUB")}</span>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-500 text-center">
                  Все доп. устройства будут отключены. Деньги вернутся на баланс.
                </p>
              </div>
            );
          })()}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setRemoveDevicesSubId(null)}
              disabled={removeLoading}
              className="flex-1 h-11 rounded-xl border border-white/[0.08] text-zinc-400 hover:bg-white/[0.05] transition-colors text-sm font-medium disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={doRemoveExtraDevices}
              disabled={removeLoading}
              className="flex-1 h-11 rounded-xl bg-red-500/90 hover:bg-red-500 text-white transition-colors text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {removeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Minus className="h-4 w-4" />}
              {removeLoading ? "Удаляем…" : "Удалить все"}
            </button>
          </div>
        </div>
      </StealthModal>
    </div>
  );
}
