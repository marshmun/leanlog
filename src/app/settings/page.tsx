'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import {
  calculateBMR,
  calculateMaintenanceCalories,
  calculateTargetCalories,
  calculateProteinTarget,
  calculateMacroTargets,
  lbsToKg,
  kgToLbs,
  inchesToCm,
  cmToFtIn,
} from '@/lib/calculations'
import { getSavageMessage } from '@/lib/savage'
import type { UserProfile, GoalType, ActivityLevel, Units } from '@/lib/types'

// ─── Schema ────────────────────────────────────────────────────────────────────
// Using z.coerce.number() so HTML string inputs are auto-converted.
// Optional number fields: empty string → 0 → we treat 0 as "not set" in onSubmit.

const schema = z.object({
  sex:               z.enum(['male', 'female']),
  age:               z.coerce.number().int().min(16, 'Must be 16+').max(100),
  height_ft:         z.coerce.number().int().optional(),
  height_in:         z.coerce.number().optional(),
  height_cm_val:     z.coerce.number().optional(),
  current_weight:    z.coerce.number().positive('Enter your weight'),
  goal_weight:       z.coerce.number().optional(),
  goal_type:         z.enum(['fat_loss', 'maintenance', 'lean_gain', 'performance']),
  goal_cal_offset:   z.coerce.number().int().default(0),
  activity_baseline: z.enum(['sedentary', 'lightly_active', 'moderately_active', 'very_active']),
  preferred_units:   z.enum(['imperial', 'metric']),
  savage_mode:       z.boolean(),
  cheat_meals:       z.number().int().min(1).max(2),
})

// Explicit form type so the resolver cast works cleanly
type FormValues = {
  sex:               'male' | 'female'
  age:               number
  height_ft?:        number
  height_in?:        number
  height_cm_val?:    number
  current_weight:    number
  goal_weight?:      number
  goal_type:         GoalType
  goal_cal_offset?:  number
  activity_baseline: ActivityLevel
  preferred_units:   Units
  savage_mode:       boolean
  cheat_meals:       number
}

interface CalcResult {
  bmr: number; maintenance: number; target: number
  protein_g: number; fat_g: number; carbs_g: number
}

// ─── Small reusable input ──────────────────────────────────────────────────────

