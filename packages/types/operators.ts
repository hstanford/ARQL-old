export interface Operator {
  name: string;
  pattern: (symbol | string)[];
}

export interface RankedOperator extends Operator {
  rank: number;
}
