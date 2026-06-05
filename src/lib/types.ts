// ─── Domain types ─────────────────────────────────────────────────────────────

export type GoalType      = 'fat_loss' | 'maintenance' | 'lean_gain' | 'performance'
export type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active'
export type Units         = 'imperial' | 'metric'
export type PhotoType     = 'front' | 'side' | 'back'

export interface UserProfile {
  id:                   string
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
  cheat_meals_per_week: number          // 1 or 2
  created_at:           string
  updated_at:           string
}

export interface DailyEntry {
  id:                  string
  date:                string        // 'YYYY-MM-DD'
  body_weight_kg:      number | null
  calories:            number | null
  protein_g:           number | null
  carbs_g:             number | null
  fat_g:               number | null
  jiu_jitsu_sessions:  number
  lifting_sessions:    number
  is_cheat_meal:       boolean
  notes:               string | null
  created_at:          string
  updated_at:          string
}

export interface ProgressPhoto {
  id:              string
  date:            string
  photo_type:      PhotoType
  storage_path:    string
  body_weight_kg:  number | null
  notes:           string | null
  created_at:      string
}

// ─── Supabase DB type ──────────────────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      user_profile: {
        Row:    UserProfile
        Insert: Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<UserProfile, 'id' | 'created_at' | 'updated_at'>>
      }
      daily_entries: {
        Row:    DailyEntry
        Insert: Omit<DailyEntry, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<DailyEntry, 'id' | 'created_at' | 'updated_at'>>
      }
      progress_photos: {
        Row:    ProgressPhoto
        Insert: Omit<ProgressPhoto, 'id' | 'created_at'>
        Update: Partial<Omit<ProgressPhoto, 'id' | 'created_at'>>
      }
    }
  }
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
  performance:  0,   // overridden by goal_calorie_offset on profile
}

export const ACTIVITY_CALORIE_BOOSTS = {
  jiu_jitsu_session: 450,
  lifting_session:   250,
}
