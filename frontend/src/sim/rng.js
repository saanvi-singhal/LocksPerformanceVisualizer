// rng.js
// A small seeded random number generator, so a "random" schedule can be
// replayed exactly from its seed.
//
// It is the Park-Miller "minimal standard" generator:
//     next = previous * 16807  mod  (2^31 - 1)
// All numbers stay below 2^53, so plain JavaScript numbers compute it
// exactly. The state is just one integer, stored inside the simulation state.

const MODULUS = 2147483647;  // 2^31 - 1, a prime
const MULTIPLIER = 16807;

// Turns any whole-number seed into a valid starting state (1 .. MODULUS - 1).
export function seedToState(seed) {
  const s = Math.abs(Math.floor(seed)) % (MODULUS - 1);
  return s + 1;
}

// Returns { state, value } where value is a random number in [0, 1).
export function nextRandom(state) {
  const next = (state * MULTIPLIER) % MODULUS;
  return { state: next, value: (next - 1) / (MODULUS - 1) };
}
