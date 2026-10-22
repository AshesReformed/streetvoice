// A tiny in-memory stand-in for the Supabase query builder, covering the
// calls the pipeline makes: select/insert/upsert/update with eq/neq/in/is/not/lt/gte filters,
// order, limit, single/maybeSingle, and awaiting a builder directly.
// It also mimics the complaints status-change trigger (status_history row).

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

let idCounter = 0;
let clock = Date.parse('2026-10-01T00:00:00Z');

export class FakeDb {
  tables: Record<string, Row[]> = {
    departments: [],
    citizens: [],
    complaints: [],
    call_logs: [],
    status_history: [],
    sms_messages: [],
  };

  from(table: string) {
    return new Query(this, table);
  }

  insertRows(table: string, rows: Row[]): Row[] {
    const inserted = rows.map((row) => {
      const full: Row = { id: `${table}-${++idCounter}`, created_at: new Date(clock++).toISOString(), ...row };
      if (table === 'complaints') {
        full.tracking_id ??= String(100000 + idCounter);
        full.processing_attempts ??= 0;
        full.report_count ??= 1;
      }
      return full;
    });
    (this.tables[table] ??= []).push(...inserted);
    return inserted;
  }
}

class Query implements PromiseLike<{ data: unknown; error: null }> {
  private op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
  private filters: Filter[] = [];
  private values: Row | Row[] = {};
  private orderCol: string | null = null;
  private ascending = true;
  private limitN: number | null = null;

  constructor(private db: FakeDb, private table: string) {}

  select() {
    return this;
  }
  insert(values: Row | Row[]) {
    this.op = 'insert';
    this.values = values;
    return this;
  }
  /** Only `{ ignoreDuplicates: true }` on the id: an existing id is skipped */
  upsert(values: Row | Row[]) {
    this.op = 'upsert';
    this.values = values;
    return this;
  }
  update(values: Row) {
    this.op = 'update';
    this.values = values;
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push((row) => row[col] === value);
    return this;
  }
  neq(col: string, value: unknown) {
    this.filters.push((row) => row[col] !== value);
    return this;
  }
  in(col: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[col]));
    return this;
  }
  /** Only `.is(col, null)`: a missing column counts as null */
  is(col: string) {
    this.filters.push((row) => row[col] == null);
    return this;
  }
  /** Only `.not(col, 'is', null)` */
  not(col: string) {
    this.filters.push((row) => row[col] != null);
    return this;
  }
  gte(col: string, value: string) {
    this.filters.push((row) => String(row[col]) >= value);
    return this;
  }
  lt(col: string, value: string) {
    this.filters.push((row) => String(row[col]) < value);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.ascending = opts?.ascending ?? true;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }

  private run(): Row[] {
    const rows = (this.db.tables[this.table] ??= []);
    if (this.op === 'upsert') {
      const fresh = (Array.isArray(this.values) ? this.values : [this.values]).filter(
        (v) => !rows.some((r) => r.id === v.id)
      );
      return this.db.insertRows(this.table, fresh);
    }
    if (this.op === 'insert') {
      return this.db.insertRows(this.table, Array.isArray(this.values) ? this.values : [this.values]);
    }
    let matched = rows.filter((row) => this.filters.every((f) => f(row)));
    if (this.op === 'update') {
      for (const row of matched) {
        const before = row.status;
        Object.assign(row, this.values);
        if (this.table === 'complaints' && 'status' in this.values && before !== row.status) {
          this.db.insertRows('status_history', [
            { complaint_id: row.id, status: row.status, remark: null, updated_by: null },
          ]);
        }
      }
      return matched;
    }
    if (this.orderCol) {
      const col = this.orderCol;
      const dir = this.ascending ? 1 : -1;
      matched = [...matched].sort((a, b) => (String(a[col]) < String(b[col]) ? -dir : dir));
    }
    if (this.limitN !== null) matched = matched.slice(0, this.limitN);
    return matched.map((row) => ({ ...row }));
  }

  async single() {
    const rows = this.run();
    return rows.length === 1
      ? { data: rows[0], error: null }
      : { data: null, error: { message: `expected 1 row, got ${rows.length}` } };
  }
  async maybeSingle() {
    return { data: this.run()[0] ?? null, error: null };
  }
  then<T1 = { data: unknown; error: null }, T2 = never>(
    onFulfilled?: ((value: { data: unknown; error: null }) => T1 | PromiseLike<T1>) | null,
    onRejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return Promise.resolve({ data: this.run() as unknown, error: null as null }).then(onFulfilled, onRejected);
  }
}
