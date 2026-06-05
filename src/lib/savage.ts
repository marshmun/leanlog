export type SavageContext =
  | 'greeting'
  | 'checkin_complete'
  | 'above_target'
  | 'below_target'
  | 'on_target'
  | 'no_training'
  | 'training_done'
  | 'cheat_meal'
  | 'streak'
  | 'profile_saved'

const pool: Record<SavageContext, string[]> = {
  greeting: [
    "Oh look who showed up. Low bar but here we are.",
    "Back again. Your scale hasn't moved much but your ambition is adorable.",
    "You're here. Your abs are not — but you're here.",
    "Let's see what chaos you're tracking today.",
    "Another day, another chance to not completely blow it.",
  ],
  checkin_complete: [
    "Entry logged. The bare minimum has been achieved. Proud of you.",
    "Look at you, logging numbers like a functional adult. Wild.",
    "Data saved. Now step away from the peanut butter.",
    "Check-in done. Your future self is cautiously optimistic.",
    "Logged. Took ten seconds. You were capable of this all along.",
  ],
  above_target: [
    "You ate how much? Bold strategy. Let's see how that plays out.",
    "Over calories. Classic. Truly your best work today.",
    "Interesting food choices. Very brave. Very caloric.",
    "The pizza didn't count itself but you made it work anyway.",
    "Above target. Again. Incredible consistency in the wrong direction.",
  ],
  below_target: [
    "Under target. Didn't know you had it in you.",
    "Stayed in deficit. Shockingly competent today.",
    "Under calories. Your future abs are cautiously optimistic.",
    "Wow. Discipline. It's almost like you actually want this.",
    "Within target. Low bar but you cleared it. Nice.",
  ],
  on_target: [
    "Exactly on target. Suspiciously precise. I respect it.",
    "Hit the number. You're either disciplined or lucky — either way, take it.",
    "On target. This is what doing the thing looks like.",
  ],
  no_training: [
    "No training logged. Groundbreaking rest day you've got there.",
    "Zero sessions. At least you're consistent at something.",
    "Rest day, huh? The couch appreciates your loyalty.",
    "No training today. That's fine. Totally fine. Everything is fine.",
    "Skipped training. Your opponents are out there, though.",
  ],
  training_done: [
    "You trained. Basic requirement met. Well done, I guess.",
    "Jiu jitsu done. You're still losing to white belts but the gap is closing.",
    "Lifted weights. The iron doesn't care, but it respects the effort.",
    "Training logged. The gains are scared of you. Slightly.",
    "Got the session in. Half the battle was showing up. You did that half.",
  ],
  cheat_meal: [
    "Cheat meal. At least you're honest about the damage.",
    "Used your allowance. Strategic pizza. I respect the commitment.",
    "Cheat meal logged. The calories are real but so is the joy. Live your life.",
    "You used it. Good. Now get back to work tomorrow.",
  ],
  streak: [
    "Multiple days in a row. Someone's serious about this. Suspicious.",
    "Consistent logging. Who are you and what happened to the lazy one?",
    "On a streak. Don't ruin it tonight.",
    "Day after day. You're actually doing the thing. Unsettling but good.",
  ],
  profile_saved: [
    "Profile saved. Now you have no excuses. Exciting.",
    "Numbers locked in. The mirror is watching.",
    "Saved. Your BMR is calculated. Time to actually hit the numbers.",
    "Profile done. You've officially started. No take-backs.",
  ],
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function getSavageMessage(context: SavageContext): string {
  return pick(pool[context])
}
