export const BOARD_SIZE = 5;
export const ROUTE_MAZES: readonly (readonly number[])[] = [
  [2, 5, 10, 11, 13, 17, 18, 21],
  [1, 6, 7, 8, 15, 18, 21, 23],
  [3, 5, 6, 9, 13, 15, 18, 19, 20],
];
export function gridDistance(a: number, b: number, width = BOARD_SIZE): number {
  return Math.abs(Math.floor(a / width) - Math.floor(b / width)) + Math.abs(a % width - b % width);
}
export function canMove(from: number, to: number, walls: readonly number[]): boolean {
  return Number.isInteger(to) && to >= 0 && to < BOARD_SIZE ** 2 && gridDistance(from, to) === 1 && !walls.includes(to);
}
export function nextNode(from: number, direction: string): number | null {
  const delta: Record<string, number> = { ArrowUp: -BOARD_SIZE, ArrowDown: BOARD_SIZE, ArrowLeft: -1, ArrowRight: 1 };
  return direction in delta ? from + delta[direction] : null;
}
export function randomNode(size: number, random = Math.random): number { return Math.min(size - 1, Math.max(0, Math.floor(random() * size))); }
export function memorySequence(length: number, random = Math.random): number[] {
  const sequence: number[] = [];
  for (let index = 0; index < length; index++) {
    let next = randomNode(9, random);
    if (next === sequence.at(-1)) next = (next + 1) % 9;
    sequence.push(next);
  }
  return sequence;
}
