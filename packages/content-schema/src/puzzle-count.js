const SECONDS_PER_PUZZLE = 6 * 60;
const MIN_PUZZLE_COUNT = 3;
const MAX_PUZZLE_COUNT = 5;

/**
 * Suggests the number of room puzzles for a lecture.
 *
 * One puzzle is allocated per started six-minute block. Short videos still get
 * three puzzles, while longer videos are capped at five for the demo room.
 *
 * @param {number} durationSec lecture duration in seconds
 * @returns {number} an integer between 3 and 5
 */
export function suggestPuzzleCount(durationSec) {
  if (typeof durationSec !== "number" || !Number.isFinite(durationSec)) {
    throw new TypeError("durationSec must be a finite number");
  }

  if (durationSec < 0) {
    throw new RangeError("durationSec must be greater than or equal to 0");
  }

  const calculated = Math.ceil(durationSec / SECONDS_PER_PUZZLE);
  return Math.min(MAX_PUZZLE_COUNT, Math.max(MIN_PUZZLE_COUNT, calculated));
}

export const PUZZLE_COUNT_LIMITS = Object.freeze({
  secondsPerPuzzle: SECONDS_PER_PUZZLE,
  min: MIN_PUZZLE_COUNT,
  max: MAX_PUZZLE_COUNT,
});
