export const LIFESTYLE_LOGIN_EMAIL = "info@fearlessau.com";
export const LIFESTYLE_TIMEZONE = "Australia/Brisbane";

export type LifestyleProgramStyle = "upper_lower" | "full_body";

export type LifestyleMovementPattern =
  | "squat"
  | "hinge"
  | "bridge"
  | "push"
  | "pull"
  | "carry"
  | "core"
  | "single_leg";

export type LifestyleExerciseDefinition = {
  key: string;
  name: string;
  pattern: LifestyleMovementPattern;
  sets: number;
  repMin: number;
  repMax: number;
  restSeconds: number;
  cues: string[];
  regression?: string;
};

export type LifestyleWorkoutDefinition = {
  key: string;
  title: string;
  focus: string;
  estimatedMinutes: number;
  exercises: LifestyleExerciseDefinition[];
};

const EXERCISES = {
  gobletSquat: {
    key: "goblet-squat",
    name: "Goblet squat",
    pattern: "squat",
    sets: 3,
    repMin: 8,
    repMax: 10,
    restSeconds: 90,
    cues: ["Keep the weight close to your chest", "Brace before you descend", "Drive the floor away through your whole foot"],
    regression: "Use a box behind you and reduce the depth.",
  },
  hipThrust: {
    key: "hip-thrust",
    name: "Hip thrust",
    pattern: "bridge",
    sets: 3,
    repMin: 10,
    repMax: 12,
    restSeconds: 90,
    cues: ["Tuck your chin and ribs", "Finish by squeezing your glutes", "Stop before your lower back arches"],
    regression: "Use a floor glute bridge with body weight.",
  },
  benchPress: {
    key: "dumbbell-bench-press",
    name: "Dumbbell bench press",
    pattern: "push",
    sets: 3,
    repMin: 8,
    repMax: 12,
    restSeconds: 90,
    cues: ["Plant both feet", "Keep shoulder blades gently back", "Lower with control and keep wrists stacked"],
    regression: "Use a chest-press machine or lighter dumbbells.",
  },
  cableRow: {
    key: "seated-cable-row",
    name: "Seated cable row",
    pattern: "pull",
    sets: 3,
    repMin: 10,
    repMax: 12,
    restSeconds: 75,
    cues: ["Sit tall with quiet ribs", "Pull elbows toward your back pockets", "Pause without shrugging"],
  },
  deadBug: {
    key: "dead-bug",
    name: "Dead bug",
    pattern: "core",
    sets: 3,
    repMin: 6,
    repMax: 8,
    restSeconds: 45,
    cues: ["Keep your lower back gently heavy", "Exhale as the arm and leg extend", "Use a range you can control"],
    regression: "Move one heel at a time and keep both arms still.",
  },
  splitSquat: {
    key: "supported-split-squat",
    name: "Supported split squat",
    pattern: "single_leg",
    sets: 3,
    repMin: 8,
    repMax: 10,
    restSeconds: 75,
    cues: ["Use a rack for light balance support", "Lower straight down", "Keep the front knee tracking over your toes"],
    regression: "Shorten the range or use a static body-weight hold.",
  },
  hamstringCurl: {
    key: "seated-hamstring-curl",
    name: "Seated hamstring curl",
    pattern: "hinge",
    sets: 3,
    repMin: 10,
    repMax: 12,
    restSeconds: 75,
    cues: ["Keep hips heavy in the seat", "Curl smoothly without bouncing", "Control the return"],
  },
  latPulldown: {
    key: "neutral-grip-lat-pulldown",
    name: "Neutral-grip lat pulldown",
    pattern: "pull",
    sets: 3,
    repMin: 8,
    repMax: 12,
    restSeconds: 90,
    cues: ["Stay tall instead of leaning back", "Pull elbows down toward your sides", "Let the shoulders rise under control"],
  },
  shoulderPress: {
    key: "seated-dumbbell-shoulder-press",
    name: "Seated dumbbell shoulder press",
    pattern: "push",
    sets: 2,
    repMin: 8,
    repMax: 12,
    restSeconds: 90,
    cues: ["Use the back support", "Keep ribs stacked over hips", "Press without shrugging"],
    regression: "Use a machine press or one light dumbbell at a time.",
  },
  pallof: {
    key: "pallof-press",
    name: "Pallof press",
    pattern: "core",
    sets: 3,
    repMin: 8,
    repMax: 10,
    restSeconds: 45,
    cues: ["Stand tall and squeeze your glutes", "Press straight ahead", "Do not let the cable rotate you"],
  },
  legPress: {
    key: "leg-press",
    name: "Leg press",
    pattern: "squat",
    sets: 3,
    repMin: 10,
    repMax: 12,
    restSeconds: 90,
    cues: ["Keep your whole foot planted", "Lower only while your pelvis stays heavy", "Do not lock your knees at the top"],
  },
  inclinePress: {
    key: "incline-dumbbell-press",
    name: "Incline dumbbell press",
    pattern: "push",
    sets: 3,
    repMin: 8,
    repMax: 12,
    restSeconds: 90,
    cues: ["Use a low incline", "Keep wrists over elbows", "Lower slowly and press smoothly"],
  },
  chestSupportedRow: {
    key: "chest-supported-row",
    name: "Chest-supported row",
    pattern: "pull",
    sets: 3,
    repMin: 10,
    repMax: 12,
    restSeconds: 75,
    cues: ["Let the bench support your torso", "Pull elbows toward your hips", "Pause without lifting your chest"],
  },
  farmerCarry: {
    key: "farmer-carry",
    name: "Farmer carry",
    pattern: "carry",
    sets: 3,
    repMin: 30,
    repMax: 45,
    restSeconds: 60,
    cues: ["Walk tall with quiet shoulders", "Take controlled steps", "Stop before your grip changes your posture"],
  },
  stepUp: {
    key: "low-box-step-up",
    name: "Low-box step-up",
    pattern: "single_leg",
    sets: 3,
    repMin: 8,
    repMax: 10,
    restSeconds: 75,
    cues: ["Use a low stable box", "Push through the working foot", "Lower slowly without dropping"],
  },
  cablePullThrough: {
    key: "cable-pull-through",
    name: "Cable pull-through",
    pattern: "hinge",
    sets: 3,
    repMin: 10,
    repMax: 12,
    restSeconds: 75,
    cues: ["Send hips back with soft knees", "Keep your spine long", "Stand by squeezing your glutes—not leaning back"],
    regression: "Practise a body-weight hip hinge against a wall.",
  },
  sidePlank: {
    key: "side-plank",
    name: "Side plank",
    pattern: "core",
    sets: 3,
    repMin: 20,
    repMax: 30,
    restSeconds: 45,
    cues: ["Stack shoulder over elbow", "Keep hips in one line", "Breathe behind the brace"],
    regression: "Bend the bottom knee and keep it on the floor.",
  },
} satisfies Record<string, LifestyleExerciseDefinition>;

