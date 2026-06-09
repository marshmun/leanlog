'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Camera, User, Flame, Beef, Moon, Footprints } from 'lucide-react'
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

const schema = z.object({
  name:              z.string().optional(),
  sex:               z.enum(['male', 'female']),
  age:               z.coerce.number().int().min(16, 'Must be 16+').max(100),
  height_ft:         z.coerce.number().int().optional(),
  height_in:         z.coerce.number().optional(),
  height_cm_val:     z.coerce.number().optional(),
  current_weight:    z.coerce.number().positive('Enter your weight'),
  goal_weight:       z.coerce.number().optional(),
  goal_type:         z.enum(['fat_loss', 'maintenance', 'lean_gain', 'performance']),
  goal_cal_offset:   z.coerce.number().int().default(0),
  experience_level:  z.enum(['beginner', 'intermediate', 'advanced']),
  training_style:    z.string().optional(),
  activity_baseline: z.enum(['sedentary', 'lightly_active', 'moderately_active', 'very_active']),
  step_goal:         z.coerce.number().int().min(0).default(8000),
  sleep_goal_hours:  z.coerce.number().min(0).max(24).default(7.5),
  preferred_units:   z.enum(['imperial', 'metric']),
  savage_mode:       z.boolean(),
  cheat_meals:       z.number().int().min(1).max(2),
})

type FormValues = {
  name?: string
  sex: 'male' | 'female'
  age: number
  height_ft?: number
  height_in?: number
  height_cm_val?: number
  current_weight: number
  goal_weight?: number
  goal_type: GoalType
  goal_cal_offset?: number
  experience_level: 'beginner' | 'intermediate' | 'advanced'
  training_style?: string
  activity_baseline: ActivityLevel
  step_goal: number
  sleep_goal_hours: number
  preferred_units: Units
  savage_mode: boolean
  cheat_meals: number
}

interface CalcResult {
  bmr: number; maintenance: number; target: number
  protein_g: number; fat_g: number; carbs_g: number
}

// ─── Training style options ────────────────────────────────────────────────────

const TRAINING_STYLES = [
  { value: 'lifting',         label: 'Lifting',          emoji: '🏋️' },
  { value: 'jiu_jitsu',       label: 'Jiu Jitsu',        emoji: '🥋' },
  { value: 'running',         label: 'Running',          emoji: '🏃' },
  { value: 'general_fitness', label: 'General Fitness',  emoji: '💪' },
  { value: 'hybrid',          label: 'Hybrid Athlete',   emoji: '⚡' },
  { value: 'other',           label: 'Other',            emoji: '🎯' },
]

// ─── Small number input ────────────────────────────────────────────────────────

