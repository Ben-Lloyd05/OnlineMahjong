import { generateServerSeed, commitServerSeed, verifyCommit } from '../src/fairness';
import { DeterministicRNG, shuffle } from '../src/rng';

describe('Provable fairness', () => {
  test('commit -> reveal -> verify works', () => {
    const serverSeed = generateServerSeed();
    const commit = commitServerSeed(serverSeed);
    expect(commit).toHaveLength(64);
    expect(verifyCommit(commit, serverSeed)).toBe(true);
  });

  test('deterministic shuffle reproducible with same seeds', () => {
    const clientSeed = 'client-abc';
    const serverSeed = generateServerSeed();
    const rng1 = new DeterministicRNG(clientSeed, serverSeed);
    const rng2 = new DeterministicRNG(clientSeed, serverSeed);

    const arr = Array.from({ length: 144 }, (_, i) => i);
    const s1 = shuffle(arr, rng1);
    const s2 = shuffle(arr, rng2);
    expect(s1).toEqual(s2);
    // Ensure it is a permutation
    expect(new Set(s1).size).toBe(arr.length);
  });
});


