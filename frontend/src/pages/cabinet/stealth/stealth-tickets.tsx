/**
 * Stealth Tickets — поддержка/тикеты в Hundler-style.
 *
 * T-support-chat-button (2026-08-15): primary-кнопка «Чат поддержки» открывает
 * StealthSupportChatModal (AI + тикеты в одной модалке).
 *
 * T-fix-ts2322 (2026-08-15): параллельный чат убрал `initialTab` из Props
 * StealthSupportChatModal (модалка теперь только AI-чат, без таба Поддержка),
 * но передача `initialTab={initialTab}` осталась здесь → TS2322. Также
 * локальная `const initialTab` стала unused после удаления пропа → TS6133.
 * Удалил и переменную, и передачу пропа.
 *
 * T-fix-chat-button-restored (2026-08-15, rev.2): юзер попросил «вернуть
 * как раньше» — кнопка «Чат поддержки» возвращена к градиентному стилю
 * (как в самой первой версии): `bg-gradient-to-br from-saccent-500/20
 * via-fuchsia-500/15 to-purple-500/20`, плюс sub-текст «AI-ассистент ·
 * обращения в поддержку», плюс блоб-блок для эффекта «переливания».
 *
 * 2 состояния списка:
 *  - Empty (тикетов нет): envelope-карточка с текстом «обращений пока нет»
 *  - List: карточки тикетов, клик → StealthTicketChatModal
 */

import { useEffect, useState } from "react";
import { Sparkles, Plus, Mail, ChevronRight, Loader2 } from "lucide-react";
import { useClientAuth } from "@/contexts/client-auth";
import { api } from "@/lib/api";
import { StadiumButton } from "@/components/stealth/stadium-button";
import { StealthNewTicketModal } from "@/components/stealth/stealth-new-ticket-modal";
import { StealthTicketChatModal } from "@/components/stealth/stealth-ticket-chat-modal";
import { StealthSupportChatModal } from "@/components/stealth/stealth-support-chat-modal";
import { useCabinetConfig } from "@/contexts/cabinet-config";
import { cn } from "@/lib/utils";

interface TicketItem {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

function statusColors(status: string): string {
  if (status === "open") return "bg-saccent-500/15 text-saccent-400 border-saccent-500/30";
  if (status === "closed") return "bg-zinc-700/60 text-zinc-400 border-white/10";
  return "bg-white/10 text-zinc-300 border-white/15";
}
function statusLabel(status: string): string {
  if (status === "open") return "Открыт";
  if (status === "closed") return "Закрыт";
  return status;
}
function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" }); }
  catch { return iso; }
}

