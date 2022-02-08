import { Pg } from './postgresql';

export function postgresql() {
  return new Pg();
}
