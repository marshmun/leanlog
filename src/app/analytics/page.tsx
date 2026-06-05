'use client'

import { useState, useEffect, useMemo } from 'react'
import { format, parseISO, subDays } from 'date-fns'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import {
  calculateBMR,
  calculateMaintenanceCalories,
  calculateTargetCalories,
  kgToLbs,
} from '@/lib/calculations'
import type { UserProfile, DailyEntry } from '@/lib/types'

// ─── Period options ────────────────────────────────────────────────────────────

const PERIODS = [
  { label: '7D',  days: 7   },
  { label: '30D', days: 30  },
  { label: '90D', days: 90  },
  { label: 'All', days: 9999 },
] as const
type Period = typeof PERIODS[number]['label']

// ─── Rolling average ───────────────────────────────────────────────────────────

function rollingAvg(values: (number | null)[], window: number): (number | null)[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1).filter((v): v is number => v !== null)
    if (slice.length < 2) return null
    return Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 10) / 10
  })
}

// ─── Custom Recharts tooltip ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DarkTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 shadow-2xl text-left">
      <p className="text-xs text-neutral-400 mb-1.5">{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((item: any) => (
        item.value !== null && item.value !== undefined && (
          <p key={item.dataKey} className="text-xs font-semibold" style={{ color: item.color }}>
            {item.name}: {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
          </p>
        )
      ))}
    </div>
  )
}

// ─── Chart axis style ──────────────────────────────────────────────────────────

const axisStyle = { fill: '#525252', fontSize: 11 }
const gridProps = { strokeDasharray: '3 3', stroke: '#262626' }

