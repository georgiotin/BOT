/**
 * StealthGifts — «Подарки» в стиле Stealth.
 *
 * T-stealth-gifts (2026-08-13): рескин Classic-страницы client-gifts.tsx под
 * Stealth. Бизнес-логика (покупка с баланса, коды, история, активация себе)
 * скопирована 1-в-1 с Classic — менялась только разметка/стили.
 *
 * Структура (мобильный, вертикальный поток — как остальные Stealth-страницы):
 *   1. Hero: заголовок + счётчик слотов + CTA «Купить подписку»
 *   2. Активировать код (инпут + кнопка)
 *   3. Статистика (3 плитки)
 *   4. Мои подарки — карточки подписок с действиями
 *   5. Подарочные коды — список
 *   6. История — сворачиваемый список
 *   7. Buy modal (список тарифов) → Picker modal (срок + доп. устройства)
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gift, Package, Copy, Check, Loader2, Plus, X, Calendar, Clock,
  Send, Link as LinkIcon, CheckCircle2, Play, ShoppingCart, Mail,
  XCircle, Trash, History, ChevronDown, ChevronUp, User, Sparkles, Smartphone,
} from "lucide-react";
import { useClientAuth } from "@/contexts/client-auth";
import { toast } from "@/components/ui/toast";
import { useCabinetConfig } from "@/contexts/cabinet-config";
import { api, type PublicTariff, type PublicTariffCategory } from "@/lib/api";
import { StadiumButton } from "@/components/stealth/stadium-button";
import { StealthModal } from "@/components/stealth/stealth-modal";
import { cn } from "@/lib/utils";

function fmtPrice(n: number, currency: string) {
  const sym = currency.toUpperCase() === "RUB" ? "₽" : currency.toUpperCase() === "USD" ? "$" : currency.toUpperCase();
  return `${Math.round(n)}${sym}`;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "вчера";
  if (days < 7) return `${days} дн назад`;
  return new Date(dateStr).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const HISTORY_EVENT_MAP: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  PURCHASED: { icon: <ShoppingCart className="w-4 h-4" />, label: "Подписка куплена", color: "text-sky-400 border-sky-500/25 bg-sky-500/10" },
  ACTIVATED_SELF: { icon: <CheckCircle2 className="w-4 h-4" />, label: "Добавлена в профиль", color: "text-emerald-400 border-emerald-500/25 bg-emerald-500/10" },
  CODE_CREATED: { icon: <Gift className="w-4 h-4" />, label: "Подарочный код создан", color: "text-saccent-400 border-saccent-500/25 bg-saccent-500/10" },
  GIFT_SENT: { icon: <Send className="w-4 h-4" />, label: "Подарок отправлен", color: "text-violet-400 border-violet-500/25 bg-violet-500/10" },
  GIFT_RECEIVED: { icon: <Mail className="w-4 h-4" />, label: "Подарок получен", color: "text-emerald-400 border-emerald-500/25 bg-emerald-500/10" },
  CODE_CANCELLED: { icon: <XCircle className="w-4 h-4" />, label: "Код отменён", color: "text-red-400 border-red-500/25 bg-red-500/10" },
  CODE_EXPIRED: { icon: <Clock className="w-4 h-4" />, label: "Код истёк", color: "text-amber-400 border-amber-500/25 bg-amber-500/10" },
  DELETED: { icon: <Trash className="w-4 h-4" />, label: "Подписка удалена", color: "text-red-400 border-red-500/25 bg-red-500/10" },
};

type Subscription = { id: string; ownerId: string; remnawaveUuid: string | null; subscriptionIndex: number; tariffId: string | null; giftStatus: string | null; giftedToClientId: string | null; createdAt: string; updatedAt: string };
type GiftCode = { id: string; code: string; status: string; expiresAt: string; createdAt: string; redeemedAt: string | null; giftMessage: string | null; subscriptionId: string };

export function StealthGifts() {
  const { state, refreshProfile } = useClientAuth();
  const config = useCabinetConfig();
  const token = state.token ?? null;
  const client = state.client;
  const currency = (client?.preferredCurrency ?? "usd").toLowerCase();

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [codes, setCodes] = useState<GiftCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [buyDialogOpen, setBuyDialogOpen] = useState(false);
  const [tariffs, setTariffs] = useState<PublicTariff[]>([]);
  const [buyLoading, setBuyLoading] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [pickerTariff, setPickerTariff] = useState<PublicTariff | null>(null);
  const [pickerOptionId, setPickerOptionId] = useState<string | null>(null);
  const [pickerExtras, setPickerExtras] = useState<number>(0);

  const [redeemCode, setRedeemCode] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState<string | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [historyItems, setHistoryItems] = useState<Array<{ id: string; eventType: string; metadata: unknown; createdAt: string; subscriptionId: string | null }>>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      const [subsRes, codesRes] = await Promise.all([api.giftListSubscriptions(token), api.giftListCodes(token)]);
      setSubscriptions(subsRes.subscriptions || []);
      setCodes(codesRes.codes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки данных");
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchHistory = useCallback(async (page: number = 1) => {
    if (!token) return;
    setHistoryLoading(true);
    try {
      const res = await api.giftGetHistory(token, page, 10);
      setHistoryItems(res.items);
      setHistoryTotal(res.total);
      setHistoryPage(res.page);
    } catch { /* silent */ } finally { setHistoryLoading(false); }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchHistory(historyPage); }, [historyPage, fetchHistory]);

  const loadTariffs = async () => {
    if (tariffs.length > 0) return;
    try {
      const res = await api.getPublicTariffs();
      const flat = (res?.items ?? []).flatMap((cat: PublicTariffCategory) => cat.tariffs);
      setTariffs(flat);
    } catch { /* ignore */ }
  };

  const handleOpenBuy = () => { loadTariffs(); setBuyError(null); setBuyDialogOpen(true); };

  const openPicker = (t: PublicTariff) => {
    setPickerTariff(t);
    const opts = [...(t.priceOptions ?? [])].sort((a, b) => a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.durationDays - b.durationDays);
    setPickerOptionId(opts[0]?.id ?? null);
    setPickerExtras(0);
    setBuyError(null);
  };
  const closePicker = () => { setPickerTariff(null); setPickerOptionId(null); setPickerExtras(0); };

  const handleBuy = async () => {
    if (!token || !pickerTariff) return;
    setBuyLoading(true);
    setBuyError(null);
    try {
      await api.giftBuySubscription(token, { tariffId: pickerTariff.id, tariffPriceOptionId: pickerOptionId ?? undefined, extraDevices: pickerExtras });
      await fetchData();
      fetchHistory(1);
      refreshProfile().catch(() => {});
      closePicker();
      setBuyDialogOpen(false);
    } catch (err) {
      setBuyError(err instanceof Error ? err.message : "Ошибка покупки");
    } finally { setBuyLoading(false); }
  };

  const giftExtrasPrice = (pricePerExtra: number, extras: number, tiers: { minExtraDevices: number; discountPercent: number }[] | undefined, durationDays: number): number => {
    const safe = Math.max(0, Math.floor(extras));
    if (safe === 0 || pricePerExtra <= 0) return 0;
    const sorted = [...(tiers ?? [])].sort((a, b) => b.minExtraDevices - a.minExtraDevices);
    const tier = sorted.find((t) => safe >= t.minExtraDevices);
    const pct = tier?.discountPercent ?? 0;
    const monthly = pricePerExtra * safe * (100 - pct) / 100;
    return Math.round(monthly * (Math.max(1, durationDays) / 30) * 100) / 100;
  };

  const handleCreateCode = async (subscriptionId: string) => {
    if (!token) return;
    setActionLoading(`create-${subscriptionId}`);
    try { await api.giftCreateCode(token, subscriptionId); await fetchData(); fetchHistory(1); }
    catch (err) { toast.error("Ошибка", err instanceof Error ? err.message : "Не удалось создать код"); }
    finally { setActionLoading(null); }
  };

  const handleCancelCode = async (codeId: string) => {
    if (!token) return;
    if (!window.confirm("Точно отменить этот подарочный код?")) return;
    setActionLoading(`cancel-${codeId}`);
    try { await api.giftCancelCode(token, codeId); await fetchData(); fetchHistory(1); }
    catch (err) { toast.error("Ошибка", err instanceof Error ? err.message : "Не удалось отменить код"); }
    finally { setActionLoading(null); }
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !redeemCode.trim()) return;
    setRedeemLoading(true); setRedeemError(null); setRedeemSuccess(null);
    try {
      await api.giftRedeemCode(token, redeemCode.trim());
      setRedeemSuccess("Код успешно активирован!");
      setRedeemCode("");
      await fetchData(); fetchHistory(1); refreshProfile().catch(() => {});
    } catch (err) { setRedeemError(err instanceof Error ? err.message : "Ошибка активации"); }
    finally { setRedeemLoading(false); }
  };

  const handleGetUrl = async (subscription: { id: string; giftStatus: string | null }) => {
    const subscriptionId = subscription.id;
    setActionLoading(`url-${subscriptionId}`);
    try {
      const activeCode = codes.find((c) => c.subscriptionId === subscriptionId && c.status === "ACTIVE");
      if (!activeCode) {
        if (subscription.giftStatus === "GIFTED") toast.error("Недоступно", "Эта подписка уже подарена.");
        else toast.info("Нужен код", "Сначала создайте подарочный код кнопкой «Подарить».");
        return;
      }
      const appUrl = config?.publicAppUrl?.replace(/\/$/, "") || (typeof window !== "undefined" ? window.location.origin : "");
      const link = `${appUrl}/gift/${activeCode.code}`;
      await navigator.clipboard.writeText(link);
      setCopiedId(`url-${subscriptionId}`);
      setTimeout(() => setCopiedId(null), 2000);
    } finally { setActionLoading(null); }
  };

  const handleActivateForSelf = async (subscriptionId: string) => {
    if (!token) return;
    setActionLoading(`activate-${subscriptionId}`);
    setActionSuccess(null);
    try {
      await api.giftActivateForSelf(token, subscriptionId);
      await fetchData(); fetchHistory(1); refreshProfile().catch(() => {});
      setActionSuccess("Подписка перенесена в «Мои подписки»! Подключите её на главной странице кабинета.");
    } catch (err) { toast.error("Ошибка активации", err instanceof Error ? err.message : "Не удалось активировать"); }
    finally { setActionLoading(null); }
  };

  const copyCode = async (code: string, id: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedId(`code-${id}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const maxSubs = config?.maxAdditionalSubscriptions ?? 5;
  const currentSubs = subscriptions.length;
  const canBuyMore = currentSubs < maxSubs;
  const giftedCount = subscriptions.filter((s) => s.giftStatus === "GIFTED").length;
  const activeCodesCount = codes.filter((c) => c.status === "ACTIVE").length;

  // Picker: derived values (только когда открыт picker).
  const pickerDerived = useMemo(() => {
    if (!pickerTariff) return null;
    const t = pickerTariff;
    const opts = [...(t.priceOptions ?? [])].sort((a, b) => a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.durationDays - b.durationDays);
    const selOpt = opts.find((o) => o.id === pickerOptionId) ?? opts[0] ?? null;
    const unit = selOpt?.price ?? t.price;
    const days = selOpt?.durationDays ?? t.durationDays;
    const included = t.includedDevices ?? 1;
    const pricePerExtra = t.pricePerExtraDevice ?? 0;
    const maxExtras = t.maxExtraDevices ?? 0;
    const extrasEnabled = pricePerExtra > 0 && maxExtras > 0;
    const tiers = t.deviceDiscountTiers ?? [];
    const extrasTotal = giftExtrasPrice(pricePerExtra, pickerExtras, tiers, days);
    const total = unit + extrasTotal;
    const totalDevices = included + pickerExtras;
    let bestDurationId: string | null = null;
    if (opts.length > 1) {
      let bestRatio = Infinity;
      for (const o of opts) { if (o.durationDays <= 0) continue; const ratio = o.price / o.durationDays; if (ratio < bestRatio) { bestRatio = ratio; bestDurationId = o.id; } }
    }
    return { t, opts, selOpt, unit, days, included, pricePerExtra, maxExtras, extrasEnabled, tiers, extrasTotal, total, totalDevices, bestDurationId };
  }, [pickerTariff, pickerOptionId, pickerExtras]);

  if (loading && subscriptions.length === 0 && codes.length === 0) {
    return (
      <div className="px-4 pt-10 flex flex-col items-center justify-center gap-3">
        <Loader2 className="h-7 w-7 animate-spin text-saccent-400" />
        <p className="text-xs text-zinc-500">Загрузка…</p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-2 space-y-5 pb-2">
      {actionSuccess && (
        <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/25 px-4 py-3 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-xs font-medium text-emerald-300 leading-relaxed flex-1">{actionSuccess}</p>
          <button onClick={() => setActionSuccess(null)} className="text-emerald-400/60 hover:text-emerald-400 shrink-0"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-zinc-950/50 backdrop-blur-2xl p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
      >
        {/* T-fix-glow-overflow-v2 (2026-08-13): свечение раньше делалось через
            filter: blur() на отдельном div — blur() ненадёжно обрезается
            overflow-hidden в мобильных WebView (в т.ч. Telegram), из-за чего
            красное пятно вылезало за край карточки/экрана на телефонах.
            radial-gradient — обычный фон, всегда подчиняется border-radius
            и границам своего блока, без этого бага. */}
        <div
          className="pointer-events-none absolute inset-0 rounded-3xl"
          style={{
            background:
              "radial-gradient(160px 160px at calc(100% + 20px) -20px, rgb(var(--stealth-accent) / 0.18), transparent 70%)",
          }}
        />
        <div className="relative flex items-center gap-2.5 mb-1.5">
          <div className="p-1.5 rounded-lg bg-saccent-500/15 shrink-0"><Gift className="h-4 w-4 text-saccent-400" /></div>
          <h1 className="text-lg font-bold tracking-tight">Подарки</h1>
        </div>
        <p className="relative text-[13px] text-zinc-400 leading-relaxed mb-4">
          Покупайте подписки для друзей или активируйте вторую подписку себе.
        </p>
        {error && <div className="relative mb-3 rounded-xl bg-saccent-500/10 border border-saccent-500/30 px-3 py-2 text-xs text-saccent-300">{error}</div>}
        <div className="relative flex items-center gap-2.5">
          <StadiumButton variant="primary" size="md" fullWidth={false} onClick={handleOpenBuy} disabled={!canBuyMore} iconLeft={<Plus className="h-4 w-4" />} className="flex-1">
            Купить подписку
          </StadiumButton>
          <div className="shrink-0 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 text-[11px] text-zinc-400 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5 opacity-70" />
            <span>{currentSubs}/{maxSubs}</span>
          </div>
        </div>
      </motion.div>

      {/* Redeem code */}
      <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/40 backdrop-blur-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Gift className="h-4 w-4 text-saccent-400" />
          <span className="text-sm font-bold">Активировать код</span>
        </div>
        <form onSubmit={handleRedeem} className="flex items-center gap-2">
          <input
            value={redeemCode}
            onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
            placeholder="CODE-XXXX-XXXX"
            className="flex-1 min-w-0 rounded-xl bg-white/[0.03] border border-white/[0.08] px-3 py-2.5 text-center font-mono text-sm tracking-widest placeholder-zinc-600 outline-none focus:border-saccent-500/35 uppercase"
          />
          <button
            type="submit"
            disabled={redeemLoading || !redeemCode.trim()}
            className="shrink-0 rounded-xl bg-saccent-500 hover:bg-saccent-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50 transition"
          >
            {redeemLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Активировать"}
          </button>
        </form>
        {redeemError && <div className="mt-2 rounded-xl bg-saccent-500/10 text-saccent-300 text-xs font-medium text-center py-2">{redeemError}</div>}
        {redeemSuccess && (
          <div className="mt-2 rounded-xl bg-emerald-500/10 text-emerald-400 text-xs font-medium text-center py-2 flex items-center justify-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> {redeemSuccess}
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: "Всего", value: subscriptions.length, icon: Package, color: "text-sky-400" },
          { label: "Подарено", value: giftedCount, icon: Send, color: "text-violet-400" },
          { label: "Коды", value: activeCodesCount, icon: CheckCircle2, color: "text-emerald-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-white/[0.06] bg-zinc-950/40 p-3 flex flex-col items-center text-center gap-1">
            <s.icon className={cn("h-4 w-4", s.color)} />
            <span className="text-base font-bold tabular-nums">{s.value}</span>
            <span className="text-[10px] text-zinc-500">{s.label}</span>
          </div>
        ))}
      </div>

      {/* My gifts (subscriptions) */}
      <div className="space-y-3">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-zinc-400 px-1">Мои подарки</h2>
        {subscriptions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.1] bg-zinc-950/30 p-6 text-center space-y-3">
            <Package className="w-7 h-7 text-zinc-600 mx-auto" />
            <p className="text-xs text-zinc-500">У вас пока нет подарков.</p>
            {canBuyMore && (
              <StadiumButton variant="outline" size="sm" fullWidth={false} onClick={handleOpenBuy} iconLeft={<Plus className="w-4 h-4" />}>Приобрести</StadiumButton>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {subscriptions.map((sub, i) => {
                const isGifted = sub.giftStatus === "GIFTED";
                const isActivatedSelf = sub.giftStatus === "ACTIVATED_SELF";
                const isReserved = sub.giftStatus === "GIFT_RESERVED";
                const activeCode = codes.find((c) => c.subscriptionId === sub.id && c.status === "ACTIVE");
                const isFinalized = isGifted || isActivatedSelf;
                const badge = isGifted ? { t: "Получена в подарок", c: "bg-violet-500/15 text-violet-400 border-violet-500/25" }
                  : isActivatedSelf ? { t: "Для себя", c: "bg-sky-500/15 text-sky-400 border-sky-500/25" }
                  : isReserved ? { t: "Код создан", c: "bg-amber-500/15 text-amber-400 border-amber-500/25" }
                  : { t: "Доступна", c: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" };
                return (
                  <motion.div key={sub.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ delay: i * 0.04 }}
                    className="rounded-2xl border border-white/[0.06] bg-zinc-950/40 backdrop-blur-xl p-4 space-y-3">
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold">Подписка #{sub.subscriptionIndex}</h3>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          {isGifted ? "Подарена вам." : isActivatedSelf ? "Активирована вами." : isReserved ? "Для неё создан код." : "Доступна для подарка или активации."}
                        </p>
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold border", badge.c)}>{badge.t}</span>
                    </div>

                    {!isFinalized && activeCode && (
                      <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-2.5 flex items-center justify-between gap-2">
                        <code className="text-sm font-mono font-bold tracking-wider">{activeCode.code}</code>
                        <button onClick={() => copyCode(activeCode.code, activeCode.id)} className="h-7 w-7 rounded-lg hover:bg-white/[0.06] flex items-center justify-center shrink-0">
                          {copiedId === `code-${activeCode.id}` ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-zinc-400" />}
                        </button>
                      </div>
                    )}

                    {isFinalized ? (
                      <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2.5 flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-semibold text-emerald-300">Активирована</span>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => handleCreateCode(sub.id)} disabled={isReserved || actionLoading === `create-${sub.id}`}
                          className="rounded-xl bg-saccent-500 hover:bg-saccent-600 disabled:opacity-50 text-white text-xs font-bold py-2.5 flex items-center justify-center gap-1.5">
                          {actionLoading === `create-${sub.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gift className="w-3.5 h-3.5" />} Подарить
                        </button>
                        <button onClick={() => handleGetUrl(sub)} disabled={!activeCode || actionLoading === `url-${sub.id}`}
                          className="rounded-xl bg-white/[0.04] border border-white/[0.08] disabled:opacity-40 text-xs font-bold py-2.5 flex items-center justify-center gap-1.5">
                          {actionLoading === `url-${sub.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : copiedId === `url-${sub.id}` ? <Check className="w-3.5 h-3.5" /> : <LinkIcon className="w-3.5 h-3.5" />} Ссылка
                        </button>
                        <button onClick={() => handleActivateForSelf(sub.id)} disabled={actionLoading === `activate-${sub.id}`}
                          className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 disabled:opacity-40 text-xs font-bold py-2.5 flex items-center justify-center gap-1.5">
                          {actionLoading === `activate-${sub.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Себе
                        </button>
                        <button onClick={() => activeCode && handleCancelCode(activeCode.id)} disabled={!activeCode || actionLoading === `cancel-${activeCode?.id}`}
                          className="rounded-xl bg-saccent-500/10 border border-saccent-500/20 text-saccent-400 disabled:opacity-40 text-xs font-bold py-2.5 flex items-center justify-center gap-1.5">
                          {activeCode && actionLoading === `cancel-${activeCode.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />} Отменить
                        </button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Gift codes */}
      {codes.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-zinc-400 px-1">Все коды</h2>
          <div className="space-y-2.5">
            <AnimatePresence mode="popLayout">
              {codes.map((c, i) => {
                const isActive = c.status === "ACTIVE";
                const isRedeemed = c.status === "REDEEMED";
                return (
                  <motion.div key={c.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ delay: i * 0.04 }}
                    className={cn("rounded-2xl border border-white/[0.06] bg-zinc-950/40 backdrop-blur-xl p-3.5 space-y-2.5", !isActive && "opacity-60")}>
                    <div className="flex justify-between items-center">
                      <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase", isActive ? "bg-emerald-500/15 text-emerald-400" : isRedeemed ? "bg-sky-500/15 text-sky-400" : "bg-white/[0.06] text-zinc-500")}>
                        {isActive ? "Активен" : isRedeemed ? "Активирован" : "Отменён"}
                      </span>
                      <span className="text-[10px] text-zinc-500 flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(c.createdAt).toLocaleDateString("ru-RU")}</span>
                    </div>
                    <div className="flex items-center justify-center py-2.5 bg-white/[0.02] rounded-xl border border-white/[0.05]">
                      <code className="text-sm font-mono font-bold tracking-widest">{c.code}</code>
                    </div>
                    {isActive && (
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => copyCode(c.code, c.id)} className="rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-bold py-2 flex items-center justify-center gap-1.5">
                          {copiedId === `code-${c.id}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Копировать
                        </button>
                        <button onClick={() => handleCancelCode(c.id)} disabled={actionLoading === `cancel-${c.id}`}
                          className="rounded-xl bg-saccent-500/10 border border-saccent-500/20 text-saccent-400 disabled:opacity-40 text-xs font-bold py-2 flex items-center justify-center gap-1.5">
                          {actionLoading === `cancel-${c.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />} Отменить
                        </button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* History */}
      <div className="rounded-2xl border border-white/[0.06] bg-zinc-950/40 backdrop-blur-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2"><History className="h-4 w-4 text-saccent-400" /><span className="text-sm font-bold">История</span></div>
          {historyTotal > 4 && (
            <button onClick={() => setShowFullHistory(!showFullHistory)} className="text-[11px] font-bold text-saccent-400 flex items-center gap-1">
              {showFullHistory ? "Скрыть" : "Все"} {showFullHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
        {historyLoading && historyItems.length === 0 ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-zinc-500" /></div>
        ) : historyItems.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-4">История пуста</p>
        ) : (
          <>
            <div className="space-y-2">
              <AnimatePresence mode="popLayout">
                {historyItems.slice(0, showFullHistory ? undefined : 4).map((item, i) => {
                  const ev = HISTORY_EVENT_MAP[item.eventType] ?? { icon: <Clock className="w-4 h-4" />, label: item.eventType, color: "text-zinc-400 bg-white/[0.04] border-white/10" };
                  const meta = item.metadata as Record<string, string> | null;
                  return (
                    <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25, delay: i * 0.03 }}
                      className="flex gap-2.5 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                      <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border", ev.color)}>{ev.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold truncate">{ev.label}</span>
                          <span className="text-[10px] text-zinc-500 shrink-0">{formatTimeAgo(item.createdAt)}</span>
                        </div>
                        {meta && Object.keys(meta).length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5 text-[10px]">
                            {meta.code && <span className="font-mono bg-saccent-500/10 text-saccent-400 px-1.5 py-0.5 rounded-md">{meta.code}</span>}
                            {meta.tariffName && <span className="flex items-center gap-1 bg-white/[0.05] text-zinc-400 px-1.5 py-0.5 rounded-md"><Package className="w-2.5 h-2.5" />{meta.tariffName}</span>}
                            {meta.recipientUsername && <span className="flex items-center gap-1 bg-sky-500/10 text-sky-400 px-1.5 py-0.5 rounded-md"><User className="w-2.5 h-2.5" />→@{meta.recipientUsername}</span>}
                            {meta.senderUsername && <span className="flex items-center gap-1 bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded-md"><User className="w-2.5 h-2.5" />от@{meta.senderUsername}</span>}
                          </div>
                        )}
                        {meta?.giftMessage && <p className="mt-1.5 text-[11px] text-zinc-500 italic border-l-2 border-saccent-500/30 pl-2">"{meta.giftMessage}"</p>}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
            {showFullHistory && historyTotal > 10 && (
              <div className="flex items-center justify-center gap-2.5 pt-2">
                <button disabled={historyPage <= 1 || historyLoading} onClick={() => setHistoryPage((p) => p - 1)} className="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] disabled:opacity-40">← Назад</button>
                <span className="text-[10px] text-zinc-500">{historyPage} / {Math.ceil(historyTotal / 10)}</span>
                <button disabled={historyPage >= Math.ceil(historyTotal / 10) || historyLoading} onClick={() => setHistoryPage((p) => p + 1)} className="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[11px] disabled:opacity-40">Вперёд →</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Buy modal: tariff list */}
      <StealthModal open={buyDialogOpen} onClose={() => setBuyDialogOpen(false)} title="Купить в подарок">
        <div className="space-y-3">
          <p className="text-xs text-zinc-500">Выберите тариф — оплата спишется с вашего баланса.</p>
          {buyError && <div className="rounded-xl bg-saccent-500/10 border border-saccent-500/30 p-2.5 text-xs text-saccent-300 text-center">{buyError}</div>}
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {tariffs.length === 0 ? (
              <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
            ) : tariffs.map((t) => {
              const hasExtras = (t.pricePerExtraDevice ?? 0) > 0 && (t.maxExtraDevices ?? 0) > 0;
              const opts = t.priceOptions ?? [];
              const showFromPrefix = opts.length > 1 || hasExtras;
              const minOptPrice = opts.length > 0 ? Math.min(...opts.map((o) => o.price)) : t.price;
              const insufficient = (client?.balance ?? 0) < minOptPrice;
              return (
                <div key={t.id} className="rounded-2xl border border-white/[0.07] bg-zinc-900/40 p-3.5">
                  <div className="font-bold text-sm mb-0.5">{t.name}</div>
                  <div className="font-bold text-saccent-400 text-base mb-2 tabular-nums">{showFromPrefix ? "от " : ""}{fmtPrice(minOptPrice, currency)}</div>
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500 mb-3">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {t.durationDays} дн.</span>
                    {hasExtras && <span>+ доп. устр.</span>}
                  </div>
                  <button onClick={() => openPicker(t)} disabled={buyLoading || insufficient}
                    className="w-full rounded-xl bg-saccent-500 hover:bg-saccent-600 disabled:opacity-50 text-white text-xs font-bold py-2.5">
                    {insufficient ? "Недостаточно средств" : "Выбрать"}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between px-1 pt-1 text-xs">
            <span className="text-zinc-500">Ваш баланс:</span>
            <span className="font-bold">{fmtPrice(client?.balance ?? 0, currency)}</span>
          </div>
        </div>
      </StealthModal>

      {/* Picker modal: duration + extras */}
      <StealthModal open={!!pickerTariff} onClose={() => { if (!buyLoading) closePicker(); }} title={pickerDerived?.t.name ?? "Тариф"}>
        {pickerDerived && (() => {
          const { opts, selOpt, unit, days, included, pricePerExtra, maxExtras, extrasEnabled, tiers, extrasTotal, total, totalDevices, bestDurationId } = pickerDerived;
          const tiles = Array.from({ length: maxExtras + 1 }, (_, i) => {
            const extras = i;
            const xtra = giftExtrasPrice(pricePerExtra, extras, tiers, days);
            return { extras, total: unit + xtra, totalDevices: included + extras };
          });
          const bestExtra = tiles.slice(1).reduce((best, cur) => {
            const perDev = cur.totalDevices > 0 ? cur.total / cur.totalDevices : Infinity;
            if (best == null || perDev < best.perDev) return { extras: cur.extras, perDev };
            return best;
          }, null as { extras: number; perDev: number } | null);
          const baseExtrasNoDiscount = pricePerExtra * pickerExtras * (Math.max(1, days) / 30);
          const savedAmount = baseExtrasNoDiscount - extrasTotal;

          return (
            <div className="space-y-4">
              {opts.length > 0 && (
                <section>
                  <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-2 flex items-center gap-1"><Calendar className="h-3 w-3" /> Длительность</p>
                  <div className={cn("grid gap-2", opts.length === 1 ? "grid-cols-1" : opts.length === 2 ? "grid-cols-2" : "grid-cols-3")}>
                    {opts.map((opt) => {
                      const isActive = (selOpt?.id ?? opts[0]?.id) === opt.id;
                      const isBest = opt.id === bestDurationId;
                      const perDay = opt.durationDays > 0 ? opt.price / opt.durationDays : 0;
                      return (
                        <button key={opt.id} type="button" onClick={() => setPickerOptionId(opt.id)}
                          className={cn("relative rounded-xl border p-2.5 text-center transition-all", isActive ? "border-saccent-500/50 bg-saccent-500/10" : "border-white/[0.08] bg-zinc-900/40 hover:border-white/20")}>
                          {isBest && <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-[9px] font-black">★</span>}
                          <p className={cn("text-xs font-bold", isActive && "text-saccent-400")}>{opt.durationDays} дн</p>
                          <p className="text-[10px] text-zinc-500 mt-0.5 tabular-nums">{fmtPrice(Math.round(perDay * 100) / 100, currency)}/д</p>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {extrasEnabled && (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">📱 Доп. устройства</p>
                    <span className="text-[10px] text-zinc-500">В тарифе: <strong className="text-zinc-300">{included}</strong></span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {tiles.map((tile) => {
                      const sortedTiers = [...tiers].sort((a, b) => b.minExtraDevices - a.minExtraDevices);
                      const tier = tile.extras > 0 ? sortedTiers.find((tr) => tile.extras >= tr.minExtraDevices) : undefined;
                      const pct = tier?.discountPercent ?? 0;
                      const isActive = tile.extras === pickerExtras;
                      const isBest = bestExtra?.extras === tile.extras && tile.extras > 0 && pct === 0;
                      return (
                        <motion.button key={tile.extras} type="button" onClick={() => setPickerExtras(tile.extras)} whileTap={{ scale: 0.96 }}
                          className={cn("relative rounded-xl border p-2 transition-all",
                            isActive ? "border-saccent-500/50 bg-saccent-500/10" : pct > 0 ? "border-emerald-500/25 bg-emerald-500/[0.06]" : "border-white/[0.08] bg-zinc-900/40")}>
                          {pct > 0 && <div className={cn("absolute -top-1 -right-1 px-1 py-0.5 rounded text-[8px] font-black text-white", isActive ? "bg-saccent-500" : "bg-emerald-500")}>−{pct}%</div>}
                          {isBest && <Sparkles className="absolute top-1 right-1 h-2.5 w-2.5 text-saccent-400" />}
                          <div className="flex items-center justify-center gap-1"><Smartphone className={cn("h-3 w-3", isActive && "text-saccent-400")} /><span className={cn("text-[11px] font-bold", isActive && "text-saccent-400")}>{tile.extras === 0 ? "0" : `+${tile.extras}`}</span></div>
                          <p className="text-[9px] font-bold text-zinc-300 tabular-nums text-center mt-0.5">{fmtPrice(tile.total, currency)}</p>
                        </motion.button>
                      );
                    })}
                  </div>
                </section>
              )}

              <section className="rounded-2xl border border-saccent-500/25 bg-saccent-500/[0.06] p-3.5">
                <div className="flex items-baseline justify-between mb-1"><span className="text-xs text-zinc-500">Длительность</span><span className="text-xs font-medium">{days} дн</span></div>
                <div className="flex items-baseline justify-between mb-1"><span className="text-xs text-zinc-500">Тариф ({included} устр)</span><span className="text-xs font-medium">{fmtPrice(unit, currency)}</span></div>
                {extrasEnabled && pickerExtras > 0 && (
                  <div className="flex items-baseline justify-between mb-1"><span className="text-xs text-zinc-500">+{pickerExtras} устр (всего {totalDevices})</span><span className="text-xs font-medium">{fmtPrice(pricePerExtra * (Math.max(1, days) / 30), currency)} × {pickerExtras}</span></div>
                )}
                {savedAmount > 0 && (
                  <div className="flex items-baseline justify-between mb-1 text-emerald-400"><span className="text-xs flex items-center gap-1"><Sparkles className="h-3 w-3" /> Скидка</span><span className="text-xs font-bold">−{fmtPrice(savedAmount, currency)}</span></div>
                )}
                <div className="border-t border-saccent-500/20 mt-2 pt-2 flex items-baseline justify-between">
                  <span className="text-xs font-medium">К оплате</span>
                  <span className="text-xl font-black text-saccent-400 tabular-nums">{fmtPrice(total, currency)}</span>
                </div>
              </section>

              {buyError && <div className="rounded-xl bg-saccent-500/10 text-saccent-300 text-xs text-center font-medium py-2">{buyError}</div>}

              <div className="flex gap-2">
                <button type="button" onClick={closePicker} className="flex-1 rounded-xl border border-white/[0.1] py-2.5 text-xs font-bold text-zinc-300">Отмена</button>
                <StadiumButton variant="primary" size="sm" onClick={handleBuy} disabled={buyLoading || (client?.balance ?? 0) < total} className="flex-[2]"
                  iconLeft={buyLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gift className="w-3.5 h-3.5" />}>
                  {(client?.balance ?? 0) < total ? "Недостаточно средств" : `Купить за ${fmtPrice(total, currency)}`}
                </StadiumButton>
              </div>
            </div>
          );
        })()}
      </StealthModal>
    </div>
  );
}
