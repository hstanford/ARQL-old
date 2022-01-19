import { Pg } from './postgresql.js';

export function postgresql () {
  return new Pg();
};
