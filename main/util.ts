import type { Alphachain, ContextualisedSource } from './types.js';
import { isAlphachain } from './types.js';

export function uniq<T>(arr: T[]) {
  return arr.filter(
    (field, idx, self) => idx === self.findIndex((f2) => f2 === field)
  );
}

export function uniqBy<T>(arr: T[], key: keyof T) {
  return arr.filter(
    (field, idx, self) => idx === self.findIndex((f2) => f2[key] === field[key])
  );
}

export function getAlias(ipt: string | Alphachain | null | undefined) {
  let alias: string = '';
  if (isAlphachain(ipt)) {
    alias = [ipt.root, ...ipt.parts].pop() || '';
  } else if (typeof ipt === 'string') {
    alias = ipt;
  }
  return alias;
}

export function getSourceName(source: ContextualisedSource): string {
  let name = '';
  if (source.alias) {
    name = source.alias;
  } else if (Array.isArray(source.value)) {
    name = '';
  } else {
    name = getAlias(source.value.alias || source.value.name);
  }
  return name;
}