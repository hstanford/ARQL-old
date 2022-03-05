import { DataSource, ContextualisedField } from './types.js';
import { uniq } from './util.js';

export class UnresolveableSource extends DataSource<any, any> {}
export const Unresolveable = new UnresolveableSource();

export function combine(fields: ContextualisedField[]) {
  return fields.reduce((acc, m) => {
    let sources: DataSource<any, any>[] = [];
    if (m.type === 'datafield') {
      sources = [m.source];
    } else if (m.type === 'datamodel') {
      sources = uniq(m.fields.map((f) => f.source));
    } else if (m.type === 'param') {
      sources = [];
    } else {
      sources = m.sources;
    }
    return acc.concat(sources);
  }, [] as DataSource<any, any>[]);
}
