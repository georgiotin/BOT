/**
 * StealthTicketChatModal — ticket conversation inside StealthModal.
 *
 * Key fixes:
 *   - Uses flex column layout so input is always visible
 *   - Messages area uses flex-1 min-h-0 for proper shrinking
 *   - Image lightbox instead of external links
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Send, Loader2, AlertCircle, Paperclip, ImageIcon, X as XIcon, RefreshCw, ZoomIn } from "lucide-react";
import { useClientAuth } from "@/contexts/client-auth";
import { api, type TicketMessageDto } from "@/lib/api";
import { StealthModal } from "./stealth-modal";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  ticketId: string | null;
  onClose: () => void;
}

interface TicketDetail {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  messages: TicketMessageDto[];
}

const MAX_FILES = 5;
const POLL_MS = 8000;

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // T-fix-lightbox-above-modal (2026-08-18): лайтбокс рендерился в дереве
  // СТРАНИЦЫ с z-[80], а StealthModal (внутри которой открыт чат) имеет
  // z-[9999] — фото оказывалось ПОД модалкой чата и было не видно.
  // Рендерим через портал в body и поднимаем z выше модалки (10000).
  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/95 backdrop-blur-sm p-4"
      style={{ touchAction: "none" }}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition z-10"
      >
        <XIcon className="h-5 w-5" />
      </button>
      <img
        src={url}
        alt=""
        className="max-w-full max-h-full object-contain rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}

export function StealthTicketChatModal({ open, ticketId, onClose }: Props) {
  const { state } = useClientAuth();
  const [data, setData] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!state.token || !ticketId) return;
    setErr(null);
    try {
      const r = await api.getTicket(state.token, ticketId);
      setData(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось загрузить тикет");
    }
  }, [state.token, ticketId]);

  useEffect(() => {
    if (!open || !ticketId) return;
    setLoading(true);
    load().finally(() => setLoading(false));
    pollRef.current = setInterval(load, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, ticketId, load]);

  useEffect(() => {
    if (data?.messages?.length && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [data?.messages?.length]);

  useEffect(() => {
    if (!open) {
      setReply("");
      setFiles([]);
      setData(null);
      setErr(null);
      setLightboxUrl(null);
    }
  }, [open]);

  function pickFiles(list: FileList | null) {
    if (!list) return;
    const arr = Array.from(list).slice(0, MAX_FILES - files.length).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...arr].slice(0, MAX_FILES));
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function send() {
    if (!state.token || !ticketId) return;
    const trimmed = reply.trim();
    if (!trimmed && files.length === 0) return;
    setSending(true);
    setErr(null);
    try {
      await api.replyTicket(state.token, ticketId, { content: trimmed, files: files.length > 0 ? files : undefined });
      setReply("");
      setFiles([]);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Не удалось отправить");
    } finally {
      setSending(false);
    }
  }

  const isClosed = data?.status === "closed";
  const subject = data?.subject || "Без темы";

  return (
    <>
      {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
      <StealthModal open={open} onClose={onClose} title={subject} maxWidth="32rem" scrollable={false}>
        {/* Flex column container — ensures input stays visible */}
        <div className="flex flex-col h-full min-h-[200px]">
          {/* Status + refresh row */}
          <div className="flex items-center justify-between shrink-0 mb-2">
            {data ? (
              <span className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                isClosed ? "bg-zinc-800/60 text-zinc-400 border-white/10" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
              )}>
                {isClosed ? "Закрыт" : "Открыт"}
              </span>
            ) : <span />}
            <button
              onClick={load}
              disabled={loading}
              className="h-8 w-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center hover:bg-white/[0.08] active:scale-95 transition disabled:opacity-40"
            >
              <RefreshCw className={cn("h-3.5 w-3.5 text-zinc-400", loading && "animate-spin")} />
            </button>
          </div>

          {/* Messages — flex-1 with min-h-0 allows proper shrinking */}
          <div
            ref={scrollRef}
            className="flex-1 min-h-0 rounded-2xl border border-white/[0.06] bg-zinc-950/40 p-3 mb-2 space-y-2 overflow-y-auto custom-scrollbar"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {loading && !data ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-saccent-500" />
              </div>
            ) : err && !data ? (
              <div className="rounded-xl bg-saccent-500/10 border border-saccent-500/30 p-3 text-xs text-saccent-200 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{err}</span>
              </div>
            ) : data?.messages?.length === 0 ? (
              <div className="text-center text-xs text-zinc-500 py-8">Сообщений пока нет</div>
            ) : (
              data?.messages?.map((m) => {
                const isClient = m.authorType === "client";
                return (
                  <div key={m.id} className={cn("flex", isClient ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[80%] rounded-2xl px-3 py-2",
                      isClient
                        ? "bg-saccent-500/[0.12] border border-saccent-500/20"
                        : "bg-zinc-800/60 border border-white/[0.06]",
                    )}>
                      {m.content && <p className="text-sm text-zinc-100 whitespace-pre-wrap break-words">{m.content}</p>}
                      {m.attachments && m.attachments.length > 0 && (
                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                          {m.attachments.map((att, i) => (
                            att.mime.startsWith("image/") ? (
                              <button
                                key={i}
                                onClick={() => setLightboxUrl(att.url)}
                                className="relative block rounded-lg overflow-hidden bg-zinc-950/40 border border-white/10 hover:border-white/30 transition"
                              >
                                <img src={att.url} alt="" className="w-full h-20 object-cover" loading="lazy" />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition">
                                  <ZoomIn className="h-5 w-5 text-white" />
                                </div>
                              </button>
                            ) : (
                              <a
                                key={i}
                                href={att.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block rounded-lg overflow-hidden bg-zinc-950/40 border border-white/10 hover:border-white/30 transition"
                              >
                                <div className="h-20 flex items-center justify-center text-zinc-400">
                                  <ImageIcon className="h-5 w-5" />
                                </div>
                              </a>
                            )
                          ))}
                        </div>
                      )}
                      <p className={cn(
                        "text-[9px] mt-1 tabular-nums",
                        isClient ? "text-saccent-300/70" : "text-zinc-500",
                      )}>
                        {fmtTime(m.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            {err && data && (
              <div className="rounded-xl bg-saccent-500/10 border border-saccent-500/30 p-2.5 text-xs text-saccent-200">{err}</div>
            )}
          </div>

          {/* Reply form or closed notice — shrink-0 keeps it visible */}
          {isClosed ? (
            <div className="shrink-0 rounded-2xl border border-white/[0.06] bg-zinc-950/40 p-3 text-xs text-zinc-400 text-center">
              Тикет закрыт. Напишите новое обращение если нужна дополнительная помощь.
            </div>
          ) : (
            <div className="shrink-0 space-y-2">
              {files.length > 0 && (
                <div className="grid grid-cols-4 gap-1.5">
                  {files.map((f, idx) => (
                    <div key={idx} className="relative rounded-xl border border-white/[0.06] bg-zinc-950/60 p-1.5 flex flex-col items-center gap-0.5">
                      <ImageIcon className="h-4 w-4 text-zinc-400" />
                      <p className="text-[8px] text-zinc-500 truncate w-full text-center">{f.name}</p>
                      <button
                        onClick={() => removeFile(idx)}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-saccent-500 flex items-center justify-center shadow-md"
                      >
                        <XIcon className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-end gap-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => pickFiles(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={files.length >= MAX_FILES || sending}
                  className="h-10 w-10 rounded-xl border border-white/[0.08] bg-zinc-950/60 hover:bg-zinc-900/80 flex items-center justify-center text-zinc-400 hover:text-zinc-200 disabled:opacity-40 transition shrink-0"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!sending) send();
                    }
                  }}
                  placeholder="Сообщение…"
                  rows={1}
                  className="flex-1 min-h-[40px] max-h-20 rounded-xl bg-zinc-950/60 border border-white/[0.08] px-3 py-2.5 text-sm placeholder-zinc-500 outline-none focus:border-saccent-500/40 transition resize-none custom-scrollbar"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || (!reply.trim() && files.length === 0)}
                  className="h-10 w-10 rounded-xl bg-gradient-to-b from-saccent-500 via-saccent-600 to-saccent-600 hover:from-saccent-600 hover:via-saccent-700 hover:to-saccent-700 shadow-[0_0_20px_-4px_rgb(var(--stealth-accent)_/_0.5),inset_0_1px_0_rgba(255,255,255,0.2)] flex items-center justify-center text-white disabled:opacity-40 disabled:shadow-none transition shrink-0"
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </StealthModal>
    </>
  );
}