const WORKOUTS: Record<string, LifestyleWorkoutDefinition> = {
  full_a: {
    key: "full_a",
    title: "Full body · Squat + glutes",
    focus: "Build squat confidence and glute strength, then train chest, back and trunk control.",
    estimatedMinutes: 58,
    exercises: [EXERCISES.gobletSquat, EXERCISES.hipThrust, EXERCISES.benchPress, EXERCISES.cableRow, EXERCISES.deadBug],
  },
  full_b: {
    key: "full_b",
    title: "Full body · Single-leg + back",
    focus: "Train one-leg control, hamstrings, upper-back strength and resistance to unwanted rotation.",
    estimatedMinutes: 56,
    exercises: [EXERCISES.splitSquat, EXERCISES.hamstringCurl, EXERCISES.latPulldown, EXERCISES.shoulderPress, EXERCISES.pallof],
  },
  full_c: {
    key: "full_c",
    title: "Full body · Press + carry",
    focus: "Build leg and glute strength, add balanced upper-body work, then finish with a loaded carry.",
    estimatedMinutes: 60,
    exercises: [EXERCISES.legPress, EXERCISES.hipThrust, EXERCISES.inclinePress, EXERCISES.chestSupportedRow, EXERCISES.farmerCarry],
  },
  lower_a: {
    key: "lower_a",
    title: "Lower · Glute strength",
    focus: "Glutes, quads and trunk stability",
    estimatedMinutes: 55,
    exercises: [EXERCISES.gobletSquat, EXERCISES.hipThrust, EXERCISES.splitSquat, EXERCISES.deadBug],
  },
  upper_a: {
    key: "upper_a",
    title: "Upper · Push + pull",
    focus: "Chest, back, shoulders and postural strength",
    estimatedMinutes: 54,
    exercises: [EXERCISES.benchPress, EXERCISES.cableRow, EXERCISES.latPulldown, EXERCISES.shoulderPress, EXERCISES.pallof],
  },
  lower_b: {
    key: "lower_b",
    title: "Lower · Posterior chain",
    focus: "Hamstrings, glutes and single-leg control",
    estimatedMinutes: 56,
    exercises: [EXERCISES.cablePullThrough, EXERCISES.legPress, EXERCISES.stepUp, EXERCISES.hamstringCurl, EXERCISES.sidePlank],
  },
  upper_b: {
    key: "upper_b",
    title: "Upper · Back + carry",
    focus: "Upper back, chest, shoulders and whole-body bracing",
    estimatedMinutes: 53,
    exercises: [EXERCISES.chestSupportedRow, EXERCISES.inclinePress, EXERCISES.latPulldown, EXERCISES.farmerCarry, EXERCISES.deadBug],
  },
  glute_accessory: {
    key: "glute_accessory",
    title: "Glute + movement",
    focus: "A shorter, lower-fatigue glute and core session",
    estimatedMinutes: 42,
    exercises: [EXERCISES.hipThrust, EXERCISES.stepUp, EXERCISES.hamstringCurl, EXERCISES.pallof],
  },
};

