/**
 * NetworkBg — фон для Stealth-дизайна: сплошная чёрно-серая заливка,
 * без сетки и без красных ambient-пятен (убраны по запросу — фон
 * должен быть однородным).
 */

interface Props {
  /** Оставлены для обратной совместимости вызовов, сейчас не используются. */
  accent?: string;
  opacity?: number;
  flatten?: boolean;
}

export function NetworkBg(_props: Props) {
  return <div className="fixed inset-0 -z-30 bg-[#0a0a0b] pointer-events-none" />;
}
