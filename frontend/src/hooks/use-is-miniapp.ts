import { useState } from "react";

/** True когда кабинет открыт внутри Telegram Mini App (Web App) — показываем мобильную версию. */
export function useIsMiniapp(): boolean {
  const [isMiniapp] = useState(() =>
    typeof window !== "undefined" &&
    Boolean((window as { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp?.initData)
  );

  return isMiniapp;
}
