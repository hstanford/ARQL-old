/**
 * Data source utilities
 */
import {
  DataSource,
  ContextualisedField,
  isDataReference,
  isParam,
  isDataField,
} from './types.js';
import { uniq } from './util.js';

export class UnresolveableSource extends DataSource<any, any> {}
export const Unresolveable = new UnresolveableSource();

export function combine(fields: ContextualisedField[]) {
  return fields.reduce((acc, m) => {
    let sources: DataSource<any, any>[] = [];
    if (m.type === 'datafield') {
      sources = Array.isArray(m.source) ? m.source : [m.source];
    } else if (m.type === 'datamodel') {
      for (const field of m.fields) {
        if (isDataField(field)) {
          const source = field.source;
          Array.isArray(source)
            ? sources.push(...source)
            : sources.push(source);
        }
      }
      sources = uniq(sources);
    } else if (isParam(m)) {
      sources = [];
    } else if (isDataReference(m)) {
      sources = uniq([m.model.source, m.other.source]);
    } else {
      sources = m.sources;
    }
    return acc.concat(sources);
  }, [] as DataSource<any, any>[]);
}
