import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, lstatSync, openSync, closeSync, constants } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export type Plan = 'monthly' | 'yearly';
export interface CheckoutAttempt {
  key: string;
  started: number;
  plan: Plan;
  price: string;
  trial: boolean;
  sessionId: string | null;
}
export interface Account {
  owner: string;
  customer: string | null;
  created: number;
  trialUsed: boolean;
  checkout: CheckoutAttempt | null;
  status: string;
  plan: Plan | null;
  accessUntil: number;
  synced: number;
  hasSubscription: boolean;
  cancelAtPeriodEnd: boolean;
}
export interface LoginState {
  verifier: string;
  nonce: string;
}
export interface WebSession {
  owner: string;
  csrf: string;
}
export const randomToken = () => randomBytes(32).toString('base64url');
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const accountOwner = (issuer: string, subject: string) =>
  digest(JSON.stringify([issuer, subject]));

// One process / one private volume, matching the hosted MCP deployment. SQLite gives
// crash-safe transactions without granting billing access to the identity database.
export class BillingStore {
  private readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') {
      const fd = openSync(path, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
      closeSync(fd);
      if (!lstatSync(path).isFile()) throw new Error('Billing database must be a regular file');
      chmodSync(path, 0o600);
    }
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS billing_accounts (
        owner TEXT PRIMARY KEY, customer TEXT UNIQUE, payload TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS billing_events (id TEXT PRIMARY KEY, processed INTEGER NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS billing_sessions (
        token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, expires INTEGER NOT NULL, payload TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS billing_settings (name TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
    `);
  }
  close() {
    this.db.close();
  }
  bindConfiguration(value: string) {
    this.db
      .prepare('INSERT OR IGNORE INTO billing_settings VALUES (?, ?)')
      .run('deployment', value);
    const row = this.db
      .prepare('SELECT value FROM billing_settings WHERE name = ?')
      .get('deployment');
    if (row?.value !== value)
      throw new Error('Billing database belongs to a different deployment or Stripe mode');
  }
  account(owner: string): Account | null {
    const row = this.db.prepare('SELECT payload FROM billing_accounts WHERE owner = ?').get(owner);
    return row ? (JSON.parse(String(row.payload)) as Account) : null;
  }
  customerOwner(customer: string): string | null {
    const row = this.db
      .prepare('SELECT owner FROM billing_accounts WHERE customer = ?')
      .get(customer);
    return row ? String(row.owner) : null;
  }
  save(account: Account) {
    this.db
      .prepare(
        `INSERT INTO billing_accounts(owner, customer, payload) VALUES (?, ?, ?)
      ON CONFLICT(owner) DO UPDATE SET customer=excluded.customer, payload=excluded.payload`,
      )
      .run(account.owner, account.customer, JSON.stringify(account));
  }
  eventSeen(id: string) {
    return this.db.prepare('SELECT id FROM billing_events WHERE id = ?').get(id) !== undefined;
  }
  finishEvent(id: string, account: Account, now: number) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.save(account);
      this.db.prepare('INSERT OR IGNORE INTO billing_events VALUES (?, ?)').run(id, now);
      // Old redeliveries still reconcile current Stripe state after this bounded retention.
      this.db.prepare('DELETE FROM billing_events WHERE processed < ?').run(now - 90 * 86400);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  putSession(
    token: string,
    kind: 'login' | 'account',
    expires: number,
    payload: LoginState | WebSession,
    now: number,
  ) {
    this.db.prepare('DELETE FROM billing_sessions WHERE expires <= ?').run(now);
    const count = this.db.prepare('SELECT count(*) AS n FROM billing_sessions').get();
    if (Number(count?.n) >= 1000) throw new Error('Billing session capacity reached');
    this.db
      .prepare('INSERT INTO billing_sessions VALUES (?, ?, ?, ?)')
      .run(digest(token), kind, expires, JSON.stringify(payload));
  }
  session(token: string, kind: 'login', now: number): LoginState | null;
  session(token: string, kind: 'account', now: number): WebSession | null;
  session(token: string, kind: string, now: number): LoginState | WebSession | null {
    const row = this.db
      .prepare(
        'SELECT payload FROM billing_sessions WHERE token_hash = ? AND kind = ? AND expires > ?',
      )
      .get(digest(token), kind, now);
    return row ? (JSON.parse(String(row.payload)) as LoginState | WebSession) : null;
  }
  deleteSession(token: string) {
    this.db.prepare('DELETE FROM billing_sessions WHERE token_hash = ?').run(digest(token));
  }
}
