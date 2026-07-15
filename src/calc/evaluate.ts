// Tiny arithmetic evaluator: + - * / parentheses, unary minus, and
// scientific notation (1.5e6, 2E-3). No functions, no eval().

type Token = { kind: 'num'; value: number } | { kind: 'op'; op: string };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const NUM = /^\d*\.?\d+(?:[eE][+-]?\d+)?/;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    if ('+-*/()'.includes(ch)) {
      tokens.push({ kind: 'op', op: ch });
      i++;
      continue;
    }
    const m = NUM.exec(expr.slice(i));
    if (m) {
      tokens.push({ kind: 'num', value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    throw new Error(`Unexpected '${ch}'`);
  }
  return tokens;
}

export function evaluate(expr: string): number {
  const tokens = tokenize(expr);
  if (tokens.length === 0) throw new Error('Empty');
  let pos = 0;

  const peek = () => tokens[pos];
  const takeOp = (...ops: string[]) => {
    const t = tokens[pos];
    if (t?.kind === 'op' && ops.includes(t.op)) {
      pos++;
      return t.op;
    }
    return null;
  };

  function parseExpr(): number {
    let value = parseTerm();
    let op;
    while ((op = takeOp('+', '-'))) {
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseFactor();
    let op;
    while ((op = takeOp('*', '/'))) {
      const rhs = parseFactor();
      value = op === '*' ? value * rhs : value / rhs;
    }
    return value;
  }

  function parseFactor(): number {
    if (takeOp('-')) return -parseFactor();
    if (takeOp('+')) return parseFactor();
    if (takeOp('(')) {
      const value = parseExpr();
      if (!takeOp(')')) throw new Error('Missing )');
      return value;
    }
    const t = peek();
    if (t?.kind === 'num') {
      pos++;
      return t.value;
    }
    throw new Error('Expected number');
  }

  const result = parseExpr();
  if (pos !== tokens.length) throw new Error('Trailing input');
  if (!Number.isFinite(result)) throw new Error('Not finite');
  return result;
}

/** Compact display formatting: up to 12 significant digits, exponential for extremes. */
export function formatResult(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e15) return n.toLocaleString('en-US');
  const abs = Math.abs(n);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) return n.toExponential(6).replace(/\.?0+e/, 'e');
  return String(Number(n.toPrecision(12)));
}
