'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { format, subDays } from 'date-fns'
import {
  Scale, Flame, Beef, TrendingDown, TrendingUp,
  ClipboardList, Camera, Minus, CheckCircle2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  calculateBMR,
  calculateMaintenanceCalories,
  calculateTargetCalories,
  calculateProteinTarget,
  kgToLbs,
} from '@/lib/calculations'
import { getSavageMessage } from '@/lib/savage'
import type { UserProfile, DailyEntry } from '@/lib/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined) return '—'
  return Number(n.toFixed(decimals)).toString()
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [profile,       setProfile]       = useState<UserProfile | null>(null)
  const [todayEntry,    setTodayEntry]    = useState<DailyEntry | null>(null)
  const [recentEntries, setRecentEntries] = useState<DailyEntry[]>([])
  const [loading,       setLoading]       = useState(true)
  const [greeting,      setGreeting]      = useState<string | null>(null)

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const todayLabel = format(new Date(), 'EEEE, MMMM d')

  useEffect(() => {
    async function load() {
      const { data: pd } = await supabase.from('user_profile').select().limit(1).maybeSingle()
      const p = pd as UserProfile | null
      setProfile(p)

      if (!p) { setLoading(false); return }

      if (p.savage_mode) setGreeting(getSavageMessage('greeting'))

      // Today's entry
      const { data: td } = await supabase
        .from('daily_entries').select().eq('date', todayStr).maybeSingle()
      setTodayEntry(td as DailyEntry | null)

      // Last 8 days for rolling average (need 8 to get 7-day avg including today)
      const since = format(subDays(new Date(), 8), 'yyyy-MM-dd')
      const { data: rd } = await supabase
        .from('daily_entries')
        .select()
        .gte('date', since)
        .order('date', { ascending: true })
      setRecentEntries((rd as DailyEntry[] | null) ?? [])

      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Derived stats ──────────────────────────────────────────────────────────

  const imp = profile?.preferred_units === 'imperial'
  const wUnit = imp ? 'lbs' : 'kg'

  const todayWeightKg   = todayEntry?.body_weight_kg ?? null
  const todayWeightDisp = todayWeightKg ? (imp ? kgToLbs(todayWeightKg) : todayWeightKg) : null

  const weighedDays = recentEntries.filter(e => e.body_weight_kg && e.body_weight_kg > 0)

  const avgWeightKg = weighedDays.length
    ? weighedDays.reduce((s, e) => s + (e.body_weight_kg ?? 0), 0) / weighedDays.length
    : null
  const avgWeightDisp = avgWeightKg ? (imp ? kgToLbs(avgWeightKg) : avgWeightKg) : null

  // Weight change: most recent vs 7 days ago (in display units)
  const weightDeltaKg = weighedDays.length >= 2
    ? (weighedDays[weighedDays.length - 1].body_weight_kg ?? 0) - (weighedDays[0].body_weight_kg ?? 0)
    : null
  const weightDeltaDisp = weightDeltaKg !== null ? (imp ? kgToLbs(Math.abs(weightDeltaKg)) : Math.abs(weightDeltaKg)) : null
  const weightTrend = weightDeltaKg === null ? null : weightDeltaKg < -0.05 ? 'down' : weightDeltaKg > 0.05 ? 'up' : 'flat'

  const targets = useMemo(() => {
    if (!profile) return null
    const weightKg = todayWeightKg ?? profile.current_weight_kg
    const jj   = todayEntry?.jiu_jitsu_sessions ?? 0
    const lift = todayEntry?.lifting_sessions    ?? 0
    const bmr         = calculateBMR(weightKg, profile.height_cm, profile.age, profile.sex)
    const maintenance = calculateMaintenanceCalories(bmr, profile.activity_baseline, jj, lift)
    const target      = calculateTargetCalories(maintenance, profile.goal_type, profile.goal_calorie_offset)
    const protein_g   = calculateProteinTarget(weightKg, profile.goal_type, profile.goal_weight_kg)
    return { target, protein_g }
  }, [profile, todayWeightKg, todayEntry])

  const checkedInToday = todayEntry !== null
  const goalLabel: Record<string, string> = {
    fat_loss: 'Fat Loss', maintenance: 'Maintenance', lean_gain: 'Lean Gain', performance: 'Performance',
  }

  // ─── Loading skeleton ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="px-4 py-6 lg:px-8 max-w-5xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-neutral-800 rounded w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-24 bg-neutral-900 rounded-xl" />)}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="h-16 bg-neutral-900 rounded-xl" />
          <div className="h-16 bg-neutral-900 rounded-xl" />
        </div>
      </div>
    )
  }

  // ─── No profile ────────────────────────────────────────────────────────────

  if (!profile) {
    return (
      <div className="px-4 py-6 lg:px-8 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-neutral-500 text-sm mt-0.5">{todayLabel}</p>
        </div>
        <div className="bg-neutral-900 border border-emerald-500/20 rounded-xl p-6">
          <p className="text-white font-semibold mb-1">Welcome to LeanLog</p>
          <p className="text-neutral-400 text-sm mb-5">
            Set up your profile once and the app calculates your BMR, calorie targets, and macros automatically.
          </p>
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            Set Up Profile →
          </Link>
        </div>
      </div>
    )
  }

  // ─── Main dashboard ────────────────────────────────────────────────────────

  return (
    <div className="px-4 py-6 lg:px-8 max-w-5xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-neutral-500 text-sm mt-0.5">{todayLabel}</p>
      </div>

      {/* Savage greeting */}
      {greeting && (
        <div className="mb-4 bg-neutral-900 border border-red-500/20 rounded-xl px-4 py-3">
          <p className="text-sm text-neutral-400 italic">&ldquo;{greeting}&rdquo;</p>
        </div>
      )}

      {/* Check-in banner */}
      {!checkedInToday && (
        <Link
          href="/check-in"
          className="flex items-center justify-between mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3.5 hover:bg-emerald-500/15 transition-colors"
        >
          <div>
            <p className="text-sm font-semibold text-emerald-400">No check-in yet today</p>
            <p className="text-xs text-neutral-500 mt-0.5">Log your weight and yesterday&apos;s intake</p>
          </div>
          <span className="text-emerald-400 text-sm font-medium shrink-0 ml-4">Check In →</span>
        </Link>
      )}
      {checkedInToday && (
        <div className="flex items-center gap-2.5 mb-4 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3">
          <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
          <p className="text-sm text-neutral-400">Checked in today</p>
          <Link href="/check-in" className="ml-auto text-xs text-neutral-600 hover:text-neutral-400 transition-colors">Edit →</Link>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">

        {/* Weight */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Scale size={13} className="text-emerald-400" />
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Weight</p>
          </div>
          <p className="text-2xl font-bold text-white">
            {todayWeightDisp ? fmt(todayWeightDisp) : '—'}
            <span className="text-sm font-normal text-neutral-500 ml-1">{wUnit}</span>
          </p>
          {weightTrend && weightDeltaDisp !== null && (
            <p className={`text-xs mt-1 flex items-center gap-1 ${weightTrend === 'down' ? 'text-emerald-400' : weightTrend === 'up' ? 'text-red-400' : 'text-neutral-500'}`}>
              {weightTrend === 'down' ? <TrendingDown size={11} /> : weightTrend === 'up' ? <TrendingUp size={11} /> : <Minus size={11} />}
              {weightTrend === 'flat' ? 'No change' : `${weightTrend === 'down' ? '−' : '+'}${fmt(weightDeltaDisp)} this week`}
            </p>
          )}
        </div>

        {/* 7-day average */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <TrendingDown size={13} className="text-emerald-400" />
            <p className="text-xs text-neutral-500 uppercase tracking-wide">7-Day Avg</p>
          </div>
          <p className="text-2xl font-bold text-white">
            {avgWeightDisp ? fmt(avgWeightDisp) : '—'}
            <span className="text-sm font-normal text-neutral-500 ml-1">{wUnit}</span>
          </p>
          <p className="text-xs text-neutral-600 mt-1">{weighedDays.length} days logged</p>
        </div>

        {/* Target calories */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Flame size={13} className="text-emerald-400" />
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Target Cals</p>
          </div>
          <p className="text-2xl font-bold text-white">
            {targets ? targets.target.toLocaleString() : '—'}
            <span className="text-sm font-normal text-neutral-500 ml-1">kcal</span>
          </p>
          <p className="text-xs text-neutral-600 mt-1">
            {profile ? goalLabel[profile.goal_type] : '—'}
          </p>
        </div>

        {/* Target protein */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Beef size={13} className="text-emerald-400" />
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Target Protein</p>
          </div>
          <p className="text-2xl font-bold text-white">
            {targets ? targets.protein_g : '—'}
            <span className="text-sm font-normal text-neutral-500 ml-1">g</span>
          </p>
          <p className="text-xs text-neutral-600 mt-1">~1g / lb bodyweight</p>
        </div>
      </div>

      {/* Today's training (if logged) */}
      {todayEntry && (todayEntry.jiu_jitsu_sessions > 0 || todayEntry.lifting_sessions > 0) && (
        <div className="mb-4 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3.5 flex items-center gap-4">
          <p className="text-xs text-neutral-500 uppercase tracking-wide shrink-0">Today</p>
          {todayEntry.jiu_jitsu_sessions > 0 && (
            <span className="text-sm text-white">
              🥋 {todayEntry.jiu_jitsu_sessions}× jiu jitsu
              <span className="text-emerald-400 ml-1.5">+{todayEntry.jiu_jitsu_sessions * 450} kcal</span>
            </span>
          )}
          {todayEntry.lifting_sessions > 0 && (
            <span className="text-sm text-white">
              🏋️ {todayEntry.lifting_sessions}× lifting
              <span className="text-emerald-400 ml-1.5">+{todayEntry.lifting_sessions * 250} kcal</span>
            </span>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/check-in"
          className="flex items-center gap-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl px-5 py-4 transition-colors"
        >
          <ClipboardList size={18} />
          {checkedInToday ? 'Edit Today\'s Check-In' : 'Daily Check-In'}
        </Link>
        <Link
          href="/photos"
          className="flex items-center gap-3 bg-neutral-800 hover:bg-neutral-700 text-white font-semibold rounded-xl px-5 py-4 transition-colors border border-neutral-700"
        >
          <Camera size={18} />
          Progress Photos
        </Link>
      </div>

      {/* Yesterday's recap (if logged) */}
      {(() => {
        const yest = recentEntries.find(e => e.date === format(subDays(new Date(), 1), 'yyyy-MM-dd'))
        if (!yest?.calories) return null
        return (
          <div className="mt-4 bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide mb-3">Yesterday&apos;s Intake</p>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Calories', value: yest.calories?.toLocaleString(), unit: 'kcal' },
                { label: 'Protein',  value: yest.protein_g?.toString(),      unit: 'g'    },
                { label: 'Carbs',    value: yest.carbs_g?.toString(),        unit: 'g'    },
                { label: 'Fat',      value: yest.fat_g?.toString(),          unit: 'g'    },
              ].map(({ label, value, unit }) => (
                <div key={label}>
                  <p className="text-xs text-neutral-600">{label}</p>
                  <p className="text-base font-bold text-white mt-0.5">
                    {value ?? '—'}
                    <span className="text-xs font-normal text-neutral-500 ml-0.5">{unit}</span>
                  </p>
                </div>
              ))}
            </div>
            {yest.is_cheat_meal && (
              <p className="text-xs text-amber-400 mt-2">🍕 Cheat meal</p>
            )}
          </div>
        )
      })()}
    </div>
  )
}