const UPPER_LOWER_PROGRAM_KEYS: Record<number, string[]> = {
  2: ["lower_a", "upper_a"],
  3: ["lower_a", "upper_a", "full_b"],
  4: ["lower_a", "upper_a", "lower_b", "upper_b"],
  5: ["lower_a", "upper_a", "full_b", "lower_b", "upper_b"],
};

const FULL_BODY_PROGRAM_KEYS = ["full_a", "full_b", "full_c"];

export function getLifestyleProgram(daysPerWeek: number, style: LifestyleProgramStyle = "upper_lower") {
  const safeDays = Math.min(5, Math.max(2, daysPerWeek));
  const keys = style === "full_body"
    ? FULL_BODY_PROGRAM_KEYS
    : UPPER_LOWER_PROGRAM_KEYS[safeDays] ?? UPPER_LOWER_PROGRAM_KEYS[3];
  return keys.map((key) => WORKOUTS[key]);
}

export function getLifestyleWorkout(key: string) {
  return WORKOUTS[key] ?? WORKOUTS.full_a;
}

export function findLifestyleWorkout(key: string) {
  return WORKOUTS[key] ?? null;
}

export function getLifestyleExercise(key: string) {
  return Object.values(EXERCISES).find((exercise) => exercise.key === key) ?? null;
}

export function preferredDaysForFrequency(daysPerWeek: number) {
  if (daysPerWeek === 2) return [2, 5];
  if (daysPerWeek === 4) return [1, 2, 4, 5];
  if (daysPerWeek === 5) return [1, 2, 3, 5, 6];
  return [1, 3, 5];
}

export const LIFESTYLE_NOTIFICATION_LINES = [
  "Hey pookie — Future You called. It’s time to look after yourself.",
  "Your glutes filed a missing-person report. Gym time.",
  "A very official reminder: go pick up heavy things.",
  "Back to strong. Today’s session is ready when you are.",
  "Tiny plot twist: the main character goes to the gym today.",
  "No heroics required—just show up and do the next set.",
] as const;

export function lifestyleNotificationLine(seed: string) {
  let hash = 0;
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return LIFESTYLE_NOTIFICATION_LINES[hash % LIFESTYLE_NOTIFICATION_LINES.length];
}