function NumField({
  label, unit, error, ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; unit?: string; error?: string }) {
  return (
    <div>
      {label && <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1.5">{label}</p>}
      <div className="relative">
        <input
          type="number" step="any"
          className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors placeholder-neutral-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          {...props}
        />
        {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 text-xs pointer-events-none">{unit}</span>}
      </div>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  )
}

// ─── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-white mb-5">{title}</h2>
      {children}
    </section>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function Profile() {
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [profileId,      setProfileId]      = useState<string | null>(null)
  const [avatarUrl,      setAvatarUrl]      = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [result,         setResult]         = useState<CalcResult | null>(null)
  const [savedMsg,       setSavedMsg]       = useState<string | null>(null)
  const [userEmail,      setUserEmail]      = useState<string>('')
  const avatarRef = useRef<HTMLInputElement>(null)

  const {
    register, handleSubmit, watch, setValue,
    formState: { errors },
  } = useForm<FormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema) as any,
    defaultValues: {
      sex: 'male', goal_type: 'fat_loss', goal_cal_offset: 0,
      activity_baseline: 'lightly_active', preferred_units: 'imperial',
      savage_mode: false, cheat_meals: 1,
      height_ft: 5, height_in: 10, height_cm_val: 178,
      experience_level: 'intermediate', training_style: 'lifting',
      step_goal: 8000, sleep_goal_hours: 7.5,
    },
  })

  const units          = watch('preferred_units')
  const goalType       = watch('goal_type')
  const savage         = watch('savage_mode')
  const cheatMeals     = watch('cheat_meals')
  const trainingStyle  = watch('training_style')
  const expLevel       = watch('experience_level')
  const nameVal        = watch('name')

  // ── Load ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserEmail(user.email ?? '')

      const { data } = await supabase.from('user_profile').select().limit(1).maybeSingle()
      const p = data as UserProfile | null

      if (p) {
        setProfileId(p.id)
        if (p.profile_photo_url) setAvatarUrl(p.profile_photo_url)
        const imp = p.preferred_units === 'imperial'
        const { ft, inches } = cmToFtIn(p.height_cm)

        if (p.name)              setValue('name',              p.name)
        setValue('sex',               p.sex)
        setValue('age',               p.age)
        setValue('preferred_units',   p.preferred_units)
        setValue('goal_type',         p.goal_type)
        setValue('goal_cal_offset',   p.goal_calorie_offset)
        setValue('activity_baseline', p.activity_baseline)
        setValue('savage_mode',       p.savage_mode)
        setValue('cheat_meals',       p.cheat_meals_per_week)
        setValue('step_goal',         p.step_goal ?? 8000)
        setValue('sleep_goal_hours',  p.sleep_goal_hours ?? 7.5)
        if (p.experience_level) setValue('experience_level', p.experience_level)
        if (p.training_style)   setValue('training_style',   p.training_style)

        if (imp) {
          setValue('height_ft',      ft)
          setValue('height_in',      inches)
          setValue('current_weight', Math.round(kgToLbs(p.current_weight_kg) * 10) / 10)
          if (p.goal_weight_kg) setValue('goal_weight', Math.round(kgToLbs(p.goal_weight_kg) * 10) / 10)
        } else {
          setValue('height_cm_val',  Math.round(p.height_cm))
          setValue('current_weight', p.current_weight_kg)
          if (p.goal_weight_kg) setValue('goal_weight', p.goal_weight_kg)
        }
      }
      setLoading(false)
    }
    load()
  }, [setValue])

  // ── Avatar upload ─────────────────────────────────────────────────────────────

  async function handleAvatarUpload(file: File) {
    if (!file.type.startsWith('image/')) return
    setUploadingPhoto(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploadingPhoto(false); return }

    const ext  = file.name.split('.').pop() ?? 'jpg'
    const path = `${user.id}/avatar.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadErr) {
      alert(`Photo upload failed: ${uploadErr.message}`)
      setUploadingPhoto(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    // Bust cache with timestamp
    const bustUrl = `${publicUrl}?t=${Date.now()}`
    setAvatarUrl(bustUrl)

    if (profileId) {
      await supabase.from('user_profile').update({ profile_photo_url: bustUrl }).eq('id', profileId)
    }
    setUploadingPhoto(false)
  }

  // ── Submit ────────────────────────────────────────────────────────────────────

  async function onSubmit(values: FormValues) {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    const imp = values.preferred_units === 'imperial'
    const height_cm = imp
      ? inchesToCm((values.height_ft ?? 5) * 12 + (values.height_in ?? 10))
      : (values.height_cm_val ?? 178)

    const current_weight_kg = imp ? lbsToKg(values.current_weight) : values.current_weight
    const goal_weight_kg = values.goal_weight && values.goal_weight > 0
      ? (imp ? lbsToKg(values.goal_weight) : values.goal_weight)
      : null

    const payload = {
      name:                 values.name || null,
      email:                userEmail || null,
      sex:                  values.sex,
      age:                  values.age,
      height_cm,
      current_weight_kg,
      goal_weight_kg,
      goal_type:            values.goal_type,
      goal_calorie_offset:  values.goal_cal_offset ?? 0,
      experience_level:     values.experience_level,
      training_style:       values.training_style || null,
      activity_baseline:    values.activity_baseline,
      step_goal:            values.step_goal,
      sleep_goal_hours:     values.sleep_goal_hours,
      preferred_units:      values.preferred_units,
      savage_mode:          values.savage_mode,
      cheat_meals_per_week: values.cheat_meals,
      updated_at:           new Date().toISOString(),
    }

    if (profileId) {
      await supabase.from('user_profile').update(payload).eq('id', profileId)
    } else {
      const { data } = await supabase
        .from('user_profile')
        .insert({ ...payload, user_id: user.id })
        .select().single()
      if (data) setProfileId((data as UserProfile).id)
    }

    const bmr         = calculateBMR(current_weight_kg, height_cm, values.age, values.sex)
    const maintenance = calculateMaintenanceCalories(bmr, values.activity_baseline)
    const target      = calculateTargetCalories(maintenance, values.goal_type, values.goal_cal_offset ?? 0)
    const protein_g   = calculateProteinTarget(current_weight_kg, values.goal_type, goal_weight_kg)
    const { fat_g, carbs_g } = calculateMacroTargets(target, protein_g)

    setResult({ bmr, maintenance, target, protein_g, fat_g, carbs_g })
    setSavedMsg(values.savage_mode ? getSavageMessage('profile_saved') : 'Profile saved.')
    setSaving(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="px-4 py-6 lg:px-8 max-w-2xl mx-auto space-y-4 animate-pulse">
        <div className="h-40 bg-neutral-900 rounded-xl" />
        <div className="h-64 bg-neutral-900 rounded-xl" />
        <div className="h-48 bg-neutral-900 rounded-xl" />
      </div>
    )
  }

  const displayName = nameVal || userEmail || 'Your Profile'
  const goalLabels: Record<string, string> = {
    fat_loss: 'Fat Loss', maintenance: 'Maintenance',
    lean_gain: 'Lean Gain', performance: 'Performance',
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="px-4 py-6 lg:px-8 max-w-2xl mx-auto pb-12">

      {/* ── AVATAR HERO ──────────────────────────────────────────────────── */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 mb-4 flex items-center gap-5">
        {/* Avatar */}
        <div className="relative shrink-0">
          <div
            onClick={() => !uploadingPhoto && avatarRef.current?.click()}
            className="w-20 h-20 rounded-full overflow-hidden bg-neutral-800 border-2 border-neutral-700 cursor-pointer group relative"
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <User size={32} className="text-neutral-600" />
              </div>
            )}
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center">
              {uploadingPhoto ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin opacity-0 group-hover:opacity-100" />
              ) : (
                <Camera size={18} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </div>
          </div>
          {/* Badge */}
          <div className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full p-1">
            <Camera size={10} className="text-black" />
          </div>
          <input
            ref={avatarRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarUpload(f); e.target.value = '' }}
          />
        </div>

        {/* Name + stats */}
        <div className="flex-1 min-w-0">
          <p className="text-xl font-bold text-white truncate">{displayName}</p>
          <p className="text-xs text-neutral-500 mt-0.5 truncate">{userEmail}</p>
          {profileId && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-xs bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                {goalLabels[watch('goal_type')]}
              </span>
              <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded-full capitalize">
                {expLevel}
              </span>
              {trainingStyle && (
                <span className="text-xs bg-neutral-800 text-neutral-400 px-2 py-0.5 rounded-full">
                  {TRAINING_STYLES.find(t => t.value === trainingStyle)?.label ?? trainingStyle}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Saved message */}
      {savedMsg && (
        <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3">
          <p className="text-sm text-emerald-400">{savedMsg}</p>
        </div>
      )}

      {/* ── Your numbers (post-save) ──────────────────────────────────────── */}
      {result && (
        <div className="mb-4 bg-neutral-900 border border-emerald-500/20 rounded-xl p-5">
          <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wide mb-3">Your Numbers</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Flame, label: 'BMR',     value: result.bmr.toLocaleString(),         unit: 'kcal' },
              { icon: Flame, label: 'Target',  value: result.target.toLocaleString(),      unit: 'kcal' },
              { icon: Beef,  label: 'Protein', value: String(result.protein_g),            unit: 'g'    },
              { icon: Flame, label: 'Carbs',   value: String(result.carbs_g),              unit: 'g'    },
              { icon: Flame, label: 'Fat',     value: String(result.fat_g),                unit: 'g'    },
              { icon: Flame, label: 'Maint.',  value: result.maintenance.toLocaleString(), unit: 'kcal' },
            ].map(({ label, value, unit }) => (
              <div key={label} className="bg-neutral-800 rounded-lg px-3 py-2.5">
                <p className="text-xs text-neutral-500">{label}</p>
                <p className="text-base font-bold text-white mt-0.5">
                  {value}<span className="text-xs font-normal text-neutral-500 ml-0.5">{unit}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">

        {/* ── PERSONAL INFO ────────────────────────────────────────────────── */}
        <Section title="Personal Info">
          <div className="space-y-4">
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wide mb-1.5 block">Display Name</label>
              <input
                type="text"
                placeholder="Your name"
                {...register('name')}
                className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 transition-colors placeholder-neutral-600"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wide mb-1.5 block">Email</label>
              <input
                type="email"
                value={userEmail}
                disabled
                className="w-full bg-neutral-800/50 border border-neutral-700/50 rounded-lg px-3 py-2.5 text-neutral-500 text-sm cursor-not-allowed"
              />
              <p className="text-xs text-neutral-700 mt-1">Email is managed through your account settings</p>
            </div>
          </div>
        </Section>

        {/* ── BODY METRICS ────────────────────────────────────────────────── */}
        <Section title="Body Metrics">
          {/* Units toggle — lives here so it affects all display below */}
          <div className="flex items-center justify-between mb-5 p-3 bg-neutral-800 rounded-lg">
            <p className="text-sm text-neutral-300 font-medium">Units</p>
            <div className="flex overflow-hidden rounded-lg border border-neutral-700">
              {([{ value: 'imperial' as Units, label: 'lbs / in' }, { value: 'metric' as Units, label: 'kg / cm' }]).map(({ value, label }) => (
                <button key={value} type="button" onClick={() => setValue('preferred_units', value)}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${units === value ? 'bg-emerald-500 text-black' : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Sex */}
          <div className="mb-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Sex</p>
            <div className="grid grid-cols-2 gap-2">
              {(['male', 'female'] as const).map(s => {
                const active = watch('sex') === s
                return (
                  <label key={s} className="cursor-pointer">
                    <input type="radio" value={s} {...register('sex')} className="sr-only" />
                    <div className={`flex items-center justify-center py-2.5 rounded-lg border text-sm font-medium transition-colors ${active ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-neutral-700 text-neutral-400 hover:border-neutral-600 hover:text-white'}`}>
                      {s === 'male' ? '♂ Male' : '♀ Female'}
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Age */}
          <div className="mb-4">
            <NumField label="Age" unit="yrs" placeholder="30" error={errors.age?.message?.toString()} {...register('age')} />
          </div>

          {/* Height */}
          <div className="mb-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1.5">Height</p>
            {units === 'imperial' ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="relative">
                  <input type="number" placeholder="5" {...register('height_ft')}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 pr-8 text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 text-xs">ft</span>
                </div>
                <div className="relative">
                  <input type="number" placeholder="10" {...register('height_in')}
                    className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 pr-8 text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 text-xs">in</span>
                </div>
              </div>
            ) : (
              <div className="relative">
                <input type="number" placeholder="178" {...register('height_cm_val')}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2.5 pr-10 text-white text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 text-xs">cm</span>
              </div>
            )}
          </div>

          {/* Weight */}
          <div className="grid grid-cols-2 gap-3">
            <NumField
              label={`Current Weight (${units === 'imperial' ? 'lbs' : 'kg'})`}
              placeholder={units === 'imperial' ? '185' : '84'}
              step="0.1"
              error={errors.current_weight?.message?.toString()}
              {...register('current_weight')}
            />
            <NumField
              label={`Goal Weight (${units === 'imperial' ? 'lbs' : 'kg'}) — optional`}
              placeholder={units === 'imperial' ? '175' : '79'}
              step="0.1"
              {...register('goal_weight')}
            />
          </div>
        </Section>

        {/* ── GOALS & EXPERIENCE ───────────────────────────────────────────── */}
        <Section title="Goals & Experience">

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
                    <div className={`flex flex-col p-3 rounded-lg border transition-colors ${active ? 'border-emerald-500 bg-emerald-500/10' : 'border-neutral-700 hover:border-neutral-600'}`}>
                      <span className={`text-sm font-medium ${active ? 'text-emerald-400' : 'text-white'}`}>{label}</span>
                      <span className="text-xs text-neutral-500 mt-0.5">{sub}</span>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {goalType === 'performance' && (
            <div className="mb-5">
              <NumField label="Calorie Offset (e.g. +200 or −150)" placeholder="0" {...register('goal_cal_offset')} />
              <p className="text-xs text-neutral-600 mt-1">Positive = surplus · Negative = deficit</p>
            </div>
          )}

          {/* Experience level */}
          <div className="mb-5">
            <p className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Experience Level</p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'beginner',     label: 'Beginner',     sub: '< 1 yr'  },
                { value: 'intermediate', label: 'Intermediate', sub: '1–3 yrs' },
                { value: 'advanced',     label: 'Advanced',     sub: '3+ yrs'  },
              ] as const).map(({ value, label, sub }) => {
                const active = expLevel === value
                return (
                  <label key={value} className="cursor-pointer">
                    <input type="radio" value={value} {...register('experience_level')} className="sr-only" />
                    <div className={`flex flex-col items-center p-3 rounded-lg border text-center transition-colors ${active ? 'border-emerald-500 bg-emerald-500/10' : 'border-neutral-700 hover:border-neutral-600'}`}>
                      <span className={`text-sm font-medium ${active ? 'text-emerald-400' : 'text-white'}`}>{label}</span>
                      <span className="text-xs text-neutral-500 mt-0.5">{sub}</span>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Training style */}
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Primary Training Style</p>
            <div className="grid grid-cols-3 gap-2">
              {TRAINING_STYLES.map(({ value, label, emoji }) => {
                const active = trainingStyle === value
                return (
                  <label key={value} className="cursor-pointer">
                    <input type="radio" value={value} {...register('training_style')} className="sr-only" />
                    <div className={`flex flex-col items-center p-3 rounded-lg border text-center transition-colors ${active ? 'border-emerald-500 bg-emerald-500/10' : 'border-neutral-700 hover:border-neutral-600'}`}>
                      <span className="text-xl mb-1">{emoji}</span>
                      <span className={`text-xs font-medium leading-tight ${active ? 'text-emerald-400' : 'text-neutral-300'}`}>{label}</span>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
        </Section>

        {/* ── TRAINING & ACTIVITY ──────────────────────────────────────────── */}
        <Section title="Training & Activity">

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
                    <div className={`flex items-center justify-between px-3 py-3 rounded-lg border transition-colors ${active ? 'border-emerald-500 bg-emerald-500/10' : 'border-neutral-700 hover:border-neutral-600'}`}>
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

          {/* Step goal + sleep goal */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wide mb-1.5 flex items-center gap-1 block">
                <Footprints size={11} /> Daily Step Goal
              </label>
              <NumField unit="steps" placeholder="8000" {...register('step_goal')} />
            </div>
            <div>
              <label className="text-xs text-neutral-500 uppercase tracking-wide mb-1.5 flex items-center gap-1 block">
                <Moon size={11} /> Sleep Goal
              </label>
              <NumField unit="hrs" placeholder="7.5" step="0.5" {...register('sleep_goal_hours')} />
            </div>
          </div>

          {/* Cheat meals */}
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Cheat Meals Per Week</p>
            <div className="flex items-center gap-4">
              <div className="flex overflow-hidden rounded-lg border border-neutral-700">
                {([1, 2] as const).map(n => (
                  <button key={n} type="button" onClick={() => setValue('cheat_meals', n)}
                    className={`w-14 py-2.5 text-sm font-semibold transition-colors ${cheatMeals === n ? 'bg-emerald-500 text-black' : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-neutral-500">Tracked at daily check-in</p>
            </div>
          </div>
        </Section>

        {/* ── APP SETTINGS ────────────────────────────────────────────────── */}
        <Section title="App Settings">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white font-medium">Savage Mode 💀</p>
              <p className="text-xs text-neutral-500 mt-0.5">
                {savage ? 'Enabled — you asked for this.' : 'Rude, hilarious, brutally honest encouragement'}
              </p>
            </div>
            <button type="button" onClick={() => setValue('savage_mode', !savage)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors ${savage ? 'bg-red-500' : 'bg-neutral-700'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${savage ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
          {savage && (
            <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
              <p className="text-xs text-red-400 italic">&ldquo;You&apos;re about to get a reality check with every check-in. Don&apos;t come crying later.&rdquo;</p>
            </div>
          )}
        </Section>

        <button type="submit" disabled={saving}
          className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold rounded-xl py-3.5 text-sm transition-colors"
        >
          {saving ? 'Saving…' : profileId ? 'Save Changes' : 'Create Profile'}
        </button>
      </form>
    </div>
  )
}
