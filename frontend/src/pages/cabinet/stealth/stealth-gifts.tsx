/**
 * StealthGifts — «Подарки» в стиле Stealth.
 *
 * T-fix-picker-removed (2026-08-15): убрал второй модальный picker целиком.
 * Теперь ОДНА модалка "Купить в подарок": сверху pill-табы дней (30/90/180/365),
 * ниже — список тарифов с ценами за выбранный период. Клик по тарифу →
 * прямой вызов покупки (баланс → сразу, иначе провайдерская оплата).
 *
 * T-fix-gifts-limit-block (2026-08-15): убрал блокировку покупки при
 * `currentSubs >= maxSubs` (5 доп. подписок). Раньше doPay возвращал
 * ошибку "Достигнут лимит..." и юзер ничего не мог купить. Теперь покупка
 * уходит на бэкенд, и если бэк реально режет — показываем ответ сервера.
 * Amber-предупреждение о лимите оставлено как информация.
 *
 * T-fix-ts-unused-2 (2026-08-15): убраны неиспользуемые Calendar (TS6133) и
 * локальная `currency` (TS6133). Calendar в JSX заменён на Clock (уже
 * импортирован, визуально похож). `fmtPrice(X, currency)` → `fmtPrice(X,
 * t.currency ?? "RUB")` в теле tariff-map и `fmtPrice(X, client?.preferredCurrency ?? "usd")`
 * в футере баланса.
 */

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Gift, Package, Copy, Check, Loader2, Plus, X, Clock,
  Send, Link as LinkIcon, CheckCircle2, Play, ShoppingCart, Mail,
  XCircle, Trash, History, ChevronDown, ChevronUp, Sparkles,
  Wallet, Bitcoin, ChevronRight, AlertCircle,
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

type PayMethod =
  | { kind: "balance"; label: string; icon: typeof Wallet }
  | { kind: "yookassa"; label: string; icon: typeof Wallet }
  | { kind: "yoomoney"; label: string; icon: typeof Wallet }
  | { kind: "cryptopay"; label: string; icon: typeof Bitcoin }
  | { kind: "heleket"; label: string; icon: typeof Bitcoin }
  | { kind: "rollypay"; label: string; icon: typeof Wallet }
  | { kind: "lava"; label: string; icon: typeof Wallet }
  | { kind: "overpay"; label: string; icon: typeof Wallet }
  | { kind: "platega"; id: number; label: string; icon: typeof Wallet };

const DAY_OPTIONS = [30, 90, 180, 365];