// ─── Empty state ───────────────────────────────────────────────────────────────

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-52 flex items-center justify-center">
      <p className="text-neutral-600 text-sm">{message}</p>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function Analytics() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [entries, setEntries] = useState<DailyEntry[]>([])
  const [period,  setPeriod]  = useState<Period>('30D')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: pd } = await supabase.from('user_profile').select().limit(1).maybeSingle()
      setProfile(pd as UserProfile | null)

      const { data: ed } = await supabase
        .from('daily_entries')
        .select()
        .order('date', { ascending: true })
      setEntries((ed as DailyEntry[] | null) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  // ─── Filter by period ──────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const days = PERIODS.find(p => p.label === period)?.days ?? 30
    if (days >= 9999) return entries
    const cutoff = format(subDays(new Date(), days), 'yyyy-MM-dd')
    return entries.filter(e => e.date >= cutoff)
  }, [entries, period])

  // ─── Chart data ────────────────────────────────────────────────────────────

  const imp = profile?.preferred_units === 'imperial'
  const wUnit = imp ? 'lbs' : 'kg'

  // Weight chart
  const weightData = useMemo(() => {
    const rawWeights = filtered.map(e =>
      e.body_weight_kg ? Math.round((imp ? kgToLbs(e.body_weight_kg) : e.body_weight_kg) * 10) / 10 : null
    )
    const avgs = rollingAvg(rawWeights, 7)
    return filtered.map((e, i) => ({
      date:   format(parseISO(e.date), filtered.length <= 14 ? 'MMM d' : filtered.length <= 60 ? 'MMM d' : 'MMM d'),
      weight: rawWeights[i],
      avg:    avgs[i],
    }))
  }, [filtered, imp])

  // Calorie target line (base, no training adjustment since it varies)
  const calTarget = useMemo(() => {
    if (!profile) return null
    const wKg = profile.current_weight_kg
    const bmr = calculateBMR(wKg, profile.height_cm, profile.age, profile.sex)
    const maint = calculateMaintenanceCalories(bmr, profile.activity_baseline)
    return calculateTargetCalories(maint, profile.goal_type, profile.goal_calorie_offset)
  }, [profile])

  // Calories chart
  const calData = useMemo(() =>
    filtered
      .filter(e => e.calories)
      .map(e => ({
        date:     format(parseISO(e.date), 'MMM d'),
        calories: e.calories,
      })),
    [filtered]
  )

  // Macros chart
  const macroData = useMemo(() =>
    filtered
      .filter(e => e.protein_g || e.carbs_g || e.fat_g)
      .map(e => ({
        date:    format(parseISO(e.date), 'MMM d'),
        protein: e.protein_g  ?? null,
        carbs:   e.carbs_g    ?? null,
        fat:     e.fat_g      ?? null,
      })),
    [filtered]
  )

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="px-4 py-6 lg:px-8 max-w-5xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-neutral-800 rounded w-36" />
        {[1, 2, 3].map(i => <div key={i} className="h-72 bg-neutral-900 rounded-xl" />)}
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 py-6 lg:px-8 max-w-5xl mx-auto pb-12">

      {/* Header + period selector */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Analytics</h1>
          <p className="text-neutral-500 text-sm mt-0.5">{filtered.length} entries in view</p>
        </div>
        <div className="flex overflow-hidden rounded-lg border border-neutral-700">
          {PERIODS.map(({ label }) => (
            <button
              key={label}
              onClick={() => setPeriod(label)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                period === label ? 'bg-emerald-500 text-black' : 'bg-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {entries.length === 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center">
          <p className="text-white font-semibold mb-1">No data yet</p>
          <p className="text-neutral-500 text-sm">Complete a few daily check-ins and charts will appear here.</p>
        </div>
      )}

      {/* ── WEIGHT CHART ─────────────────────────────────────────────────── */}
      {entries.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-4">
          <p className="text-sm font-semibold text-white mb-0.5">Weight Trend</p>
          <p className="text-xs text-neutral-500 mb-4">Daily · 7-day rolling average</p>

          {weightData.filter(d => d.weight !== null).length < 2 ? (
            <EmptyChart message="Log weight in at least 2 check-ins to see the trend" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={weightData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis
                  tick={axisStyle}
                  axisLine={false}
                  tickLine={false}
                  domain={['auto', 'auto']}
                  tickFormatter={v => `${v}`}
                  unit={` ${wUnit}`}
                />
                <Tooltip content={<DarkTooltip />} />
                <Legend
                  iconType="line"
                  iconSize={12}
                  wrapperStyle={{ fontSize: 11, color: '#737373', paddingTop: 8 }}
                />
                <Line
                  name={`Weight (${wUnit})`}
                  type="monotone"
                  dataKey="weight"
                  stroke="#34d399"
                  strokeWidth={1.5}
                  dot={{ r: 2.5, fill: '#34d399', strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                  connectNulls={false}
                />
                <Line
                  name="7-Day Avg"
                  type="monotone"
                  dataKey="avg"
                  stroke="#6ee7b7"
                  strokeWidth={2}
                  strokeDasharray="4 2"
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* ── CALORIES CHART ───────────────────────────────────────────────── */}
      {entries.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 mb-4">
          <p className="text-sm font-semibold text-white mb-0.5">Calories</p>
          <p className="text-xs text-neutral-500 mb-4">
            Actual intake{calTarget ? ` · target line: ${calTarget.toLocaleString()} kcal` : ''}
          </p>

          {calData.length < 2 ? (
            <EmptyChart message="Log calories in at least 2 check-ins to see the chart" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={calData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} domain={[0, 'auto']} />
                <Tooltip content={<DarkTooltip />} />
                {calTarget && (
                  <ReferenceLine
                    y={calTarget}
                    stroke="#f59e0b"
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    label={{ value: 'Target', position: 'insideTopRight', fill: '#f59e0b', fontSize: 10 }}
                  />
                )}
                <Bar name="Calories (kcal)" dataKey="calories" fill="#34d399" radius={[3, 3, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* ── MACROS CHART ─────────────────────────────────────────────────── */}
      {entries.length > 0 && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
          <p className="text-sm font-semibold text-white mb-0.5">Macros</p>
          <p className="text-xs text-neutral-500 mb-4">Protein · Carbs · Fat (grams)</p>

          {macroData.length < 2 ? (
            <EmptyChart message="Log macros in at least 2 check-ins to see the chart" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={macroData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" tick={axisStyle} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} domain={[0, 'auto']} unit=" g" />
                <Tooltip content={<DarkTooltip />} />
                <Legend
                  iconType="line"
                  iconSize={12}
                  wrapperStyle={{ fontSize: 11, color: '#737373', paddingTop: 8 }}
                />
                <Line name="Protein" type="monotone" dataKey="protein" stroke="#60a5fa" strokeWidth={2} dot={false} connectNulls={false} />
                <Line name="Carbs"   type="monotone" dataKey="carbs"   stroke="#fbbf24" strokeWidth={2} dot={false} connectNulls={false} />
                <Line name="Fat"     type="monotone" dataKey="fat"     stroke="#fb923c" strokeWidth={2} dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  )
}