function Field({
  label, unit, error, inputRef, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label?: string; unit?: string; error?: string;
  inputRef?: React.Ref<HTMLInputElement>
}) {
  return (
    <div>
      {label && (
        <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1.5">{label}</p>
      )}
      <div className="relative">
        <input
          type="number"
          step="any"
          ref={inputRef}
          className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors placeholder-neutral-600"
          {...props}
        />
        {unit && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 text-xs pointer-events-none">
            {unit}
          </span>
        )}
      </div>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [result,    setResult]    = useState<CalcResult | null>(null)
  const [savedMsg,  setSavedMsg]  = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      sex:               'male',
      goal_type:         'fat_loss',
      goal_cal_offset:   0,
      activity_baseline: 'lightly_active',
      preferred_units:   'imperial',
      savage_mode:       false,
      cheat_meals:       1,
      height_ft:         5,
      height_in:         10,
      height_cm_val:     178,
    },
  })

  const units      = watch('preferred_units')
  const goalType   = watch('goal_type')
  const savage     = watch('savage_mode')
  const cheatMeals = watch('cheat_meals')

  // ── Load profile ─────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('user_profile').select().limit(1).maybeSingle()
      const profile = data as UserProfile | null

      if (profile) {
        setProfileId(profile.id)
        const imp = profile.preferred_units === 'imperial'
        const { ft, inches } = cmToFtIn(profile.height_cm)

        setValue('sex',               profile.sex)
        setValue('age',               profile.age)
        setValue('preferred_units',   profile.preferred_units)
        setValue('goal_type',         profile.goal_type)
        setValue('goal_cal_offset',   profile.goal_calorie_offset)
        setValue('activity_baseline', profile.activity_baseline)
        setValue('savage_mode',       profile.savage_mode)
        setValue('cheat_meals',       profile.cheat_meals_per_week)

        if (imp) {
          setValue('height_ft',      ft)
          setValue('height_in',      inches)
          setValue('current_weight', Math.round(kgToLbs(profile.current_weight_kg) * 10) / 10)
          if (profile.goal_weight_kg)
            setValue('goal_weight',  Math.round(kgToLbs(profile.goal_weight_kg) * 10) / 10)
        } else {
          setValue('height_cm_val',  Math.round(profile.height_cm))
          setValue('current_weight', profile.current_weight_kg)
          if (profile.goal_weight_kg)
            setValue('goal_weight',  profile.goal_weight_kg)
        }
      }
      setLoading(false)
    }
    load()
  }, [setValue])

  // ── Submit ────────────────────────────────────────────────────────────────────

  async function onSubmit(values: FormValues) {
    setSaving(true)

    const imp = values.preferred_units === 'imperial'

    const height_cm = imp
      ? inchesToCm((values.height_ft ?? 5) * 12 + (values.height_in ?? 10))
      : (values.height_cm_val ?? 178)

    const current_weight_kg = imp ? lbsToKg(values.current_weight) : values.current_weight
    // goal_weight: 0 or falsy means "not set" (empty input coerces to 0)
    const goal_weight_kg = values.goal_weight && values.goal_weight > 0
      ? (imp ? lbsToKg(values.goal_weight) : values.goal_weight)
      : null

    const payload = {
      sex:                  values.sex,
      age:                  values.age,
      height_cm,
      current_weight_kg,
      goal_weight_kg,
      goal_type:            values.goal_type,
      goal_calorie_offset:  values.goal_cal_offset ?? 0,
      activity_baseline:    values.activity_baseline,
      preferred_units:      values.preferred_units,
      savage_mode:          values.savage_mode,
      cheat_meals_per_week: values.cheat_meals,
      updated_at:           new Date().toISOString(),
    }

    if (profileId) {
      await supabase.from('user_profile').update(payload).eq('id', profileId)
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      const { data } = await supabase
        .from('user_profile')
        .insert({ ...payload, user_id: user!.id })
        .select().single()
      const created = data as UserProfile | null
      if (created) setProfileId(created.id)
    }

    // Calculate results to display
    const bmr         = calculateBMR(current_weight_kg, height_cm, values.age, values.sex)
    const maintenance = calculateMaintenanceCalories(bmr, values.activity_baseline)
    const target      = calculateTargetCalories(maintenance, values.goal_type, values.goal_cal_offset ?? 0)
    const protein_g   = calculateProteinTarget(current_weight_kg, values.goal_type, goal_weight_kg)
    const { fat_g, carbs_g } = calculateMacroTargets(target, protein_g)

    setResult({ bmr, maintenance, target, protein_g, fat_g, carbs_g })
    setSavedMsg(values.savage_mode ? getSavageMessage('profile_saved') : 'Profile saved successfully.')
    setSaving(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ─── Loading skeleton ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="px-4 py-6 lg:px-8 max-w-2xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 bg-neutral-800 rounded w-32" />
        <div className="h-64 bg-neutral-900 rounded-xl" />
        <div className="h-48 bg-neutral-900 rounded-xl" />
        <div className="h-32 bg-neutral-900 rounded-xl" />
      </div>
    )
  }

  // ─── Form ──────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 py-6 lg:px-8 max-w-2xl mx-auto pb-12">

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-neutral-500 text-sm mt-0.5">
          {profileId ? 'Update your profile and preferences' : 'Set up your profile to unlock all features'}
        </p>
      </div>

      {/* Saved confirmation */}
      {savedMsg && (
        <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3">
          <p className="text-sm text-emerald-400">{savedMsg}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        {/* ── YOUR METRICS ─────────────────────────────────────────────── */}
        <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-5">Your Metrics</h2>

          {/* Sex toggle */}
          <div className="mb-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Sex</p>
            <div className="grid grid-cols-2 gap-2">
              {(['male', 'female'] as const).map((s) => {
                const active = watch('sex') === s
                return (
                  <label key={s} className="cursor-pointer">
                    <input type="radio" value={s} {...register('sex')} className="sr-only" />
                    <div className={`flex items-center justify-center py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                      active
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                        : 'border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-white'
                    }`}>
                      {s === 'male' ? 'Male' : 'Female'}
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Age */}
          <div className="mb-4">
            <Field
              label="Age"
              unit="yrs"
              placeholder="30"
              error={errors.age?.message?.toString()}
              {...register('age')}
            />
          </div>

          {/* Height — changes based on units */}
          <div className="mb-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1.5">Height</p>
            {units === 'imperial' ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <input
                    type="number"
                    placeholder="5"
                    {...register('height_ft')}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 pr-8 text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 text-xs">ft</span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="10"
                    {...register('height_in')}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 pr-8 text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 text-xs">in</span>
                </div>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="number"
                  placeholder="178"
                  {...register('height_cm_val')}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 pr-10 text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 text-xs">cm</span>
              </div>
            )}
          </div>

          {/* Weights */}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={`Current Weight (${units === 'imperial' ? 'lbs' : 'kg'})`}
              placeholder={units === 'imperial' ? '185' : '84'}
              step="0.1"
              error={errors.current_weight?.message?.toString()}
              {...register('current_weight')}
            />
            <Field
              label={`Goal Weight (${units === 'imperial' ? 'lbs' : 'kg'})`}
              placeholder="Optional"
              step="0.1"
              {...register('goal_weight')}
            />
          </div>
        </section>

        {/* ── TRAINING & GOALS ─────────────────────────────────────────── */}
        <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-5">Training & Goals</h2>

          {/* Goal type */}
          <div className="mb-5">
            <p className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Goal</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: 'fat_loss',    label: 'Fat Loss',    sub: '−400 kcal/day' },
                { value: 'maintenance', label: 'Maintenance', sub: '±0 kcal/day'   },
                { value: 'lean_gain',   label: 'Lean Gain',   sub: '+225 kcal/day' },
                { value: 'performance', label: 'Performance', sub: 'Custom offset'  },
              ] as const).map(({ value, label, sub }) => {
                const active = goalType === value
                return (
                  <label key={value} className="cursor-pointer">
                    <input type="radio" value={value} {...register('goal_type')} className="sr-only" />
                    <div className={`flex flex-col p-3 rounded-lg border transition-colors ${
                      active ? 'border-emerald-500 bg-emerald-500/10' : 'border-neutral-700 hover:border-neutral-600'
                    }`}>
                      <span className={`text-sm font-medium ${active ? 'text-emerald-400' : 'text-white'}`}>{label}</span>
                      <span className="text-xs text-neutral-500 mt-0.5">{sub}</span>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Performance offset (only shows when selected) */}
          {goalType === 'performance' && (
            <div className="mb-5">
              <Field
                label="Calorie Offset (e.g. +200 or −150)"
                placeholder="0"
                {...register('goal_cal_offset')}
              />
              <p className="text-xs text-neutral-600 mt-1">Positive = surplus · Negative = deficit</p>
            </div>
          )}

          {/* Activity baseline */}
          <div className="mb-5">
            <p className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Base Activity Level</p>
            <div className="space-y-2">
              {([
                { value: 'sedentary',         label: 'Sedentary',         sub: 'Desk job, minimal movement',     mult: '×1.2'   },
                { value: 'lightly_active',    label: 'Lightly Active',    sub: 'Light exercise 1–3×/week',       mult: '×1.375' },
                { value: 'moderately_active', label: 'Moderately Active', sub: 'Moderate exercise 3–5×/week',    mult: '×1.55'  },
                { value: 'very_active',       label: 'Very Active',       sub: 'Hard training 6–7×/week',        mult: '×1.725' },
              ] as const).map(({ value, label, sub, mult }) => {
                const active = watch('activity_baseline') === value
                return (
                  <label key={value} className="cursor-pointer block">
                    <input type="radio" value={value} {...register('activity_baseline')} className="sr-only" />
                    <div className={`flex items-center justify-between px-3 py-3 rounded-lg border transition-colors ${
                      active ? 'border-emerald-500 bg-emerald-500/10' : 'border-neutral-700 hover:border-neutral-600'
                    }`}>
                      <div>
                        <span className={`text-sm font-medium ${active ? 'text-emerald-400' : 'text-white'}`}>{label}</span>
                        <span className="block text-xs text-neutral-500 mt-0.5">{sub}</span>
                      </div>
                      <span className="text-xs font-mono text-neutral-500 shrink-0 ml-4">{mult}</span>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Cheat meals */}
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Cheat Meals Per Week</p>
            <div className="flex items-center gap-4">
              <div className="flex overflow-hidden rounded-lg border border-neutral-700">
                {([1, 2] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setValue('cheat_meals', n)}
                    className={`w-14 py-2.5 text-sm font-semibold transition-colors ${
                      cheatMeals === n ? 'bg-emerald-500 text-black' : 'bg-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-neutral-500">
                {cheatMeals === 1 ? 'One per week — tracked at check-in' : 'Two per week — tracked at check-in'}
              </p>
            </div>
          </div>
        </section>

        {/* ── APP SETTINGS ─────────────────────────────────────────────── */}
        <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-5">App Settings</h2>

          {/* Units */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-sm text-white">Units</p>
              <p className="text-xs text-neutral-500 mt-0.5">Pounds & inches or kilograms & cm</p>
            </div>
            <div className="flex overflow-hidden rounded-lg border border-neutral-700">
              {([
                { value: 'imperial' as Units, label: 'lbs' },
                { value: 'metric'   as Units, label: 'kg'  },
              ]).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setValue('preferred_units', value)}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    units === value ? 'bg-emerald-500 text-black' : 'bg-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Savage mode */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white">Savage Mode 💀</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {savage ? 'Enabled — the app will be rude to you. You asked for this.' : 'Rude, hilarious, and brutally honest encouragement'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setValue('savage_mode', !savage)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                savage ? 'bg-red-500' : 'bg-neutral-700'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                savage ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {savage && (
            <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              <p className="text-xs text-red-400 italic">
                &ldquo;You&apos;re about to get a reality check with every check-in. Don&apos;t come crying later.&rdquo;
              </p>
            </div>
          )}
        </section>

        {/* ── SAVE ─────────────────────────────────────────────────────── */}
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded-xl py-3.5 text-sm transition-colors"
        >
          {saving ? 'Saving...' : profileId ? 'Update Profile' : 'Save Profile'}
        </button>
      </form>

      {/* ── RESULTS (shown after save) ──────────────────────────────────── */}
      {result && (
        <div className="mt-6 bg-neutral-900 border border-emerald-500/30 rounded-xl p-5">
          <p className="text-sm font-semibold text-emerald-400 mb-4">Your Numbers</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: 'BMR',          value: result.bmr.toLocaleString(),         unit: 'kcal' },
              { label: 'Maintenance',  value: result.maintenance.toLocaleString(), unit: 'kcal' },
              { label: 'Daily Target', value: result.target.toLocaleString(),      unit: 'kcal' },
              { label: 'Protein',      value: String(result.protein_g),            unit: 'g'    },
              { label: 'Fat',          value: String(result.fat_g),                unit: 'g'    },
              { label: 'Carbs',        value: String(result.carbs_g),              unit: 'g'    },
            ].map(({ label, value, unit }) => (
              <div key={label}>
                <p className="text-xs text-neutral-500 uppercase tracking-wide">{label}</p>
                <p className="text-xl font-bold text-white mt-0.5">
                  {value}
                  <span className="text-sm font-normal text-neutral-500 ml-1">{unit}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