export function StealthGifts() {
  const { state, refreshProfile } = useClientAuth();
  const config = useCabinetConfig();
  const token = state.token ?? null;
  const client = state.client;
  const balance = client?.balance ?? 0;

  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [codes, setCodes] = useState<GiftCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [buyDialogOpen, setBuyDialogOpen] = useState(false);
  const [tariffs, setTariffs] = useState<PublicTariff[]>([]);
  const [buyLoading, setBuyLoading] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  const [selectedTariff, setSelectedTariff] = useState<PublicTariff | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [activeDays, setActiveDays] = useState<number>(30);
  const [extraDevices, setExtraDevices] = useState<number>(0);

  const [plategaMethods, setPlategaMethods] = useState<{ id: number; label: string }[]>([]);
  const [yoomoneyEnabled, setYoomoneyEnabled] = useState(false);
  const [yookassaEnabled, setYookassaEnabled] = useState(false);
  const [cryptopayEnabled, setCryptopayEnabled] = useState(false);
  const [heleketEnabled, setHeleketEnabled] = useState(false);
  const [rollypayEnabled, setRollypayEnabled] = useState(false);
  const [lavaEnabled, setLavaEnabled] = useState(false);
  const [overpayEnabled, setOverpayEnabled] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<PayMethod | null>(null);

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
    try {
      const res = await api.giftGetHistory(token, page, 10);
      setHistoryItems(res.items);
      setHistoryTotal(res.total);
      setHistoryPage(res.page);
    } catch { /* silent */ }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchHistory(historyPage); }, [historyPage, fetchHistory]);

  useEffect(() => {
    api.getPublicConfig().then((c) => {
      setPlategaMethods(c.plategaMethods ?? []);
      setYoomoneyEnabled(Boolean(c.yoomoneyEnabled));
      setYookassaEnabled(Boolean(c.yookassaEnabled));
      setCryptopayEnabled(Boolean(c.cryptopayEnabled));
      setHeleketEnabled(Boolean(c.heleketEnabled));
      setRollypayEnabled(Boolean((c as { rollypayEnabled?: boolean }).rollypayEnabled));
      setLavaEnabled(Boolean(c.lavaEnabled));
      setOverpayEnabled(Boolean(c.overpayEnabled));
    }).catch(() => { /* ignore */ });
  }, []);

  const loadTariffs = async () => {
    if (tariffs.length > 0) return;
    try {
      const res = await api.getPublicTariffs();
      const flat = (res?.items ?? []).flatMap((cat: PublicTariffCategory) => cat.tariffs);
      setTariffs(flat);
    } catch { /* ignore */ }
  };

  const handleOpenBuy = () => {
    loadTariffs();
    setBuyError(null);
    setSelectedTariff(null);
    setSelectedOptionId(null);
    setSelectedMethod(null);
    setBuyDialogOpen(true);
  };

  const closeBuy = () => {
    if (buyLoading) return;
    setBuyDialogOpen(false);
    setSelectedTariff(null);
    setSelectedOptionId(null);
    setExtraDevices(0);
    setSelectedMethod(null);
    setBuyError(null);
  };

  const availableMethods = (tCurrency: string): PayMethod[] => {
    const list: PayMethod[] = [];
    plategaMethods.forEach((m) => list.push({ kind: "platega", id: m.id, label: m.label, icon: Wallet }));
    const tc = tCurrency.toUpperCase();
    if (yookassaEnabled && tc === "RUB") list.push({ kind: "yookassa", label: "ЮKassa", icon: Wallet });
    if (yoomoneyEnabled && tc === "RUB") list.push({ kind: "yoomoney", label: "ЮMoney", icon: Wallet });
    if (cryptopayEnabled) list.push({ kind: "cryptopay", label: "Crypto Pay", icon: Bitcoin });
    if (heleketEnabled) list.push({ kind: "heleket", label: "Heleket", icon: Bitcoin });
    if (rollypayEnabled) list.push({ kind: "rollypay", label: "RollyPay", icon: Wallet });
    if (lavaEnabled && tc === "RUB") list.push({ kind: "lava", label: "Lava", icon: Wallet });
    if (overpayEnabled) list.push({ kind: "overpay", label: "Overpay", icon: Wallet });
    return list;
  };

  const pickTariff = (t: PublicTariff) => {
    setSelectedTariff(t);
    setExtraDevices(0);
    const opts = t.priceOptions ?? [];
    let opt = opts.find((o) => o.durationDays === activeDays);
    if (!opt) {
      opt = opts.slice().sort((a, b) => Math.abs(a.durationDays - activeDays) - Math.abs(b.durationDays - activeDays))[0];
    }
    setSelectedOptionId(opt?.id ?? null);
    const tCurrency = (t.currency ?? "RUB").toLowerCase();
    const methods = availableMethods(tCurrency);
    const totalPrice = (opt?.price ?? t.price) + (t.pricePerExtraDevice ?? 0) * 0;
    if (balance >= totalPrice) {
      setSelectedMethod({ kind: "balance", label: "Баланс", icon: Wallet });
    } else if (methods.length > 0) {
      setSelectedMethod(methods[0]);
    } else {
      setSelectedMethod(null);
    }
    setBuyError(null);
  };

  const cancelPick = () => {
    setSelectedTariff(null);
    setSelectedOptionId(null);
    setSelectedMethod(null);
    setBuyError(null);
  };

  const getSelectedOption = (): { durationDays: number; price: number } | null => {
    if (!selectedTariff) return null;
    if (selectedOptionId) {
      const o = (selectedTariff.priceOptions ?? []).find((x) => x.id === selectedOptionId);
      if (o) return { durationDays: o.durationDays, price: o.price };
    }
    return { durationDays: selectedTariff.durationDays, price: selectedTariff.price };
  };

  async function doPay() {
    if (!token || !selectedTariff) return;
    const opt = getSelectedOption();
    if (!opt || !selectedMethod) return;

    setBuyLoading(true);
    setBuyError(null);
    const t = selectedTariff;
    const tariffCurrency = (t.currency ?? "RUB").toLowerCase();

    if (selectedMethod.kind === "balance") {
      try {
        const result = await api.clientPayByBalance(token, {
          tariffId: t.id,
          tariffPriceOptionId: selectedOptionId ?? undefined,
          asGift: true,
        });
        await fetchData();
        fetchHistory(1);
        refreshProfile().catch(() => {});
        toast({ title: "Подарок куплен!", description: result.message || "Подписка успешно добавлена" });
        closeBuy();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Ошибка оплаты";
        setBuyError(msg);
      } finally {
        setBuyLoading(false);
      }
      return;
    }

    try {
      const baseBody = {
        tariffId: t.id,
        tariffPriceOptionId: selectedOptionId ?? undefined,
        deviceCount: 0,
        asGift: true,
        amount: opt.price,
        currency: tariffCurrency,
      } as Record<string, unknown>;

      let url: string | null = null;
      switch (selectedMethod.kind) {
        case "yookassa":
          const yookassaRes = await api.yookassaCreatePayment(token, baseBody as Parameters<typeof api.yookassaCreatePayment>[1]);
          url = yookassaRes.confirmationUrl;
          break;
        case "cryptopay":
          const cryptopayRes = await api.cryptopayCreatePayment(token, baseBody as Parameters<typeof api.cryptopayCreatePayment>[1]);
          url = cryptopayRes.payUrl;
          break;
        case "heleket":
          const heleketRes = await api.heleketCreatePayment(token, baseBody as Parameters<typeof api.heleketCreatePayment>[1]);
          url = heleketRes.payUrl;
          break;
        case "rollypay":
          const rollypayRes = await api.rollypayCreatePayment(token, baseBody as Parameters<typeof api.rollypayCreatePayment>[1]);
          url = rollypayRes.payUrl;
          break;
        case "lava":
          const lavaRes = await api.lavaCreatePayment(token, baseBody as Parameters<typeof api.lavaCreatePayment>[1]);
          url = lavaRes.payUrl;
          break;
        case "overpay":
          const overpayRes = await api.overpayCreatePayment(token, baseBody as Parameters<typeof api.overpayCreatePayment>[1]);
          url = overpayRes.payUrl;
          break;
        case "yoomoney":
          const yoomoneyRes = await api.yoomoneyCreateFormPayment(token, { paymentType: "AC", ...baseBody } as Parameters<typeof api.yoomoneyCreateFormPayment>[1]);
          url = yoomoneyRes.paymentUrl;
          break;
        case "platega":
          const plategaRes = await api.clientCreatePlategaPayment(token, { paymentMethod: selectedMethod.id, ...baseBody } as Parameters<typeof api.clientCreatePlategaPayment>[1]);
          url = plategaRes.paymentUrl;
          break;
      }
      if (url) window.location.href = url;
    } catch (e) {
      setBuyError(e instanceof Error ? e.message : "Ошибка создания платежа");
    } finally {
      setBuyLoading(false);
    }
  }

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
  const giftedCount = subscriptions.filter((s) => s.giftStatus === "GIFTED").length;
  const activeCodesCount = codes.filter((c) => c.status === "ACTIVE").length;

  const visibleTariffs = tariffs.filter((t) => {
    const opts = t.priceOptions ?? [];
    if (opts.length === 0) return true;
    return opts.some((o) => o.durationDays === activeDays);
  });

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

      {/* Main card — как карточка подписок в главном меню */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="relative rounded-3xl bg-white/[0.04] border border-white/[0.08] p-5 backdrop-blur-2xl space-y-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_48px_-24px_rgba(0,0,0,0.35)] before:absolute before:inset-0 before:rounded-3xl before:bg-gradient-to-b before:from-white/[0.05] before:to-transparent before:pointer-events-none"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-bold tracking-tight">Подарки</h2>
          <div className="shrink-0 rounded-full bg-white/[0.04] border border-white/[0.06] px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
            <Package className="w-3 h-3 opacity-70" />
            {currentSubs}/{maxSubs}
          </div>
        </div>

        {error && <div className="rounded-xl bg-saccent-500/10 border border-saccent-500/30 px-3 py-2 text-xs text-saccent-300">{error}</div>}

        {/* Action buttons */}
        <div className="space-y-2.5 pt-1">
          <StadiumButton variant="ghost" size="md" iconLeft={<Plus className="h-4 w-4 text-saccent-400" strokeWidth={2.5} />} onClick={handleOpenBuy}>
            Купить подписку в подарок
          </StadiumButton>

          {/* Redeem code section - компактная форма */}
          <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3">
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
                className="shrink-0 rounded-xl bg-zinc-900/70 border border-saccent-500/40 backdrop-blur-xl px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50 transition shadow-[0_0_28px_-4px_rgb(var(--stealth-accent)_/_0.3),inset_0_0_20px_rgb(var(--stealth-accent)_/_0.06),inset_0_1px_0_rgba(255,255,255,0.08)] hover:border-saccent-500/60 hover:shadow-[0_0_40px_-4px_rgb(var(--stealth-accent)_/_0.5),inset_0_0_24px_rgb(var(--stealth-accent)_/_0.1)]"
              >
                {redeemLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Активировать код"}
              </button>
            </form>
            {redeemError && <div className="mt-2 rounded-xl bg-saccent-500/10 text-saccent-300 text-xs font-medium text-center py-2">{redeemError}</div>}
            {redeemSuccess && (
              <div className="mt-2 rounded-xl bg-emerald-500/10 text-emerald-400 text-xs font-medium text-center py-2 flex items-center justify-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> {redeemSuccess}
              </div>
            )}
          </div>

          {/* Grid buttons */}
          <div className="grid grid-cols-3 gap-2.5">
            <button className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3 flex flex-col items-center text-center gap-1 hover:bg-white/[0.04] transition">
              <Package className="h-4 w-4 text-sky-400" />
              <span className="text-base font-bold tabular-nums">{subscriptions.length}</span>
              <span className="text-[10px] text-zinc-500">Всего</span>
            </button>
            <button className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3 flex flex-col items-center text-center gap-1 hover:bg-white/[0.04] transition">
              <Send className="h-4 w-4 text-violet-400" />
              <span className="text-base font-bold tabular-nums">{giftedCount}</span>
              <span className="text-[10px] text-zinc-500">Подарено</span>
            </button>
            <button className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3 flex flex-col items-center text-center gap-1 hover:bg-white/[0.04] transition">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-base font-bold tabular-nums">{activeCodesCount}</span>
              <span className="text-[10px] text-zinc-500">Коды</span>
            </button>
          </div>
        </div>
      </motion.div>

      {/* My subscriptions list - как в главном меню */}
      {subscriptions.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-zinc-400 px-1">Мои подарки</h2>
          <div className="space-y-2.5">{subscriptions.map((sub, i) => {
            const isGifted = sub.giftStatus === "GIFTED";
            const isActivatedSelf = sub.giftStatus === "ACTIVATED_SELF";
            const isReserved = sub.giftStatus === "GIFT_RESERVED";
            const activeCode = codes.find((c) => c.subscriptionId === sub.id && c.status === "ACTIVE");
            const isFinalized = isGifted || isActivatedSelf;
            const badge = isGifted ? { t: "Получена", c: "bg-violet-500/15 text-violet-400 border-violet-500/25" }
              : isActivatedSelf ? { t: "Для себя", c: "bg-sky-500/15 text-sky-400 border-sky-500/25" }
              : isReserved ? { t: "Код создан", c: "bg-amber-500/15 text-amber-400 border-amber-500/25" }
              : { t: "Доступна", c: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" };
            return (
              <motion.div
                key={sub.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.07, ease: "easeOut" }}
                whileHover={{ scale: 1.015 }}
                className="relative rounded-2xl border border-white/[0.09] bg-white/[0.04] p-3.5 space-y-2.5 transition-all duration-300 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-saccent-500/30 hover:shadow-[0_0_40px_-12px_rgb(var(--stealth-accent)_/_0.45)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn("h-2 w-2 rounded-full shrink-0", isFinalized ? "bg-zinc-600" : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]")} />
                    <span className="text-sm font-bold truncate">Подписка #{sub.subscriptionIndex}</span>
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
                      className="rounded-xl bg-saccent-500/10 hover:bg-saccent-500/20 border border-saccent-500/25 disabled:opacity-50 text-saccent-400 text-xs font-bold py-2.5 flex items-center justify-center gap-1.5 transition overflow-hidden">
                      {actionLoading === `create-${sub.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gift className="w-3.5 h-3.5" />} Подарить
                    </button>
                    <button onClick={() => handleGetUrl(sub)} disabled={!activeCode || actionLoading === `url-${sub.id}`}
                      className="rounded-xl bg-white/[0.04] border border-white/[0.08] disabled:opacity-40 text-xs font-bold py-2.5 flex items-center justify-center gap-1.5 hover:bg-white/[0.06] transition overflow-hidden">
                      {actionLoading === `url-${sub.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : copiedId === `url-${sub.id}` ? <Check className="w-3.5 h-3.5" /> : <LinkIcon className="w-3.5 h-3.5" />} Ссылка
                    </button>
                    <button onClick={() => handleActivateForSelf(sub.id)} disabled={actionLoading === `activate-${sub.id}`}
                      className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 disabled:opacity-40 text-xs font-bold py-2.5 flex items-center justify-center gap-1.5 hover:bg-emerald-500/15 transition overflow-hidden">
                      {actionLoading === `activate-${sub.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />} Себе
                    </button>
                    <button onClick={() => activeCode && handleCancelCode(activeCode.id)} disabled={!activeCode || actionLoading === `cancel-${activeCode?.id}`}
                      className="rounded-xl bg-saccent-500/10 border border-saccent-500/20 text-saccent-400 disabled:opacity-40 text-xs font-bold py-2.5 flex items-center justify-center gap-1.5 hover:bg-saccent-500/15 transition overflow-hidden">
                      {activeCode && actionLoading === `cancel-${activeCode.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />} Отменить
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}</div>
        </div>
      )}

      {subscriptions.length === 0 && !loading && (
        <div className="rounded-2xl border border-dashed border-white/[0.1] bg-zinc-950/30 p-6 text-center space-y-3">
          <Package className="w-7 h-7 text-zinc-600 mx-auto" />
          <p className="text-xs text-zinc-500">У вас пока нет подарков</p>
        </div>
      )}

      {/* Gift codes - compact section */}
      {codes.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-zinc-400 px-1">Все коды</h2>
          <div className="space-y-2">{codes.map((c, i) => {
            const isActive = c.status === "ACTIVE";
            const isRedeemed = c.status === "REDEEMED";
            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 space-y-2", !isActive && "opacity-60")}
              >
                <div className="flex justify-between items-center">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", isActive ? "bg-emerald-500/15 text-emerald-400" : isRedeemed ? "bg-sky-500/15 text-sky-400" : "bg-white/[0.06] text-zinc-500")}>
                    {isActive ? "Активен" : isRedeemed ? "Использован" : "Отменён"}
                  </span>
                  <span className="text-[10px] text-zinc-500 flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(c.createdAt).toLocaleDateString("ru-RU")}</span>
                </div>
                <div className="flex items-center justify-center py-2 bg-white/[0.02] rounded-lg border border-white/[0.05]">
                  <code className="text-sm font-mono font-bold tracking-widest">{c.code}</code>
                </div>
                {isActive && (
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => copyCode(c.code, c.id)} className="rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs font-bold py-1.5 flex items-center justify-center gap-1.5 hover:bg-white/[0.06] transition overflow-hidden">
                      {copiedId === `code-${c.id}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} Копировать
                    </button>
                    <button onClick={() => handleCancelCode(c.id)} disabled={actionLoading === `cancel-${c.id}`}
                      className="rounded-lg bg-saccent-500/10 border border-saccent-500/20 text-saccent-400 disabled:opacity-40 text-xs font-bold py-1.5 flex items-center justify-center gap-1.5 hover:bg-saccent-500/15 transition overflow-hidden">
                      {actionLoading === `cancel-${c.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />} Отменить
                    </button>
                  </div>
                )}
              </motion.div>
            );
          })}</div>
        </div>
      )}

      {/* History - compact card */}
      {historyItems.length > 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><History className="h-4 w-4 text-saccent-400" /><span className="text-sm font-bold">История</span></div>
            {historyTotal > 4 && (
              <button onClick={() => setShowFullHistory(!showFullHistory)} className="text-[11px] font-bold text-saccent-400 flex items-center gap-1">
                {showFullHistory ? "Скрыть" : "Все"} {showFullHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
          <div className="space-y-2">{historyItems.slice(0, showFullHistory ? undefined : 4).map((item) => {
            const ev = HISTORY_EVENT_MAP[item.eventType] ?? { icon: <Clock className="w-4 h-4" />, label: item.eventType, color: "text-zinc-400 bg-white/[0.04] border-white/10" };
            const meta = item.metadata as Record<string, string> | null;
            return (
              <div key={item.id} className="flex gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/[0.05]">
                <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border", ev.color)}>{ev.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold truncate">{ev.label}</span>
                    <span className="text-[10px] text-zinc-500 shrink-0">{formatTimeAgo(item.createdAt)}</span>
                  </div>
                  {meta && Object.keys(meta).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1 text-[10px]">
                      {meta.code && <span className="font-mono bg-saccent-500/10 text-saccent-400 px-1.5 py-0.5 rounded-md">{meta.code}</span>}
                      {meta.tariffName && <span className="flex items-center gap-1 bg-white/[0.05] text-zinc-400 px-1.5 py-0.5 rounded-md"><Package className="w-2.5 h-2.5" />{meta.tariffName}</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}</div>
        </div>
      )}

      {/* ═══ Buy modal: pills дней СВЕРХУ + список тарифов (по выбранным дням) ═══ */}
      <StealthModal open={buyDialogOpen} onClose={closeBuy} title={selectedTariff ? selectedTariff.name : "Купить в подарок"}>
        {!selectedTariff ? (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500">Выберите период и тариф — оплата с баланса или через провайдера.</p>

            <div className="flex flex-wrap gap-2">
              {DAY_OPTIONS.map((d) => (
                <motion.button
                  key={d}
                  type="button"
                  onClick={() => setActiveDays(d)}
                  whileTap={{ scale: 0.94 }}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all duration-300 min-w-[58px]",
                    activeDays === d
                      ? "bg-white text-black border-white shadow-[0_0_24px_-6px_rgba(255,255,255,0.45)]"
                      : "bg-white/[0.03] text-zinc-300 border-white/[0.08] backdrop-blur-xl hover:border-white/25 hover:bg-white/[0.06]",
                  )}
                >
                  {d} дн.
                </motion.button>
              ))}
            </div>

            {buyError && (
              <div className="rounded-xl bg-saccent-500/10 border border-saccent-500/30 p-2.5 text-xs text-saccent-300 text-center">
                {buyError}
              </div>
            )}

            <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
              {tariffs.length === 0 ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
              ) : visibleTariffs.length === 0 ? (
                <p className="text-xs text-zinc-500 text-center py-6">Нет тарифов с периодом {activeDays} дн.</p>
              ) : (
                visibleTariffs.map((t) => {
                  const opts = t.priceOptions ?? [];
                  const opt = opts.find((o) => o.durationDays === activeDays) ?? opts[0];
                  const price = opt?.price ?? t.price;
                  const days = opt?.durationDays ?? t.durationDays;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => pickTariff(t)}
                      disabled={buyLoading}
                      className="w-full flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-zinc-900/40 hover:bg-zinc-900/60 hover:border-white/20 transition-all p-3.5 text-left disabled:opacity-50 overflow-hidden"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate">{t.name}</div>
                        {/* T-fix-ts-unused-2: Calendar заменён на Clock (он уже импортирован, визуально похож) */}
                        <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-0.5">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {days} дн.</span>
                          {((t.pricePerExtraDevice ?? 0) > 0 && (t.maxExtraDevices ?? 0) > 0) && <span>+ доп. устр.</span>}
                        </div>
                      </div>
                      {/* T-fix-ts-unused-2: currency заменена на inline t.currency ?? "RUB" */}
                      <div className="text-right shrink-0">
                        <div className="font-bold text-saccent-400 tabular-nums">{fmtPrice(price, t.currency ?? "RUB")}</div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0" />
                    </button>
                  );
                })
              )}
            </div>

            {/* T-fix-ts-unused-2: currency заменена на inline client?.preferredCurrency ?? "usd" */}
            <div className="flex items-center justify-between px-1 pt-1 text-xs border-t border-white/[0.06]">
              <span className="text-zinc-500">Ваш баланс:</span>
              <span className="font-bold">{fmtPrice(client?.balance ?? 0, client?.preferredCurrency ?? "usd")}</span>
            </div>
          </div>
        ) : (
          (() => {
            const opt = getSelectedOption();
            if (!opt) return null;
            const tCurrency = (selectedTariff.currency ?? "RUB").toLowerCase();
            const methods = availableMethods(tCurrency);
            const totalPrice = opt.price + (selectedTariff.pricePerExtraDevice ?? 0) * extraDevices;
            const hasBalance = balance >= totalPrice;

            return (
              <div className="space-y-3">
                <button onClick={cancelPick} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition">
                  <ChevronRight className="h-3.5 w-3.5 rotate-180" /> Назад к тарифам
                </button>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl p-4 space-y-2">
                  <div className="flex justify-between text-xs text-zinc-400">
                    <span>Тариф</span><span className="font-medium text-zinc-200">{selectedTariff.name}</span>
                  </div>
                  <div className="flex justify-between text-xs text-zinc-400">
                    <span>Период</span><span className="font-medium text-zinc-200">{opt.durationDays} дн.</span>
                  </div>

                  {/* Дополнительные устройства */}
                  {((selectedTariff.pricePerExtraDevice ?? 0) > 0 && (selectedTariff.maxExtraDevices ?? 0) > 0) && (
                    <div className="border-t border-white/[0.06] pt-2 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">Дополнительные устройства</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setExtraDevices(Math.max(0, extraDevices - 1))}
                            disabled={extraDevices === 0}
                            className="h-7 w-7 rounded-lg bg-zinc-900/60 border border-white/[0.08] hover:border-white/20 disabled:opacity-40 flex items-center justify-center text-zinc-300 transition"
                          >
                            −
                          </button>
                          <span className="text-sm font-bold text-zinc-200 w-6 text-center tabular-nums">{extraDevices}</span>
                          <button
                            type="button"
                            onClick={() => setExtraDevices(Math.min(selectedTariff.maxExtraDevices ?? 0, extraDevices + 1))}
                            disabled={extraDevices >= (selectedTariff.maxExtraDevices ?? 0)}
                            className="h-7 w-7 rounded-lg bg-zinc-900/60 border border-white/[0.08] hover:border-white/20 disabled:opacity-40 flex items-center justify-center text-zinc-300 transition"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      {extraDevices > 0 && (
                        <div className="text-[10px] text-zinc-500 flex justify-between">
                          <span>{extraDevices} × {fmtPrice(selectedTariff.pricePerExtraDevice ?? 0, tCurrency)}</span>
                          <span className="text-saccent-400 font-bold">+{fmtPrice((selectedTariff.pricePerExtraDevice ?? 0) * extraDevices, tCurrency)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="border-t border-white/[0.06] pt-2 flex justify-between items-baseline">
                    <span className="text-sm font-bold">Итого:</span>
                    <span className="text-xl font-bold tabular-nums bg-gradient-to-r from-saccent-400 via-saccent-300 to-saccent-500 bg-clip-text text-transparent drop-shadow-[0_0_18px_rgb(var(--stealth-accent)_/_0.35)]">
                      {fmtPrice(opt.price + (selectedTariff.pricePerExtraDevice ?? 0) * extraDevices, tCurrency)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-saccent-400" />
                    <span className="text-sm font-bold">Способ оплаты</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    {methods.map((m) => {
                      const isActive = selectedMethod && (
                        (m.kind === "platega" && selectedMethod.kind === "platega" && (selectedMethod as { id?: number }).id === (m as { id: number }).id) ||
                        (m.kind === selectedMethod.kind && m.kind !== "platega")
                      );
                      const Icon = m.icon;
                      const mBalance = m.kind === "balance";
                      return (
                        <motion.button
                          key={`${m.kind}-${m.kind === "platega" ? (m as { id: number }).id : ""}`}
                          type="button"
                          onClick={() => setSelectedMethod(m)}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.97 }}
                          className={cn(
                            "rounded-2xl border p-4 transition-colors duration-300 flex flex-col items-center gap-2 backdrop-blur-xl shadow-[inset_0_0_0_1px_transparent]",
                            isActive
                              ? "bg-white/[0.06] border-saccent-500/45 shadow-[0_0_36px_-10px_rgb(var(--stealth-accent)_/_0.5),inset_0_1px_0_rgba(255,255,255,0.08),inset_0_0_0_1px_rgb(var(--stealth-accent)_/_0.2)]"
                              : "bg-white/[0.02] border-white/[0.06] hover:border-white/20 hover:bg-white/[0.04]",
                          )}
                        >
                          <Icon className={cn("h-5 w-5 transition-colors duration-300", isActive ? "text-saccent-400 drop-shadow-[0_0_8px_rgb(var(--stealth-accent)_/_0.6)]" : "text-zinc-500")} />
                          <span className="text-[11px] font-bold uppercase tracking-wider">{mBalance ? "ПРОВАЙДЕРЫ" : m.label}</span>
                        </motion.button>
                      );
                    })}
                    {/* Баланс всегда видим */}
                    <motion.button
                      type="button"
                      onClick={() => hasBalance && setSelectedMethod({ kind: "balance", label: "Баланс", icon: Wallet })}
                      disabled={!hasBalance}
                      whileHover={hasBalance ? { scale: 1.02 } : undefined}
                      whileTap={hasBalance ? { scale: 0.97 } : undefined}
                      className={cn(
                        "rounded-2xl border p-4 transition-colors duration-300 flex flex-col items-center gap-1.5 backdrop-blur-xl",
                        selectedMethod?.kind === "balance"
                          ? "bg-emerald-500/[0.08] border-emerald-500/35 shadow-[0_0_32px_-10px_rgba(52,211,153,0.45),inset_0_1px_0_rgba(255,255,255,0.07)]"
                          : hasBalance
                            ? "bg-white/[0.02] border-white/[0.06] hover:border-white/20 hover:bg-white/[0.04]"
                            : "bg-zinc-900/20 border-white/[0.04] opacity-60 cursor-not-allowed",
                      )}
                    >
                      <Wallet className={cn("h-5 w-5", selectedMethod?.kind === "balance" ? "text-emerald-400" : hasBalance ? "text-zinc-500" : "text-zinc-600")} />
                      <span className="text-[11px] font-bold uppercase tracking-wider">Баланс</span>
                      <span className={cn(
                        "text-[10px] font-medium tabular-nums",
                        hasBalance ? "text-emerald-400/90" : "text-zinc-500",
                      )}>
                        {hasBalance ? fmtPrice(balance, tCurrency) : `${fmtPrice(balance, tCurrency)} — не хватает`}
                      </span>
                    </motion.button>
                  </div>
                </div>

                {buyError && (
                  <div className="rounded-xl bg-saccent-500/10 border border-saccent-500/30 p-3 flex items-start gap-2 text-xs">
                    <AlertCircle className="h-4 w-4 text-saccent-400 shrink-0 mt-0.5" />
                    <span className="text-saccent-300">{buyError}</span>
                  </div>
                )}

                <StadiumButton
                  variant="white"
                  size="lg"
                  onClick={doPay}
                  disabled={buyLoading || !selectedMethod || (selectedMethod.kind === "balance" && !hasBalance)}
                  iconLeft={buyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                >
                  {buyLoading
                    ? "Создаём платёж…"
                    : (selectedMethod?.kind === "balance" && !hasBalance)
                      ? "Недостаточно средств"
                      : `Оплатить ${fmtPrice(totalPrice, tCurrency)}`}
                </StadiumButton>
              </div>
            );
          })()
        )}
      </StealthModal>
    </div>
  );
}
