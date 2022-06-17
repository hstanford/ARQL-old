import {
  AnyObj,
  DataSourceOpts,
  DelegatedQuery,
  DelegatedSource,
} from '@arql/core';

import SQL from '@arql/source-sql';
import Pg, {ClientConfig} from 'pg';

import { Sql } from 'sql-ts';

const a = Pg.Client;

interface PostgreSQLSourceOpts extends DataSourceOpts, ClientConfig {
  models: any;
}

export default class PostgresSQL extends SQL {
  params: any[] = [];
  db: Pg.Client; // instantiated database client to run the queries
  ready = false;
  readyListeners: (() => void)[] = [];

  supportsExpressions: boolean = true;
  supportsSubExpressions: boolean = false;
  supportsSubSources: boolean = false;
  supportsShaping: boolean = true;
  supportsFieldAliasing: boolean = false;
  supportsExpressionFields: boolean = false;
  supportsGraphFields: boolean = false; // like users {orders {name}}
  supportsRecursiveJoins: boolean = false;
  supportsInsert: boolean = false;
  supportsUpdate: boolean = false;
  supportsDelete: boolean = false;
  supportsStaticDataInjection: boolean = false; // like VALUES
  supportsQueryNarrowing: boolean = false; // id IN (...) type operations
  supportsSubscriptions: boolean = false;

  constructor(opts: PostgreSQLSourceOpts) {
    super({
      ...opts,
      sql: new Sql('postgres'),
    });
    this.db = new Pg.Client(opts);
    this.db.connect((err?: Error) => {
      if (err) {
        throw err;
      } else {
        this.ready = true;
        this.readyListeners.forEach(listener => listener());
        this.readyListeners = [];
      }
    });
  }

  async untilReady() {
    if (this.ready) return;
    return new Promise((resolve) => {
      this.readyListeners.push(() => resolve(undefined));
    });
  }

  async resolve(
    ast: DelegatedQuery | DelegatedSource,
    data: AnyObj[] | null,
    results: AnyObj[][],
    params: any[]
  ) {
    await this.untilReady();
    const query = await this.resolveQueryObject(ast, data, results, params);
    if (!query || !('toQuery' in query && typeof query.toQuery === 'function')) {
      throw new Error("Couldn't resolve query");
    }
    const { rows: out } = await this.db.query(query.toQuery());
    return out;
  }
}