export function StealthTickets() {
  const { state } = useClientAuth();
  const config = useCabinetConfig();
  const [items, setItems] = useState<TicketItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [chatTicketId, setChatTicketId] = useState<string | null>(null);
  const [showSupportChat, setShowSupportChat] = useState(false);

  const aiEnabled = config?.aiChatEnabled !== false;
  const ticketsEnabled = config?.ticketsEnabled !== false;
  // T-fix-ts2322: `initialTab` убран из StealthSupportChatModal — модалка
  // теперь всегда открывается на AI (или показывает «AI-чат недоступен»,
  // если выключен в конфиге). Локальная переменная больше не нужна.

  function load() {
    if (!state.token) return;
    setLoading(true);
    setErr(null);
    api.getTickets(state.token)
      .then((r) => setItems(r.items ?? []))
      .catch((e) => setErr(e instanceof Error ? e.message : "Не удалось загрузить обращения"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [state.token]);

  const goNew = () => setShowNew(true);
  const goTicket = (id: string) => setChatTicketId(id);

  const supportDisabled = !aiEnabled && !ticketsEnabled;

  // Sub-текст под «Чат поддержки» зависит от того, какие каналы включены у админа.
  const supportSubtext = aiEnabled && ticketsEnabled
    ? "AI-ассистент · обращения в поддержку"
    : aiEnabled
      ? "AI-ассистент ответит на ваши вопросы"
      : "Создать обращение или написать оператору";

  return (
    <div className="px-4 pt-2 space-y-4 pb-2 overflow-x-hidden">
      {/* T-fix-chat-button-restored: градиент red→fuchsia→purple + sub-текст +
          блоб-блок для эффекта переливания. Как было в первой ревизии. */}
      {!supportDisabled && (
        <button
          type="button"
          onClick={() => setShowSupportChat(true)}
          className={cn(
            "group relative w-full overflow-hidden rounded-2xl",
            "border border-saccent-500/30",
            "bg-gradient-to-br from-saccent-500/20 via-fuchsia-500/15 to-purple-500/20",
            "hover:from-saccent-500/30 hover:via-fuchsia-500/20 hover:to-purple-500/30",
            "shadow-[0_8px_32px_-12px_rgb(var(--stealth-accent)_/_0.5),inset_0_1px_0_rgba(255,255,255,0.08)]",
            "hover:shadow-[0_12px_40px_-8px_rgb(var(--stealth-accent)_/_0.7),inset_0_1px_0_rgba(255,255,255,0.12)]",
            "active:scale-[0.98] transition-all duration-300",
            "p-4 flex items-center gap-4",
          )}
        >
          {/* Мягкое accent-свечение в правом верхнем углу — даёт «переливание»
              при наведении/движении. */}
          <div className="pointer-events-none absolute top-0 right-0 h-24 w-24 rounded-full bg-saccent-500/30 blur-2xl" aria-hidden="true" />
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-saccent-500/25 border border-saccent-500/40 shadow-inner">
            <Sparkles className="h-6 w-6 text-saccent-300" strokeWidth={2} />
          </div>
          <div className="relative flex-1 text-left">
            <p className="text-[15px] font-bold text-foreground leading-tight">
              Чат поддержки
            </p>
            <p className="text-[11px] text-zinc-400 mt-0.5 leading-snug font-medium">
              {supportSubtext}
            </p>
          </div>
          <ChevronRight className="relative h-5 w-5 text-zinc-400 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </button>
      )}

      {ticketsEnabled && (
        <StadiumButton variant="outline" size="md" iconLeft={<Plus className="h-4 w-4" />} onClick={goNew}>
          Новое обращение
        </StadiumButton>
      )}

      {supportDisabled ? (
        <div className="rounded-3xl border border-white/[0.08] bg-zinc-900/40 p-8 flex flex-col items-center text-center gap-3">
          <div className="h-14 w-14 rounded-2xl bg-zinc-800/80 border border-white/10 flex items-center justify-center">
            <Mail className="h-6 w-6 text-zinc-300" />
          </div>
          <div>
            <h3 className="text-base font-bold">Поддержка недоступна</h3>
            <p className="text-xs text-zinc-500 mt-1">Админ отключил чат и обращения в настройках кабинета</p>
          </div>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-saccent-500" />
        </div>
      ) : err ? (
        <div className="rounded-2xl border border-saccent-500/30 bg-saccent-500/10 p-4 text-sm text-saccent-300">
          {err}
        </div>
      ) : !items || items.length === 0 ? (
        <div className="rounded-3xl border border-white/[0.08] bg-zinc-900/40 p-8 flex flex-col items-center text-center gap-3">
          <div className="h-14 w-14 rounded-2xl bg-zinc-800/80 border border-white/10 flex items-center justify-center">
            <Mail className="h-6 w-6 text-zinc-300" />
          </div>
          <div>
            <h3 className="text-base font-bold">У вас пока нет обращений в поддержку</h3>
            <p className="text-xs text-zinc-500 mt-1">Нажмите «Новое обращение», чтобы связаться с нами</p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/[0.08] bg-zinc-900/40 overflow-hidden divide-y divide-white/[0.04]">
          {items.map((t) => (
            <button
              key={t.id}
              onClick={() => goTicket(t.id)}
              className="w-full flex items-center gap-3 p-3.5 text-left hover:bg-white/[0.03] transition"
            >
              <div className="h-10 w-10 rounded-xl bg-zinc-800/60 border border-white/10 flex items-center justify-center shrink-0">
                <Mail className="h-4 w-4 text-zinc-300" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-semibold text-sm truncate">{t.subject || "Без темы"}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <span className={cn("rounded-md border px-1.5 py-0.5 font-bold uppercase tracking-wider", statusColors(t.status))}>
                    {statusLabel(t.status)}
                  </span>
                  <span className="text-zinc-500">{fmtDate(t.updatedAt)}</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* T-fix-ts2322: убран проп `initialTab` — модалка всегда AI-чат (или
          сообщение «AI-чат недоступен» если выключен). Передаём только open+onClose. */}
      <StealthSupportChatModal
        open={showSupportChat}
        onClose={() => setShowSupportChat(false)}
      />

      <StealthNewTicketModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={(id) => {
          load();
          setChatTicketId(id);
        }}
      />

      <StealthTicketChatModal
        open={chatTicketId !== null}
        ticketId={chatTicketId}
        onClose={() => { setChatTicketId(null); load(); }}
      />
    </div>
  );
}
