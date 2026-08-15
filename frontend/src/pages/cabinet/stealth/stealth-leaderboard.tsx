/**
 * Stealth Leaderboard — рейтинг рефереров в Stealth стиле.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Trophy, TrendingUp, Award, Medal, Crown, Sparkles, Users } from "lucide-react";
import { useClientAuth } from "@/contexts/client-auth";
import { api, type LeaderboardEntry, type LeaderboardResponse } from "@/lib/api";

function formatMoney(amount: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function getRankIcon(rank: number) {
  if (rank === 1) return <Crown className="h-5 w-5 text-yellow-500" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-slate-400" />;
  if (rank === 3) return <Medal className="h-5 w-5 text-amber-600" />;
  return null;
}

function getRankGradient(rank: number) {
  if (rank === 1) return "from-yellow-500/20 to-amber-600/20 border-yellow-500/30";
  if (rank === 2) return "from-slate-400/20 to-slate-500/20 border-slate-400/30";
  if (rank === 3) return "from-amber-600/20 to-orange-600/20 border-amber-600/30";
  return "from-white/[0.08] to-white/[0.04] border-white/[0.1]";
}

export function StealthLeaderboard() {
  const { state } = useClientAuth();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [currentUser, setCurrentUser] = useState<{ rank: number | null; referralsCount: number; totalEarned: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const token = state.token;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    api
      .getLeaderboard(token, 100)
      .then((res: LeaderboardResponse) => {
        if (cancelled) return;
        setLeaderboard(res.leaderboard);
        setCurrentUser(res.currentUser);
      })
      .catch((e: unknown) => {
        console.error("Failed to load leaderboard:", e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-[#0a0a0a]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 pb-8 px-4 bg-[#0a0a0a] min-h-screen">
      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl border border-white/[0.1] bg-white/[0.04] backdrop-blur-xl p-8"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/[0.1] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-white/[0.08] blur-3xl" />
        <div className="relative flex flex-col items-center gap-4 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-white/20 to-white/10 shadow-xl">
            <Trophy className="h-10 w-10 text-white" />
          </div>
          <div>
            <h1 className="mb-2 text-3xl font-black tracking-tight text-white">Рейтинг рефереров</h1>
            <p className="text-zinc-400 max-w-md mx-auto">
              Топ пользователей по количеству приглашённых друзей. Приглашай больше — зарабатывай больше!
            </p>
          </div>
        </div>
      </motion.div>

      {/* Current User Stats */}
      {currentUser && currentUser.rank && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="relative overflow-hidden border border-white/[0.15] bg-white/[0.06] backdrop-blur-xl rounded-xl p-6 shadow-lg">
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/[0.1] blur-2xl" />
            <div className="relative">
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-white" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Ваша позиция</h2>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <div className="text-3xl font-black text-white">#{currentUser.rank}</div>
                  <div className="text-xs text-zinc-400">Место</div>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-3xl font-black text-white">{currentUser.referralsCount}</div>
                  <div className="text-xs text-zinc-400">Рефералов</div>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-3xl font-black text-emerald-400">{formatMoney(currentUser.totalEarned)} ₽</div>
                  <div className="text-xs text-zinc-400">Заработано</div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Leaderboard List */}
      <div className="space-y-3">
        {leaderboard.length === 0 ? (
          <div className="rounded-xl border border-white/[0.1] bg-white/[0.04] backdrop-blur-xl p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/[0.06]">
              <Users className="h-8 w-8 text-zinc-400" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-white">Рейтинг пока пуст</h3>
            <p className="text-sm text-zinc-400">Станьте первым, пригласив друзей!</p>
          </div>
        ) : (
          leaderboard.map((entry, index) => (
            <motion.div
              key={entry.rank}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * index }}
            >
              <div
                className={`relative overflow-hidden border bg-gradient-to-r backdrop-blur-xl rounded-xl p-5 transition-all hover:shadow-lg ${
                  entry.rank <= 3 ? getRankGradient(entry.rank) : "border-white/[0.1] hover:border-white/[0.15] bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center gap-4">
                  {/* Rank Badge */}
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center">
                    {entry.rank <= 3 ? (
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/[0.08] backdrop-blur-sm">
                        {getRankIcon(entry.rank)}
                      </div>
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/[0.06] text-xl font-black text-zinc-400">
                        {entry.rank}
                      </div>
                    )}
                  </div>

                  {/* User Info */}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <h3 className="truncate text-lg font-bold text-white">{entry.displayName}</h3>
                      {entry.rank === 1 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs font-bold text-yellow-400">
                          <Award className="h-3 w-3" />
                          Лидер
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-400">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-4 w-4 shrink-0" />
                        <span className="font-semibold text-white">{entry.referralsCount}</span> рефералов
                      </span>
                      <span className="flex items-center gap-1.5">
                        <TrendingUp className="h-4 w-4 shrink-0 text-emerald-400" />
                        <span className="font-semibold text-emerald-400">{formatMoney(entry.totalEarned)} ₽</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
