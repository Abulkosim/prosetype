import { afterEach, describe, expect, it } from 'vitest';

import { resetCommandStore, useCommandStore } from '../src/command/commandStore';

afterEach(() => {
  resetCommandStore();
});

describe('commandStore', () => {
  it('starts closed', () => {
    expect(useCommandStore.getState().isOpen).toBe(false);
  });

  it('open/close/toggle move between states', () => {
    const store = useCommandStore.getState();
    store.open();
    expect(useCommandStore.getState().isOpen).toBe(true);
    store.close();
    expect(useCommandStore.getState().isOpen).toBe(false);
    store.toggle();
    expect(useCommandStore.getState().isOpen).toBe(true);
    store.toggle();
    expect(useCommandStore.getState().isOpen).toBe(false);
  });
});
