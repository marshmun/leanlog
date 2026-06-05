import type { ActivityLevel, GoalType } from './types'
import { ACTIVITY_MULTIPLIERS, GOAL_CALORIE_ADJUSTMENTS, ACTIVITY_CALORIE_BOOSTS } from './types'

// ─── BMR + calories ────────────────────────────────────────────────────────────

export function calculateBMR(
  weight_kg: number,
  height_cm: number,
  age: number,
  sex: 'male' | 'female',
): number {
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age
  return Math.round(sex === 'male' ? base + 5 : base - 161)
}

export function calculateMaintenanceCalories(
  bmr: number,
  activity_baseline: ActivityLevel,
  jiu_jitsu_sessions = 0,
  lifting_sessions = 0,
): number {
  const base = bmr * ACTIVITY_MULTIPLIERS[activity_baseline]
  const bonus =
    jiu_jitsu_sessions * ACTIVITY_CALORIE_BOOSTS.jiu_jitsu_session +
    lifting_sessions   * ACTIVITY_CALORIE_BOOSTS.lifting_session
  return Math.round(base + bonus)
}

export function calculateTargetCalories(
  maintenance: number,
  goal_type: GoalType,
  goal_calorie_offset = 0,
): number {
  const adj = goal_type === 'performance'
    ? goal_calorie_offset
    : GOAL_CALORIE_ADJUSTMENTS[goal_type]
  return Math.round(maintenance + adj)
}

// ─── Macros ────────────────────────────────────────────────────────────────────

export function calculateProteinTarget(
  weight_kg: number,
  goal_type: GoalType,
  goal_weight_kg?: number | null,
): number {
  // For fat loss use the lower of current vs goal weight to set protein
  const referenceKg =
    goal_type === 'fat_loss' && goal_weight_kg && goal_weight_kg < weight_kg
      ? goal_weight_kg
      : weight_kg
  return Math.round(referenceKg * 2.20462) // ~1g per lb
}

export function calculateMacroTargets(
  target_calories: number,
  protein_g: number,
): { fat_g: number; carbs_g: number } {
  const fat_g   = Math.round((target_calories * 0.25) / 9) // 25% of cals from fat
  const carbs_g = Math.max(0, Math.round((target_calories - protein_g * 4 - fat_g * 9) / 4))
  return { fat_g, carbs_g }
}

// ─── Unit conversions ──────────────────────────────────────────────────────────

export const lbsToKg     = (lbs: number)              => lbs / 2.20462
export const kgToLbs     = (kg: number)               => kg * 2.20462
export const inchesToCm  = (inches: number)           => inches * 2.54
export const cmToFtIn    = (cm: number): { ft: number; inches: number } => {
  const totalInches = cm / 2.54
  return { ft: Math.floor(totalInches / 12), inches: Math.round(totalInches % 12) }
}
