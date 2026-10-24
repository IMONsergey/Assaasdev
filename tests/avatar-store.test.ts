import { describe, expect, it, vi } from 'vitest';
import { avatarStorageKey, createAvatarStore, randomAvatar } from '../src/components/avatar-store';

function memoryStorage() { const values = new Map<string,string>(); return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string,value: string) => { values.set(key,value); } }; }
describe('device avatar preference', () => {
  it('assigns a random default once and restores it after a new store is created', () => {
    const storage = memoryStorage(), random = vi.fn(() => .73);
    const first = createAvatarStore(storage,random);
    expect(first.read('alice')).toBe('avatar-15');
    expect(first.read('alice')).toBe('avatar-15');
    expect(random).toHaveBeenCalledTimes(1);
    expect(createAvatarStore(storage,() => 0).read('alice')).toBe('avatar-15');
  });
  it('isolates users and publishes a choice to every subscribed view', () => {
    const storage = memoryStorage(), store = createAvatarStore(storage,() => 0), listener = vi.fn();
    store.subscribe(listener);
    expect(store.select('alice','avatar-09')).toBe(true);
    expect(store.read('alice')).toBe('avatar-09');
    expect(store.read('bob')).toBe('avatar-01');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(storage.getItem(avatarStorageKey('alice'))).toBe('avatar-09');
    expect([...storage.values.keys()].every(key => /^apcosys\.avatar\.v1:[a-f0-9]{16}$/.test(key))).toBe(true);
  });
  it('never treats arbitrary stored strings or external URLs as artwork', () => {
    const storage = memoryStorage(); storage.setItem(avatarStorageKey('alice'),'https://invalid.example/track.svg');
    const store = createAvatarStore(storage,() => .1);
    expect(store.read('alice')).toBe('avatar-03');
    expect(store.select('alice','../../unknown.svg')).toBe(false);
    expect(store.read('alice')).toBe('avatar-03');
  });
  it('keeps selection stable when local storage is blocked', () => {
    const storage = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    const store = createAvatarStore(storage,() => .99);
    expect(store.read('alice')).toBe('avatar-20');
    expect(store.select('alice','avatar-04')).toBe(true);
    expect(store.read('alice')).toBe('avatar-04');
  });
  it('adopts a valid cross-tab update and ignores unrelated storage events', () => {
    const storage = memoryStorage(), store = createAvatarStore(storage,() => 0), listener = vi.fn();
    store.subscribe(listener); expect(store.read('alice')).toBe('avatar-01');
    storage.setItem(avatarStorageKey('alice'),'avatar-12'); store.sync('unrelated');
    expect(listener).not.toHaveBeenCalled(); expect(store.read('alice')).toBe('avatar-01');
    store.sync(avatarStorageKey('alice')); expect(store.read('alice')).toBe('avatar-12');
  });
  it('surprise me always chooses a different valid avatar', () => {
    expect(randomAvatar(() => 0,'avatar-01')).toBe('avatar-02');
    expect(randomAvatar(() => 1,'avatar-20')).toBe('avatar-19');
  });
});
