import { describe, expect, it } from "vitest";
import { getLifestyleProgram } from "@/lib/lifestyle";
import { getLifestyleExerciseGuide } from "@/lib/lifestyle-exercise-guides";

describe("Lifestyle exercise teaching guides", () => {
  it("covers every exercise used by every supported training frequency", () => {
    const exercises = [2, 3, 4, 5]
      .flatMap((frequency) => getLifestyleProgram(frequency))
      .flatMap((workout) => workout.exercises);

    for (const exercise of exercises) {
      const guide = getLifestyleExerciseGuide(exercise.key);
      expect(guide, `${exercise.name} is missing its guide`).not.toBeNull();
      expect(guide?.setup.length).toBeGreaterThanOrEqual(2);
      expect(guide?.movement.length).toBeGreaterThanOrEqual(3);
      expect(guide?.commonMistakes.length).toBeGreaterThanOrEqual(3);
      expect(guide?.image).toBe(`/lifestyle/exercises/${exercise.key}.webp`);
    }
  });

  it("uses descriptive workout names instead of lettered foundations", () => {
    for (const workout of getLifestyleProgram(3)) {
      expect(workout.title).not.toMatch(/^Foundation\s+[A-Z]$/);
      expect(workout.focus.length).toBeGreaterThan(30);
    }
  });
});
