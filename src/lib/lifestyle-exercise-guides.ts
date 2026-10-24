export type LifestyleExerciseGuide = {
  image: string;
  imageAlt: string;
  goal: string;
  primaryMuscles: string[];
  supportingMuscles: string[];
  setup: string[];
  movement: string[];
  breathing: string;
  commonMistakes: string[];
  easierOption: string;
};

const image = (key: string) => `/lifestyle/exercises/${key}.webp`;

export const LIFESTYLE_EXERCISE_GUIDES: Record<string, LifestyleExerciseGuide> = {
  "goblet-squat": {
    image: image("goblet-squat"),
    imageAlt: "Goblet squat shown standing and at the controlled bottom position, with quadriceps and glutes highlighted",
    goal: "Sit down between your hips while keeping the dumbbell close, then stand by pushing the floor away.",
    primaryMuscles: ["Quadriceps", "Glutes"],
    supportingMuscles: ["Adductors", "Abdominals", "Upper back"],
    setup: [
      "Stand with feet about shoulder-width apart and toes turned out only slightly.",
      "Hold one dumbbell vertically against your chest. Keep elbows under the weight and your whole foot on the floor.",
    ],
    movement: [
      "Take a breath and brace, then bend your knees and hips together as if sitting between your heels.",
      "Descend only as far as your heels stay planted and your knees continue to follow the direction of your toes.",
      "Push through heel, big-toe base and little-toe base to stand tall. Finish with hips and knees straight—not leaned back.",
    ],
    breathing: "Breathe in and brace before lowering. Exhale gradually as you pass the hardest part of standing up.",
    commonMistakes: ["Heels lifting", "Knees collapsing inward", "Dumbbell drifting away from the chest", "Rounding or over-arching the lower back"],
    easierOption: "Squat to a bench or box behind you, pause gently, then stand. Reduce depth before reducing control.",
  },
  "hip-thrust": {
    image: image("hip-thrust"),
    imageAlt: "Hip thrust shown with hips lowered and lifted, with glutes and hamstrings highlighted",
    goal: "Drive the hips up with your glutes while your ribs and pelvis stay stacked.",
    primaryMuscles: ["Glutes"],
    supportingMuscles: ["Hamstrings", "Adductors", "Abdominals"],
    setup: [
      "Place the bottom of your shoulder blades against a stable bench. Set feet about hip-width apart.",
      "At the top, your shins should be close to vertical. Move your feet slightly if you feel mostly quads or hamstrings.",
    ],
    movement: [
      "Lower your hips under control while keeping your chin gently tucked and ribs down.",
      "Press through both feet and squeeze your glutes to lift until shoulders, hips and knees form one line.",
      "Pause for one second at the top, then lower. Stop before your lower back starts doing the movement.",
    ],
    breathing: "Inhale at the bottom. Exhale as you lift and keep a light abdominal brace through the top pause.",
    commonMistakes: ["Throwing the head back", "Over-arching at the top", "Feet too far away", "Pushing unevenly through one leg"],
    easierOption: "Use a body-weight glute bridge on the floor. Keep the same rib-down finish and top pause.",
  },
  "dumbbell-bench-press": {
    image: image("dumbbell-bench-press"),
    imageAlt: "Flat dumbbell bench press shown at the top and lowered position, with chest and triceps highlighted",
    goal: "Lower the dumbbells to either side of your chest with control, then press them back over your shoulders.",
    primaryMuscles: ["Chest", "Triceps"],
    supportingMuscles: ["Front shoulders", "Upper back"],
    setup: [
      "Lie with eyes below the dumbbells, feet flat and shoulder blades gently pulled back into the bench.",
      "Start with dumbbells over your chest, wrists straight and knuckles pointing toward the ceiling.",
    ],
    movement: [
      "Lower both dumbbells slowly, keeping elbows about 30–45 degrees from your torso.",
      "Stop when the dumbbells reach chest level or just before your shoulders roll forward.",
      "Press up and slightly inward until the dumbbells are again over your shoulders. Do not bang them together.",
    ],
    breathing: "Inhale during the controlled lowering. Exhale as you press without losing your planted feet or upper-back position.",
    commonMistakes: ["Wrists bending back", "Elbows flaring straight sideways", "Shoulders lifting off the bench", "Bouncing out of the bottom"],
    easierOption: "Use lighter dumbbells or a chest-press machine with the handles set near mid-chest height.",
  },
  "seated-cable-row": {
    image: image("seated-cable-row"),
    imageAlt: "Seated cable row shown with arms extended and handle pulled to the ribs, with back muscles highlighted",
    goal: "Move the handle toward your lower ribs by driving your elbows back without turning it into a body swing.",
    primaryMuscles: ["Lats", "Rhomboids", "Mid back"],
    supportingMuscles: ["Rear shoulders", "Biceps", "Abdominals"],
    setup: [
      "Place both feet firmly on the plates, soften your knees and sit tall with the cable level with your lower ribs.",
      "Hold the neutral handle with long arms. Let your shoulder blades move forward slightly without rounding your lower back.",
    ],
    movement: [
      "Start the pull by drawing your shoulder blades gently back and down, then drive elbows toward your back pockets.",
      "Bring the handle to your lower ribs and pause without leaning back or lifting your shoulders.",
      "Return slowly until your arms are long again. Keep your torso quiet throughout the rep.",
    ],
    breathing: "Exhale as the handle reaches your ribs. Inhale during the slow return while keeping your trunk braced.",
    commonMistakes: ["Rocking backward", "Shrugging", "Pulling the handle too high", "Letting wrists curl"],
    easierOption: "Reduce the weight and pause each rep at the ribs. A chest-supported row is another stable alternative.",
  },
  "dead-bug": {
    image: image("dead-bug"),
    imageAlt: "Dead bug shown in tabletop and with the opposite arm and leg extended, with the abdominal wall highlighted",
    goal: "Keep your trunk completely still while one arm and the opposite leg move away from you.",
    primaryMuscles: ["Deep abdominals", "Obliques"],
    supportingMuscles: ["Hip flexors", "Pelvic stabilisers"],
    setup: [
      "Lie on your back with arms pointing to the ceiling. Lift hips and knees to 90 degrees, like your shins are resting on a table.",
      "Gently exhale until your ribs settle and your lower back feels heavy against the mat. Do not force it flat with pain.",
    ],
    movement: [
      "Slowly reach one arm overhead while extending the opposite leg toward the floor.",
      "Stop the reach the instant your ribs flare or lower back begins to lift. That point is your current range.",
      "Return to tabletop, reset your brace, then repeat on the other side. One left-and-right pair counts as two reps.",
    ],
    breathing: "Use a long exhale during each reach. Inhale quietly when you return to tabletop without letting the ribs pop up.",
    commonMistakes: ["Moving too far and arching the back", "Holding your breath", "Rushing side to side", "Moving the same-side arm and leg"],
    easierOption: "Keep both arms still and lower one heel to tap the floor at a time. Shorten the reach until your trunk stays quiet.",
  },
  "supported-split-squat": {
    image: image("supported-split-squat"),
    imageAlt: "Supported split squat shown tall and lowered, with the front quadriceps and glutes highlighted",
    goal: "Lower straight down between a staggered stance, using the support for balance rather than to pull yourself up.",
    primaryMuscles: ["Quadriceps", "Glutes"],
    supportingMuscles: ["Adductors", "Calves", "Hip stabilisers"],
    setup: [
      "Stand beside a rack and take a comfortable staggered stance—feet on separate tracks, not on a tightrope.",
      "Keep most of your weight through the front whole foot. Use only light fingertip support.",
    ],
    movement: [
      "Bend both knees and lower the back knee toward the floor while your torso stays tall.",
      "Let the front knee move in line with the toes; stop before balance or posture changes.",
      "Push through the front foot to return to the same tall split stance. Complete one side before changing legs.",
    ],
    breathing: "Inhale and brace before lowering. Exhale as the front leg drives you back up.",
    commonMistakes: ["Front knee collapsing inward", "Feet lined up too narrowly", "Pushing mostly from the back leg", "Pulling hard on the rack"],
    easierOption: "Use a shorter range, shorten the stance slightly, or practise a split-stance hold before adding repetitions.",
  },
  "seated-hamstring-curl": {
    image: image("seated-hamstring-curl"),
    imageAlt: "Seated hamstring curl shown with legs extended and curled, with the hamstrings highlighted",
    goal: "Curl your heels down and back without your hips lifting from the seat.",
    primaryMuscles: ["Hamstrings"],
    supportingMuscles: ["Calves"],
    setup: [
      "Adjust the seat so your knees line up with the machine pivot. Place the lower pad just above your heels.",
      "Secure the thigh pad snugly above your knees and keep your hips and back against the seat.",
    ],
    movement: [
      "Pull your heels down and back in a smooth arc until you reach a strong hamstring contraction.",
      "Pause briefly without bouncing, then return the pad slowly until your knees are almost straight.",
      "Keep the movement at the knees; your hips should not slide or lift.",
    ],
    breathing: "Exhale as you curl. Inhale during the slower return to the start.",
    commonMistakes: ["Hips lifting", "Using momentum", "Letting the weight stack slam", "Machine pivot not aligned with the knee"],
    easierOption: "Reduce the load and use a smaller pain-free range while you learn the machine setup.",
  },
  "neutral-grip-lat-pulldown": {
    image: image("neutral-grip-lat-pulldown"),
    imageAlt: "Neutral-grip lat pulldown shown overhead and pulled to the upper chest, with the lats highlighted",
    goal: "Pull your elbows down beside your ribs while your torso stays tall and controlled.",
    primaryMuscles: ["Lats", "Mid back"],
    supportingMuscles: ["Biceps", "Rear shoulders", "Lower traps"],
    setup: [
      "Set the thigh pad firmly over your legs. Take the parallel handles and sit with arms long overhead.",
      "Keep ribs stacked over hips and use only a very small natural lean—not a backward swing.",
    ],
    movement: [
      "Begin by drawing your shoulders away from your ears, then pull elbows down toward your sides.",
      "Finish when the handles reach upper-chest or shoulder height and your forearms remain roughly vertical.",
      "Return slowly to long arms, allowing the shoulder blades to rise under control before the next rep.",
    ],
    breathing: "Exhale during the pull. Inhale as the cable returns overhead without losing your torso position.",
    commonMistakes: ["Leaning far back", "Pulling behind the neck", "Shrugging", "Yanking the first part of the rep"],
    easierOption: "Lower the weight or use a slightly narrower neutral handle so you can keep the same upright path.",
  },
  "seated-dumbbell-shoulder-press": {
    image: image("seated-dumbbell-shoulder-press"),
    imageAlt: "Seated dumbbell shoulder press shown at shoulder height and overhead, with shoulders and triceps highlighted",
    goal: "Press the dumbbells overhead while your ribs stay down and your neck stays long.",
    primaryMuscles: ["Shoulders", "Triceps"],
    supportingMuscles: ["Upper chest", "Upper back", "Abdominals"],
    setup: [
      "Set the bench close to upright and sit with feet planted, back supported and dumbbells at shoulder height.",
      "Stack wrists above elbows. Keep your ribs over your pelvis instead of flaring your chest upward.",
    ],
    movement: [
      "Press both dumbbells up and slightly inward, making room for your head as the arms pass your ears.",
      "Finish with arms nearly straight and shoulders still away from your ears.",
      "Lower slowly until elbows return just below shoulder height or to your comfortable range.",
    ],
    breathing: "Inhale before the press, brace, then exhale through the hardest part. Reset your breath at the bottom.",
    commonMistakes: ["Arching the lower back", "Shrugging", "Wrists bending backward", "Dropping elbows too far below the shoulders"],
    easierOption: "Use a machine press or press one light dumbbell at a time while the other hand supports your ribs.",
  },
  "pallof-press": {
    image: image("pallof-press"),
    imageAlt: "Standing Pallof press shown with the handle at the chest and arms extended while resisting cable rotation",
    goal: "Press your hands away while stopping the sideways cable from turning your ribcage or hips.",
    primaryMuscles: ["Obliques", "Deep abdominals"],
    supportingMuscles: ["Glutes", "Shoulders"],
    setup: [
      "Set a cable or band at chest height. Stand side-on, step away for tension and hold the handle at your sternum.",
      "Use a shoulder-width stance, soft knees and level hips. Your sternum should point straight ahead.",
    ],
    movement: [
      "Brace, then press your hands straight forward until your elbows are nearly straight.",
      "Pause for one to two seconds without letting the cable rotate or lean your body.",
      "Bring your hands back to your chest slowly. Complete the set, then face the other direction.",
    ],
    breathing: "Exhale as the arms extend and keep breathing quietly during the pause. Inhale as the handle returns.",
    commonMistakes: ["Turning toward the cable", "Leaning away", "Letting hips shift", "Using more resistance than you can control"],
    easierOption: "Step closer to the cable or band, or perform a shorter press while keeping the torso completely still.",
  },
  "leg-press": {
    image: image("leg-press"),
    imageAlt: "Leg press shown with knees bent and the sled pressed away, with quadriceps and glutes highlighted",
    goal: "Press the platform away through your whole feet while your pelvis stays heavy against the pad.",
    primaryMuscles: ["Quadriceps", "Glutes"],
    supportingMuscles: ["Adductors", "Hamstrings"],
    setup: [
      "Sit with your full back and pelvis supported. Place feet about shoulder-width on the platform.",
      "Release the safety only after checking that knees point in the same direction as toes.",
    ],
    movement: [
      "Lower the sled slowly by bending knees and hips together. Keep heels planted.",
      "Stop before your pelvis curls away from the back pad or your knees move into an uncomfortable depth.",
      "Push the platform away until legs are almost straight. Keep a soft knee—do not forcefully lock out.",
    ],
    breathing: "Inhale as the sled lowers. Brace and exhale through the hardest part of the press.",
    commonMistakes: ["Pelvis lifting or tucking", "Knees collapsing inward", "Heels lifting", "Locking the knees hard at the top"],
    easierOption: "Use a lighter load and shorten the bottom range until your pelvis stays firmly supported.",
  },
  "incline-dumbbell-press": {
    image: image("incline-dumbbell-press"),
    imageAlt: "Low-incline dumbbell press shown at the top and lowered position, with upper chest and shoulders highlighted",
    goal: "Press from the upper chest on a low incline without allowing the shoulders to roll forward.",
    primaryMuscles: ["Upper chest", "Triceps"],
    supportingMuscles: ["Front shoulders", "Upper back"],
    setup: [
      "Set the bench to a low incline—about 20–30 degrees. Plant both feet and settle shoulder blades into the pad.",
      "Begin with dumbbells over the upper chest, wrists straight and elbows softly unlocked.",
    ],
    movement: [
      "Lower the dumbbells toward the outside of your upper chest with elbows angled 30–45 degrees from your torso.",
      "Stop before shoulders roll forward or elbows drop far behind the body.",
      "Press up and slightly inward until the weights finish above the shoulders.",
    ],
    breathing: "Inhale during the lower. Exhale as you press while keeping feet, glutes and upper back connected to their supports.",
    commonMistakes: ["Bench set too steep", "Elbows flaring", "Wrists bending back", "Dumbbells drifting toward the face"],
    easierOption: "Use lighter dumbbells, a low-incline chest-press machine, or reduce the range slightly.",
  },
  "chest-supported-row": {
    image: image("chest-supported-row"),
    imageAlt: "Chest-supported dumbbell row shown with arms hanging and elbows pulled toward the hips, with back muscles highlighted",
    goal: "Pull the dumbbells toward your lower ribs while the bench keeps your torso completely still.",
    primaryMuscles: ["Lats", "Rhomboids", "Mid back"],
    supportingMuscles: ["Rear shoulders", "Biceps"],
    setup: [
      "Set an incline bench high enough that your arms can hang freely. Lie chest-down with feet firmly on the floor.",
      "Hold dumbbells with palms facing each other, neck long and chest resting on the pad.",
    ],
    movement: [
      "Drive elbows back and slightly toward your hips while keeping shoulders away from your ears.",
      "Pause when dumbbells reach the lower ribs. Do not lift your chest away from the bench.",
      "Lower until arms are long and shoulder blades move forward naturally, then repeat.",
    ],
    breathing: "Exhale as you row. Inhale during the controlled lower without losing contact with the bench.",
    commonMistakes: ["Lifting the chest", "Shrugging", "Pulling toward the armpits", "Swinging the dumbbells"],
    easierOption: "Use lighter dumbbells or a chest-supported row machine with a neutral grip.",
  },
  "farmer-carry": {
    image: image("farmer-carry"),
    imageAlt: "Farmer carry shown standing and walking with dumbbells, with grip, upper back and trunk muscles highlighted",
    goal: "Walk normally under load while staying tall, level and quiet through the trunk.",
    primaryMuscles: ["Grip", "Upper back", "Glutes"],
    supportingMuscles: ["Abdominals", "Obliques", "Calves"],
    setup: [
      "Stand between two dumbbells, hinge to pick them up safely, then stand with one weight at each side.",
      "Stack ribs over pelvis, keep shoulders level and look straight ahead.",
    ],
    movement: [
      "Walk with controlled, natural steps. Keep the dumbbells close and prevent them from swinging.",
      "Stay equally tall on both sides; do not lean or hike one shoulder as grip fatigue builds.",
      "Stop while posture is still good, then set the weights down with a hip hinge.",
    ],
    breathing: "Take small breaths behind a steady brace. Do not hold one breath for the entire carry.",
    commonMistakes: ["Rushing", "Shrugging", "Weights swinging", "Continuing after posture or grip changes"],
    easierOption: "Use lighter dumbbells or shorten the distance. A single suitcase carry is not easier—it adds an anti-lean challenge.",
  },
  "low-box-step-up": {
    image: image("low-box-step-up"),
    imageAlt: "Low-box step-up shown with one foot planted and standing on the box, with the working glute and quadriceps highlighted",
    goal: "Stand onto the box using the leg on the box, then lower under control with the same leg.",
    primaryMuscles: ["Glutes", "Quadriceps"],
    supportingMuscles: ["Calves", "Hip stabilisers", "Abdominals"],
    setup: [
      "Choose a stable box low enough that you can keep your pelvis level. Place the entire working foot on top.",
      "Lean forward only slightly from the ankle while keeping the knee aligned with the middle toes.",
    ],
    movement: [
      "Push the box away through the working foot and stand tall on top.",
      "Keep the trailing foot light—avoid springing off the floor to create momentum.",
      "Reach the trailing foot back to the floor and lower slowly, controlling the descent with the working leg.",
    ],
    breathing: "Exhale as you step up. Inhale as you lower with control.",
    commonMistakes: ["Pushing off the trailing foot", "Only the toes on the box", "Knee collapsing inward", "Dropping quickly on the way down"],
    easierOption: "Use a lower step and hold a rail lightly. Master body weight before adding dumbbells.",
  },
  "cable-pull-through": {
    image: image("cable-pull-through"),
    imageAlt: "Cable pull-through hip hinge shown with hips back and standing tall, with glutes and hamstrings highlighted",
    goal: "Practise an RDL-style hip hinge: send hips back, then stand by driving them forward—not by squatting or leaning back.",
    primaryMuscles: ["Glutes", "Hamstrings"],
    supportingMuscles: ["Adductors", "Abdominals", "Spinal stabilisers"],
    setup: [
      "Set a rope on the lowest cable. Face away, hold the rope between your legs and walk forward until the cable stays taut.",
      "Stand about hip-width with soft knees, long arms, ribs stacked and shoulders relaxed.",
    ],
    movement: [
      "Push your hips backward as if closing a car door, letting your torso tip forward while your spine stays long.",
      "Stop when you feel hamstring tension and before your back rounds; the knees should bend only a little.",
      "Drive the floor away and squeeze your glutes to stand. Finish tall rather than leaning backward.",
    ],
    breathing: "Inhale and brace before hinging. Exhale as the hips drive forward and you return to standing.",
    commonMistakes: ["Turning it into a squat", "Rounding the back", "Pulling with the arms", "Leaning backward at the finish"],
    easierOption: "Practise the same hip hinge with no weight while reaching your hips toward a wall behind you.",
  },
  "side-plank": {
    image: image("side-plank"),
    imageAlt: "Side plank shown from a bent-knee setup to a straight-leg hold, with obliques and hip stabilisers highlighted",
    goal: "Hold your body in one long side-on line without letting the waist or shoulder collapse.",
    primaryMuscles: ["Obliques", "Deep abdominals"],
    supportingMuscles: ["Glute medius", "Shoulder stabilisers"],
    setup: [
      "Lie on your side with elbow directly under shoulder and forearm pointing forward. Stack hips and shoulders.",
      "For the full version, straighten and stack your legs. For the easier version, bend the bottom knee.",
    ],
    movement: [
      "Press the forearm and feet—or bottom knee—into the floor and lift your hips.",
      "Make one line from head through hips to feet. Keep your chest facing forward and the underside waist lifted.",
      "Hold for the prescribed time while breathing, then lower with control and repeat on the other side.",
    ],
    breathing: "Keep breathing quietly behind the brace. A slow exhale can help keep the ribs stacked.",
    commonMistakes: ["Elbow too far from the shoulder", "Hips sagging", "Chest rotating toward the floor", "Holding your breath"],
    easierOption: "Keep the bottom knee bent on the floor and create a straight line from head to hips to bottom knee.",
  },
};

export function getLifestyleExerciseGuide(key: string) {
  return LIFESTYLE_EXERCISE_GUIDES[key] ?? null;
}
