/* Minimal observable value that follows the Svelte store contract, so components
   read it as `$store`. */
export interface Store<T> {
  subscribe(fn: (value: T) => void): () => void;
  get(): T;
  set(value: T): void;
  update(fn: (value: T) => T): void;
}

export function store<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    subscribe(fn) {
      listeners.add(fn);
      fn(value);
      return () => listeners.delete(fn);
    },
    get: () => value,
    set(next) {
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach(fn => fn(value));
    },
    update(fn) { this.set(fn(value)); },
  };
}
