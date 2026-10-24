import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, ROUTE_MAZES, canMove, gridDistance, memorySequence, nextNode, randomNode } from './games';

describe('exploration games', () => {
  it('keeps every route solvable from start to destination', () => {
    for (const walls of ROUTE_MAZES) {
      const visited = new Set([0]), queue = [0];
      while (queue.length) {
        const from = queue.shift()!;
        for (let to = 0; to < BOARD_SIZE ** 2; to++) if (!visited.has(to) && canMove(from, to, walls)) { visited.add(to); queue.push(to); }
      }
      expect(visited.has(BOARD_SIZE ** 2 - 1)).toBe(true);
    }
  });
  it('prevents wrapping, diagonal moves and wall crossings', () => {
    expect(canMove(4, 5, [])).toBe(false);
    expect(canMove(0, 6, [])).toBe(false);
    expect(canMove(0, -1, [])).toBe(false);
    expect(canMove(24, 25, [])).toBe(false);
    expect(canMove(0, 1, [1])).toBe(false);
    expect(canMove(0, 5, [])).toBe(true);
    expect(nextNode(6, 'ArrowUp')).toBe(1);
    expect(nextNode(6, 'Tab')).toBeNull();
  });
  it('returns consistent readings without exposing an unprobed signal', () => {
    expect(gridDistance(0, 24)).toBe(8);
    expect(gridDistance(24, 0)).toBe(8);
    expect(gridDistance(12, 12)).toBe(0);
    expect(gridDistance(3, 4, 3)).toBe(1);
    expect(randomNode(25, () => 0)).toBe(0);
    expect(randomNode(25, () => .99999)).toBe(24);
  });
  it('keeps memory sequences on the board without ambiguous consecutive repeats', () => {
    const sequence = memorySequence(8, () => .9);
    expect(sequence).toHaveLength(8);
    expect(sequence.every((node, index) => node >= 0 && node < 9 && (!index || node !== sequence[index - 1]))).toBe(true);
  });
});
