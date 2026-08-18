/**
 * StealthSupportChatModal — модалка AI-чата в Hundler-стиле.
 *
 * 2026-08-15: перенесено из Classic floating-chat.tsx в Stealth-кабинет.
 * Открывается прямо со страницы «Поддержка» (НЕ FAB внизу справа).
 *
 * T-fix-no-duplicate-x (2026-08-15): убран дубль крестик-закрытия из моего
 * header — родительский StealthModal уже рендерит свой X в правом верхнем
 * углу, второй был лишним.
 *
 * T-fix-no-support-tab (2026-08-15): убран таб «Поддержка» в ChatSwitcher.
 * Модалка теперь только AI Чат (без переключателя).
 *
 * T-fix-avatar-red + T-fix-send-button-gradient (2026-08-15, rev.2):
 *   - Аватарка бота в сообщениях: bg-violet-500/20 text-violet-400 →
 *     bg-saccent-500/20 text-saccent-400 (фиолетовая → красная, как у юзера).
 *   - Аватарка бота в header: тоже bg-saccent-500/15 + text-saccent-400.
 *   - Кнопка отправки: solid bg-saccent-500 → градиент bg-gradient-to-r
 *     from-saccent-500 to-fuchsia-500 (как было в Classic floating-chat,
 *     юзер попросил «вернуть как было»).
 *
 * Стилизация под Stealth:
 *   - bg-zinc-900/60 (как остальные карточки Stealth)
 *   - accent через CSS-переменную --stealth-accent (saccent-* классы)
 *   - glass-blur и тонкие рамки white/[0.06]
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, User, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StealthModal } from "@/components/stealth/stealth-modal";
import { useClientAuth } from "@/contexts/client-auth";
import { useCabinetConfig } from "@/contexts/cabinet-config";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface AiMessage {
  id: string;
  text: string;
  from: "user" | "bot";
  time: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const AI_STORAGE_KEY = "stealth_ai_chat_history_v1";

function getInitialAiMessage(serviceName: string): AiMessage[] {
  const name = (serviceName || "Сервис").trim() || "Сервис";
  return [
    {
      id: "a1",
      text: `Привет! Я AI-ассистент ${name}. Готов помочь с настройкой VPN, тарифами и любыми другими вопросами. Что вас интересует?`,
      from: "bot",
      time: "10:00",
    },
  ];
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function StealthSupportChatModal({ open, onClose }: Props) {
  const { state } = useClientAuth();
  const config = useCabinetConfig();
  const token = state.token ?? null;
  const serviceName = config?.serviceName?.trim() || "Сервис";
  const aiChatEnabled = config?.aiChatEnabled !== false;

  const [aiMessages, setAiMessages] = useState<AiMessage[]>(() => getInitialAiMessage(serviceName));
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    setAiMessages((prev) => {
      if (prev.length !== 1 || prev[0].id !== "a1") return prev;
      const want = getInitialAiMessage(serviceName)[0].text;
      return prev[0].text === want ? prev : getInitialAiMessage(serviceName);
    });
  }, [serviceName]);

  useEffect(() => {
    if (!open) return;
    try {
      const stored = sessionStorage.getItem(AI_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AiMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) setAiMessages(parsed);
      }
    } catch {
      /* corrupt JSON */
    }
  }, [open]);

  useEffect(() => {
    if (aiMessages.length > 1) {
      try {
        sessionStorage.setItem(AI_STORAGE_KEY, JSON.stringify(aiMessages));
      } catch {
        /* quota */
      }
    }
  }, [aiMessages]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [open, aiMessages]);

  const handleSendAi = async () => {
    const text = aiInput.trim();
    if (!text || !token) return;

    const now = new Date();
    const userMsg: AiMessage = {
      id: Date.now().toString(),
      text,
      from: "user",
      time: fmtTime(now),
    };

    setAiMessages((prev) => [...prev, userMsg]);
    setAiInput("");
    setAiLoading(true);

    try {
      const messagesForApi = [...aiMessages, userMsg]
        .filter((m) => m.id !== "a1")
        .map((m) => ({
          role: m.from === "user" ? "user" : "assistant",
          content: m.text,
        }));

      const res = await api.chatAi(token, { messages: messagesForApi as any });

      const replyMsg: AiMessage = {
        id: (Date.now() + 1).toString(),
        text: res.reply,
        from: "bot",
        time: fmtTime(new Date()),
      };

      setAiMessages((prev) => [...prev, replyMsg]);
    } catch {
      const errorMsg: AiMessage = {
        id: (Date.now() + 1).toString(),
        text: "Произошла ошибка при обращении к AI. Пожалуйста, попробуйте позже.",
        from: "bot",
        time: fmtTime(new Date()),
      };
      setAiMessages((prev) => [...prev, errorMsg]);
    } finally {
      setAiLoading(false);
    }
  };

  if (!aiChatEnabled) {
    return (
    <StealthModal open={open} onClose={onClose} title="" maxWidth="32rem" scrollable={false}>
        <div className="flex flex-col items-center justify-center gap-3 py-12 text-zinc-500">
          <Sparkles className="h-8 w-8 opacity-40" />
          <p className="text-sm font-medium text-center">AI-чат недоступен</p>
          <p className="text-xs text-zinc-600 text-center max-w-xs">Админ отключил AI в настройках кабинета</p>
        </div>
      </StealthModal>
    );
  }

  return (
    <StealthModal open={open} onClose={onClose} title="" maxWidth="32rem">
      <div className="flex flex-col h-full min-h-[200px]">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 mb-4 border-b border-white/[0.06] shrink-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-saccent-500/15 border border-saccent-500/30 shrink-0">
            <Sparkles className="h-5 w-5 text-saccent-400" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold text-foreground leading-tight truncate">AI Ассистент</p>
            <p className="text-[11px] text-zinc-500 mt-0.5 font-medium flex items-center gap-1.5">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
              </span>
              Бот онлайн
            </p>
          </div>
        </div>

        {/* AI Messages */}
        <div className="flex-1 overflow-y-auto custom-scrollbar -mx-1 px-1 min-h-0 space-y-3 py-2" style={{ WebkitOverflowScrolling: "touch" }}>
          <AnimatePresence mode="popLayout">
            {aiMessages.map((msg) => {
              const isUser = msg.from === "user";
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={cn("flex gap-2 max-w-[90%]", isUser ? "ml-auto flex-row-reverse" : "mr-auto")}
                >
                  {/* T-fix-avatar-red: аватарка бота — красная (была фиолетовая) */}
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full shadow-sm mt-1",
                      isUser ? "bg-saccent-500/20 text-saccent-400" : "bg-saccent-500/20 text-saccent-400",
                    )}
                  >
                    {isUser ? <User className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                  </div>
                  <div
                    className={cn(
                      "rounded-xl px-3.5 py-2 text-[13.5px] leading-relaxed shadow-sm",
                      isUser
                        ? "bg-saccent-500/20 border border-saccent-500/30 text-foreground rounded-tr-sm"
                        : "bg-zinc-800/60 border border-white/[0.06] text-foreground rounded-tl-sm",
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    <p className={cn("text-[9px] mt-1 opacity-50 font-medium", isUser ? "text-right" : "text-left text-zinc-500")}>
                      {msg.time}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          <div ref={messagesEndRef} className="h-1" />
        </div>

        {/* AI Input */}
        <div className="pt-3 mt-2 border-t border-white/[0.06] shrink-0">
          <div className="relative flex items-end gap-2 bg-white/[0.03] p-1.5 rounded-xl border border-white/[0.06] focus-within:border-saccent-500/40 transition-all">
            <textarea
              className="flex-1 max-h-24 min-h-[40px] w-full resize-none bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-zinc-500 focus:outline-none custom-scrollbar"
              placeholder="Спросите у AI..."
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendAi();
                }
              }}
              rows={1}
            />
            {/* Кнопка отправки — градиент как у "Установить и настроить VPN" */}
            <Button
              size="icon"
              className="h-9 w-9 rounded-lg shrink-0 bg-gradient-to-b from-saccent-500 via-saccent-600 to-saccent-600 hover:from-saccent-600 hover:via-saccent-700 hover:to-saccent-700 text-white transition-transform active:scale-95 mb-0.5 mr-0.5 disabled:opacity-40 overflow-hidden shadow-[0_0_20px_-4px_rgb(var(--stealth-accent)_/_0.5),inset_0_1px_0_rgba(255,255,255,0.2)]"
              onClick={handleSendAi}
              disabled={!aiInput.trim() || aiLoading}
            >
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 ml-0.5" />}
            </Button>
          </div>
        </div>
      </div>
    </StealthModal>
  );
}
