import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { avatarStorageKey, createAvatarStore, randomAvatar } from '../src/components/avatar-store';

function memoryStorage() { const values = new Map<string,string>(); return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string,value: string) => { values.set(key,value); } }; }
const photoData = `data:image/webp;base64,${readFileSync(new URL('./fixtures/avatars/portrait.webp', import.meta.url)).toString('base64')}`;
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
  it('persists a bounded photo, restores it per account and strips unrelated fields', () => {
    const storage = memoryStorage(), store = createAvatarStore(storage, () => 0);
    const photo = { kind: 'photo' as const, dataUrl: photoData, preset: 'avatar-05' as const };
    expect(store.save('alice', { ...photo, filename: 'private-name.png', email: 'must-not-persist@example.test' })).toBe('saved');
    expect(JSON.parse(storage.getItem(avatarStorageKey('alice'))!)).toEqual(photo);
    expect(createAvatarStore(storage).read('alice')).toEqual(photo);
    expect(store.read('bob')).toBe('avatar-01');
    expect([...storage.values.keys()].every(key => /^apcosys\.avatar\.v1:[a-f0-9]{16}$/.test(key))).toBe(true);
  });
  it('restoring a preset replaces the uploaded payload and syncs other views', () => {
    const storage = memoryStorage(), first = createAvatarStore(storage), second = createAvatarStore(storage);
    const photo = { kind: 'photo', dataUrl: photoData, preset: 'avatar-12' };
    first.save('alice', photo);
    expect(second.read('alice')).toEqual(photo);
    first.save('alice', 'avatar-12'); second.sync(avatarStorageKey('alice'));
    expect(second.read('alice')).toBe('avatar-12');
    expect(storage.getItem(avatarStorageKey('alice'))).toBe('avatar-12');
  });
  it('rejects unsafe photo records without changing the current choice', () => {
    const store = createAvatarStore(memoryStorage(), () => 0);
    expect(store.read('alice')).toBe('avatar-01');
    for (const dataUrl of ['https://example.test/photo.png', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/png;base64,' + 'A'.repeat(400_000)]) expect(store.save('alice', { kind: 'photo', dataUrl, preset: 'avatar-01' })).toBe('invalid');
    expect(store.save('alice', { kind: 'photo', dataUrl: photoData, preset: 'unknown' })).toBe('invalid');
    expect(store.read('alice')).toBe('avatar-01');
  });
  it('reports temporary persistence instead of claiming a blocked browser saved the photo', () => {
    const store = createAvatarStore({ getItem: () => null, setItem: () => { throw new Error('quota'); } });
    const photo = { kind: 'photo', dataUrl: photoData, preset: 'avatar-03' };
    expect(store.save('alice', photo)).toBe('temporary');
    expect(store.read('alice')).toEqual(photo);
  });
});
