'use client'

import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Link from 'next/link'
import { format, subDays, startOfISOWeek } from 'date-fns'
import { CheckCircle, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  calculateBMR,
  calculateMaintenanceCalories,
  calculateTargetCalories,
  calculateProteinTarget,
  calculateMacroTargets,
  lbsToKg,
  kgToLbs,
} from '@/lib/calculations'
import { getSavageMessage } from '@/lib/savage'
import type { UserProfile, DailyEntry } from '@/lib/types'

// ─── Schema ────────────────────────────────────────────────────────────────────

const schema = z.object({
  weight:        z.coerce.number().optional(),
  calories:      z.coerce.number().optional(),
  protein_g:     z.coerce.number().optional(),
  carbs_g:       z.coerce.number().optional(),
  fat_g:         z.coerce.number().optional(),
  jiu_jitsu:     z.number().int().min(0).max(3),
  lifting:       z.number().int().min(0).max(3),
  is_cheat_meal: z.boolean(),
  notes:         z.string().optional(),
})

type FormValues = {
  weight?:        number
  calories?:      number
  protein_g?:     number
  carbs_g?:       number
  fat_g?:         number
  jiu_jitsu:      number
  lifting:        number
  is_cheat_meal:  boolean
  notes?:         string
}

// ─── Session picker component ─────────────────────────────────────────────────

