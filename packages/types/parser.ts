export type OpChar =
  | '+'
  | '-'
  | '*'
  | '/'
  | '<'
  | '>'
  | '='
  | '~'
  | '!'
  | '@'
  | '#'
  | '%'
  | '^'
  | '&'
  | '`'
  | '?'
  | ':'
  | '|';

export interface Alphachain {
  type: 'alphachain';
  root: string;
  parts: string[];
}

export function isAlphachain(ipt: any): ipt is Alphachain {
  return ipt?.type === 'alphachain';
}

export interface Param {
  type: 'param';
  index: number;
}

export interface Op {
  type: 'op';
  symbol: string;
}

export function isOp(ipt: any): ipt is Op {
  return ipt?.type === 'op';
}

export type Expr = ExprTree | Param | Alphachain | Collection;
export type ExprUnary = SubExpr | FunctionCall | Op;

export type SubExpr = Expr | Param | Alphachain;

export interface ExprTree {
  type: 'exprtree';
  op: string;
  args: ExprUnary[];
}

export interface FunctionCall {
  type: 'function';
  expr: Expr;
  args: Expr[];
}

export function isFunction(ipt: any): ipt is FunctionCall {
  return ipt?.type === 'function';
}

export interface Transform {
  type: 'transform';
  description: Alphachain;
  args: (Expr | Shape | Collection)[];
}

export interface Collection {
  type: 'collection';
  alias: string | undefined;
  value: Alphachain | Collection[] | Collection | null;
  transforms: Transform[];
  shape: Shape | Shape[] | null;
}

export interface Model {
  type: 'model';
  alias: string | null;
  value: Alphachain;
}

export function isModel(ipt: any): ipt is Model {
  return ipt?.type === 'model';
}

export interface Dest {
  type: 'dest';
  alias: string | null;
  transforms: Transform[];
  shape: Shape | null;
  value: string;
}

export function isDest(ipt: any): ipt is Dest {
  return ipt?.type === 'dest';
}

export interface Field {
  type: 'field';
  alias: string | null;
  value: Collection | Expr;
}

export function isField(ipt: any): ipt is Field {
  return ipt?.type === 'field';
}

export interface Wildcard {
  type: 'wildcard';
  value: '*';
  root?: string;
  parts?: string[];
}

export function isWildcard(ipt: any): ipt is Wildcard {
  return ipt?.type === 'wildcard';
}

export interface Shape {
  type: 'shape';
  fields: (Field | Wildcard)[];
}

export function isShape(ipt: any): ipt is Shape {
  return ipt?.type === 'shape';
}

export interface Query {
  type: 'query';
  sourceCollection: Collection | null;
  modifier: Modifier | undefined;
  dest: Dest | undefined;
}

export type Modifier = '->' | '-+' | '-x';

export class MultiCollection extends Map {}