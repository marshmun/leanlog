// ─── Domain types ─────────────────────────────────────────────────────────────

export type GoalType        = 'fat_loss' | 'maintenance' | 'lean_gain' | 'performance'
export type ActivityLevel   = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active'
export type Units           = 'imperial' | 'metric'
export type PhotoType       = 'front' | 'side' | 'back'
export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced'
export type Intensity       = 'very_easy' | 'easy' | 'moderate' | 'hard' | 'very_hard'

export interface UserProfile {
  id:                   string
  user_id:              string
  sex:                  'male' | 'female'
  age:                  number
  height_cm:            number
  current_weight_kg:    number
  goal_weight_kg:       number | null
  goal_type:            GoalType
  goal_calorie_offset:  number
  activity_baseline:    ActivityLevel
  preferred_units:      Units
  savage_mode:          boolean
  cheat_meals_per_week: number
  // v2 fields
  name:                 string | null
  email:                string | null
  profile_photo_url:    string | null
  experience_level:     ExperienceLevel | null
  training_style:       string[] | null
  step_goal:            number
  sleep_goal_hours:     number
  created_at:           string
  updated_at:           string
}

export interface DailyEntry {
  id:                   string
  user_id:              string
  date:                 string        // 'YYYY-MM-DD'
  body_weight_kg:       number | null
  calories:             number | null
  protein_g:            number | null
  carbs_g:              number | null
  fat_g:                number | null
  jiu_jitsu_sessions:   number
  lifting_sessions:     number
  is_cheat_meal:        boolean
  notes:                string | null
  // v2 fields
  steps:                number | null
  sleep_duration_hours: number | null
  sleep_quality:        number | null  // 1-5
  mood:                 number | null  // 1-5
  energy:               number | null  // 1-5
  hunger:               number | null  // 1-5
  stress:               number | null  // 1-5
  soreness:             number | null  // 1-5
  created_at:           string
  updated_at:           string
}

export interface ProgressPhoto {
  id:              string
  user_id:         string
  date:            string
  photo_type:      PhotoType
  storage_path:    string
  body_weight_kg:  number | null
  notes:           string | null
  created_at:      string
}

export interface ActivityType {
  id:                  string
  name:                string
  category:            string
  is_system_default:   boolean
  created_by_user_id:  string | null
  created_at:          string
}

export interface ActivityLog {
  id:                       string
  user_id:                  string
  activity_type_id:         string | null
  custom_activity_name:     string | null
  date:                     string
  duration_minutes:         number | null
  intensity:                Intensity | null
  estimated_calories_burned: number | null
  source:                   string
  notes:                    string | null
  created_at:               string
  updated_at:               string
}

// ─── Calculation constants ─────────────────────────────────────────────────────

export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary:          1.2,
  lightly_active:     1.375,
  moderately_active:  1.55,
  very_active:        1.725,
}

export const GOAL_CALORIE_ADJUSTMENTS: Record<GoalType, number> = {
  fat_loss:    -400,
  maintenance:  0,
  lean_gain:   +225,
  performance:  0,
}

export const ACTIVITY_CALORIE_BOOSTS = {
  jiu_jitsu_session: 450,
  lifting_session:   250,
}