function SessionPicker({
  label,
  sub,
  value,
  max,
  onChange,
}: {
  label: string
  sub: string
  value: number
  max: number
  onChange: (n: number) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-neutral-600">{sub}</p>
      </div>
      <div className="flex overflow-hidden rounded-lg border border-neutral-700">
        {Array.from({ length: max + 1 }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            className={`w-10 py-2 text-sm font-semibold transition-colors ${
              value === i
                ? 'bg-emerald-500 text-black'
                : 'bg-neutral-800 text-neutral-500 hover:text-white'
            }`}
          >
            {i}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function CheckIn() {
  const [profile,          setProfile]         = useState<UserProfile | null>(null)
  const [loading,          setLoading]          = useState(true)
  const [saving,           setSaving]           = useState(false)
  const [done,             setDone]             = useState(false)
  const [todayId,          setTodayId]          = useState<string | null>(null)
  const [yesterdayId,      setYesterdayId]      = useState<string | null>(null)
  const [cheatMealsUsed,   setCheatMealsUsed]   = useState(0)
  const [savedMsg,         setSavedMsg]         = useState<string | null>(null)

  const todayStr     = format(new Date(), 'yyyy-MM-dd')
  const yesterdayStr = format(subDays(new Date(), 1), 'yyyy-MM-dd')
  const todayLabel   = format(new Date(), 'EEE, MMM d')
  const yestLabel    = format(subDays(new Date(), 1), 'EEE, MMM d')

  const {
    register,
    handleSubmit,
    watch,
    setValue,
  } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: { jiu_jitsu: 0, lifting: 0, is_cheat_meal: false },
  })

  const jiuJitsu    = watch('jiu_jitsu')
  const lifting     = watch('lifting')
  const weightInput = watch('weight')
  const isCheatMeal = watch('is_cheat_meal')

  // ── Load ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const { data: pd } = await supabase.from('user_profile').select().limit(1).maybeSingle()
      const p = pd as UserProfile | null
      setProfile(p)
      if (!p) { setLoading(false); return }

      // Today's entry (weight + training)
      const { data: td } = await supabase.from('daily_entries').select().eq('date', todayStr).maybeSingle()
      const te = td as DailyEntry | null
      if (te) {
        setTodayId(te.id)
        if (te.body_weight_kg) {
          const w = p.preferred_units === 'imperial'
            ? Math.round(kgToLbs(te.body_weight_kg) * 10) / 10
            : te.body_weight_kg
          setValue('weight', w)
        }
        setValue('jiu_jitsu', te.jiu_jitsu_sessions)
        setValue('lifting',   te.lifting_sessions)
      }

      // Yesterday's entry (macros)
      const { data: yd } = await supabase.from('daily_entries').select().eq('date', yesterdayStr).maybeSingle()
      const ye = yd as DailyEntry | null
      if (ye) {
        setYesterdayId(ye.id)
        if (ye.calories)   setValue('calories',   ye.calories)
        if (ye.protein_g)  setValue('protein_g',  ye.protein_g)
        if (ye.carbs_g)    setValue('carbs_g',    ye.carbs_g)
        if (ye.fat_g)      setValue('fat_g',      ye.fat_g)
        setValue('is_cheat_meal', ye.is_cheat_meal)
      }

      // Cheat meals used this week (excluding yesterday — user may toggle)
      const weekStart = format(startOfISOWeek(new Date()), 'yyyy-MM-dd')
      const { data: wd } = await supabase
        .from('daily_entries')
        .select('is_cheat_meal')
        .gte('date', weekStart)
        .lt('date', yesterdayStr)
      const used = (wd as Array<{ is_cheat_meal: boolean }> | null)?.filter(e => e.is_cheat_meal).length ?? 0
      setCheatMealsUsed(used)

      setLoading(false)
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Live targets ──────────────────────────────────────────────────────────────

  const targets = useMemo(() => {
    if (!profile) return null
    const imp = profile.preferred_units === 'imperial'
    const weight_kg = weightInput && weightInput > 0
      ? (imp ? lbsToKg(weightInput) : weightInput)
      : profile.current_weight_kg
    const bmr         = calculateBMR(weight_kg, profile.height_cm, profile.age, profile.sex)
    const maintenance = calculateMaintenanceCalories(bmr, profile.activity_baseline, jiuJitsu, lifting)
    const target      = calculateTargetCalories(maintenance, profile.goal_type, profile.goal_calorie_offset)
    const protein_g   = calculateProteinTarget(weight_kg, profile.goal_type, profile.goal_weight_kg)
    const { fat_g, carbs_g } = calculateMacroTargets(target, protein_g)
    return { target, protein_g, fat_g, carbs_g }
  }, [profile, jiuJitsu, lifting, weightInput])

  // ── Submit ────────────────────────────────────────────────────────────────────

  async function onSubmit(values: FormValues) {
    if (!profile) return
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const imp = profile.preferred_units === 'imperial'
    const body_weight_kg = values.weight && values.weight > 0
      ? (imp ? lbsToKg(values.weight) : values.weight)
      : null

    // Today: weight + training
    const todayPayload = {
      date:               todayStr,
      body_weight_kg,
      jiu_jitsu_sessions: values.jiu_jitsu,
      lifting_sessions:   values.lifting,
      updated_at:         new Date().toISOString(),
    }
    if (todayId) {
      await supabase.from('daily_entries').update(todayPayload).eq('id', todayId)
    } else {
      const { data } = await supabase
        .from('daily_entries')
        .insert({ ...todayPayload, user_id: user.id, is_cheat_meal: false })
        .select()
        .single()
      if (data) setTodayId((data as DailyEntry).id)
    }

    // Yesterday: macros + cheat meal
    const cal  = values.calories  && values.calories  > 0 ? values.calories  : null
    const pro  = values.protein_g && values.protein_g > 0 ? values.protein_g : null
    const carb = values.carbs_g   && values.carbs_g   > 0 ? values.carbs_g   : null
    const fat  = values.fat_g     && values.fat_g     > 0 ? values.fat_g     : null

    const yestPayload = {
      date:          yesterdayStr,
      calories:      cal,
      protein_g:     pro,
      carbs_g:       carb,
      fat_g:         fat,
      is_cheat_meal: values.is_cheat_meal,
      notes:         values.notes || null,
      updated_at:    new Date().toISOString(),
    }
    if (yesterdayId) {
      await supabase.from('daily_entries').update(yestPayload).eq('id', yesterdayId)
    } else if (cal || pro || carb || fat || values.is_cheat_meal || values.notes) {
      const { data } = await supabase
        .from('daily_entries')
        .insert({ ...yestPayload, user_id: user.id, jiu_jitsu_sessions: 0, lifting_sessions: 0 })
        .select()
        .single()
      if (data) setYesterdayId((data as DailyEntry).id)
    }

    setSavedMsg(
      profile.savage_mode ? getSavageMessage('checkin_complete') : 'Check-in saved. Good work.'
    )
    setDone(true)
    setSaving(false)
  }

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="px-4 py-6 lg:px-8 max-w-5xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-neutral-800 rounded w-40" />
        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-4">
            <div className="h-28 bg-neutral-900 rounded-xl" />
            <div className="h-56 bg-neutral-900 rounded-xl" />
            <div className="h-36 bg-neutral-900 rounded-xl" />
          </div>
          <div className="lg:col-span-2 h-64 bg-neutral-900 rounded-xl" />
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="px-4 py-6 lg:px-8 max-w-2xl mx-auto">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-8 text-center">
          <p className="text-white font-semibold mb-2">Set up your profile first</p>
          <p className="text-neutral-500 text-sm mb-5">
            LeanLog needs your body metrics and goals before it can calculate your targets.
          </p>
          <Link
            href="/settings"
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
          >
            Go to Settings <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    )
  }

  const cheatAllowance = profile.cheat_meals_per_week
  const weightUnit     = profile.preferred_units === 'imperial' ? 'lbs' : 'kg'
  const activityBonus  = jiuJitsu * 450 + lifting * 250

  return (
    <div className="px-4 py-6 lg:px-8 max-w-5xl mx-auto">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Daily Check-In</h1>
        <p className="text-neutral-500 text-sm mt-0.5">{todayLabel}</p>
      </div>

      {/* Saved banner */}
      {done && savedMsg && (
        <div className="mb-4 flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3">
          <CheckCircle size={15} className="text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-sm text-emerald-400">{savedMsg}</p>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-5 lg:gap-6 lg:items-start">

        {/* ── FORM ────────────────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit(onSubmit)} className="lg:col-span-3 space-y-4">

          {/* Morning weight */}
          <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3">
              Morning Weigh-In <span className="text-neutral-600 font-normal">· {todayLabel}</span>
            </h2>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                placeholder={profile.preferred_units === 'imperial' ? '185.4' : '84.1'}
                {...register('weight')}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-4 py-3.5 pr-14 text-white text-2xl font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors placeholder-neutral-800"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 text-sm font-medium">{weightUnit}</span>
            </div>
          </section>

          {/* Yesterday's macros */}
          <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">
              Yesterday&apos;s Intake <span className="text-neutral-600 font-normal">· {yestLabel}</span>
            </h2>

            {/* Calories */}
            <div className="mb-3">
              <label className="block text-xs text-neutral-500 uppercase tracking-wide mb-1.5">Calories</label>
              <div className="relative">
                <input
                  type="number"
                  placeholder="2400"
                  {...register('calories')}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 pr-14 text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors placeholder-neutral-700"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 text-xs">kcal</span>
              </div>
            </div>

            {/* Macros grid */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {([
                { name: 'protein_g' as const, label: 'Protein', placeholder: '180' },
                { name: 'carbs_g'   as const, label: 'Carbs',   placeholder: '240' },
                { name: 'fat_g'     as const, label: 'Fat',     placeholder: '70'  },
              ]).map(({ name, label, placeholder }) => (
                <div key={name}>
                  <label className="block text-xs text-neutral-500 mb-1.5">
                    {label} <span className="text-neutral-700">(g)</span>
                  </label>
                  <input
                    type="number"
                    placeholder={placeholder}
                    {...register(name)}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors placeholder-neutral-700"
                  />
                </div>
              ))}
            </div>

            {/* Cheat meal toggle */}
            <button
              type="button"
              onClick={() => {
                if (!isCheatMeal && cheatMealsUsed >= cheatAllowance) return
                setValue('is_cheat_meal', !isCheatMeal)
              }}
              className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors ${
                isCheatMeal
                  ? 'border-amber-500/60 bg-amber-500/10'
                  : cheatMealsUsed >= cheatAllowance
                  ? 'border-neutral-800 opacity-50 cursor-not-allowed'
                  : 'border-neutral-700 hover:border-neutral-600'
              }`}
            >
              <div className="text-left">
                <p className={`text-sm font-medium ${isCheatMeal ? 'text-amber-400' : 'text-neutral-300'}`}>
                  Cheat meal day 🍕
                </p>
                <p className="text-xs text-neutral-600 mt-0.5">
                  {cheatMealsUsed + (isCheatMeal ? 1 : 0)}/{cheatAllowance} used this week
                  {!isCheatMeal && cheatMealsUsed >= cheatAllowance ? ' · allowance used up' : ''}
                </p>
              </div>
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                isCheatMeal ? 'bg-amber-500 border-amber-500' : 'border-neutral-600'
              }`}>
                {isCheatMeal && (
                  <svg className="w-3 h-3 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </button>
          </section>

          {/* Today's training */}
          <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-4">
              Today&apos;s Training <span className="text-neutral-600 font-normal">· {todayLabel}</span>
            </h2>
            <div className="space-y-3">
              <SessionPicker
                label="Jiu Jitsu"
                sub="+450 kcal per session"
                value={jiuJitsu}
                max={3}
                onChange={(n) => setValue('jiu_jitsu', n)}
              />
              <SessionPicker
                label="Lifting"
                sub="+250 kcal per session"
                value={lifting}
                max={2}
                onChange={(n) => setValue('lifting', n)}
              />
            </div>
            {activityBonus > 0 && (
              <p className="text-xs text-emerald-400 mt-3 font-medium">
                +{activityBonus.toLocaleString()} kcal added to today&apos;s target
              </p>
            )}
          </section>

          {/* Notes */}
          <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-3">
              Notes <span className="text-neutral-600 font-normal">(optional)</span>
            </h2>
            <textarea
              {...register('notes')}
              rows={3}
              placeholder="Sleep quality, how training felt, anything notable..."
              className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors placeholder-neutral-700"
            />
          </section>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded-xl py-4 text-sm transition-colors"
          >
            {saving ? 'Saving...' : done ? 'Update Check-In' : 'Save Check-In'}
          </button>
        </form>

        {/* ── TARGETS SIDEBAR ─────────────────────────────────────────────── */}
        <div className="lg:col-span-2 mt-4 lg:mt-0">
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 lg:sticky lg:top-6">
            <p className="text-sm font-semibold text-white mb-0.5">Today&apos;s Targets</p>
            <p className="text-xs text-neutral-600 mb-5">Updates live as you adjust training</p>

            {targets ? (
              <div className="space-y-1">
                {/* Big calorie number */}
                <div className="bg-neutral-800 rounded-xl px-4 py-4 mb-4 text-center">
                  <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">Calories</p>
                  <p className="text-4xl font-bold text-white">
                    {targets.target.toLocaleString()}
                    <span className="text-base font-normal text-neutral-500 ml-1">kcal</span>
                  </p>
                </div>

                {/* Macros */}
                {[
                  { label: 'Protein', value: targets.protein_g, unit: 'g', bar: 'bg-blue-500'   },
                  { label: 'Carbs',   value: targets.carbs_g,   unit: 'g', bar: 'bg-yellow-500' },
                  { label: 'Fat',     value: targets.fat_g,     unit: 'g', bar: 'bg-orange-500' },
                ].map(({ label, value, unit, bar }) => (
                  <div key={label} className="flex items-center justify-between py-2.5 border-b border-neutral-800 last:border-0">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${bar}`} />
                      <span className="text-sm text-neutral-400">{label}</span>
                    </div>
                    <span className="text-base font-bold text-white">
                      {value}<span className="text-xs font-normal text-neutral-500 ml-0.5">{unit}</span>
                    </span>
                  </div>
                ))}

                {/* Activity breakdown if any */}
                {activityBonus > 0 && (
                  <div className="mt-4 bg-emerald-500/5 border border-emerald-500/15 rounded-lg px-3 py-2.5">
                    <p className="text-xs text-neutral-500 mb-1.5">Training adjustment today</p>
                    {jiuJitsu > 0 && (
                      <p className="text-xs text-emerald-400">+{jiuJitsu * 450} kcal · {jiuJitsu}× jiu jitsu</p>
                    )}
                    {lifting > 0 && (
                      <p className="text-xs text-emerald-400">+{lifting * 250} kcal · {lifting}× lifting</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-neutral-600 text-sm">Set up your profile to see targets.</p>
                <Link href="/settings" className="text-emerald-400 text-sm mt-2 block">Go to Settings →</Link>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
