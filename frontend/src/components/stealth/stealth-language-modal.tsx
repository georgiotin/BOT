/**
 * StealthLanguageModal — выбор языка интерфейса в lightbox-модалке.
 *
 * Тянет список активных языков из api.getPublicConfig().activeLanguages,
 * при выборе сохраняет через api.clientUpdateProfile и обновляет профиль.
 */

import { useEffect, useState } from "react";
import { Check, Loader2, Globe } from "lucide-react";
import { useClientAuth } from "@/contexts/client-auth";
import { api } from "@/lib/api";
import { StealthModal } from "./stealth-modal";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

function langLabel(code: string): string {
  if (code === "ru") return "Русский";
  if (code === "en") return "English";
  return code.toUpperCase();
}

export function StealthLanguageModal({ open, onClose }: Props) {
  const { state, refreshProfile } = useClientAuth();
  const [langs, setLangs] = useState<string[]>(["ru", "en"]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api.getPublicConfig()
      .then((c) => setLangs(c.activeLanguages?.length ? c.activeLanguages : ["ru", "en"]))
      .catch(() => {});
  }, [open]);

  async function pick(code: string) {
    if (!state.token || saving) return;
    setSaving(code);
    try {
      await api.clientUpdateProfile(state.token, { preferredLang: code });
      await refreshProfile();
      onClose();
    } catch {
      // молча игнорируем — пользователь может повторить попытку
    } finally {
      setSaving(null);
    }
  }

  const current = state.client?.preferredLang ?? "ru";

  return (
    <StealthModal open={open} onClose={onClose} title="Язык">
      <div className="space-y-2">
        {langs.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => pick(code)}
            disabled={saving !== null}
            className={cn(
              "w-full flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition disabled:opacity-60",
              code === current
                ? "border-saccent-500/40 bg-saccent-500/10"
                : "border-white/[0.08] bg-zinc-950/40 hover:border-white/15",
            )}
          >
            <div className="h-9 w-9 rounded-lg bg-zinc-800/60 border border-white/10 flex items-center justify-center shrink-0">
              <Globe className="h-4 w-4 text-zinc-300" />
            </div>
            <span className="flex-1 text-sm font-medium">{langLabel(code)}</span>
            {saving === code ? (
              <Loader2 className="h-4 w-4 animate-spin text-saccent-400" />
            ) : code === current ? (
              <Check className="h-4 w-4 text-saccent-400" />
            ) : null}
          </button>
        ))}
      </div>
    </StealthModal>
  );
}
