import Database from 'better-sqlite3';
import { runMigrations } from './migrations';
import { seedDefaultSourcesIfEmpty, seedManagedProductsIfEmpty } from './seeds';

export { runMigrations } from './migrations';
export { seedDefaultSourcesIfEmpty, seedManagedProductsIfEmpty } from './seeds';

export function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at DATETIME NOT NULL,
      finished_at DATETIME,
      status VARCHAR(32) NOT NULL DEFAULT 'running',
      config_path TEXT,
      target_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      error_count INTEGER NOT NULL DEFAULT 0,
      trigger_source VARCHAR(64) DEFAULT 'manual',
      trigger_details TEXT
    );

    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id),
      key VARCHAR(128) NOT NULL,
      adapter VARCHAR(64) NOT NULL,
      config_json JSON NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_sources_run_id ON sources(run_id);
    CREATE INDEX IF NOT EXISTS ix_sources_key ON sources(key);

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id),
      key VARCHAR(128) NOT NULL,
      title TEXT NOT NULL,
      config_json JSON NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_products_run_id ON products(run_id);
    CREATE INDEX IF NOT EXISTS ix_products_key ON products(key);

    CREATE TABLE IF NOT EXISTS product_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id),
      product_key VARCHAR(128) NOT NULL,
      source_key VARCHAR(128) NOT NULL,
      url TEXT NOT NULL,
      enabled BOOLEAN NOT NULL,
      config_json JSON NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_product_targets_run_id ON product_targets(run_id);
    CREATE INDEX IF NOT EXISTS ix_product_targets_product_key ON product_targets(product_key);
    CREATE INDEX IF NOT EXISTS ix_product_targets_source_key ON product_targets(source_key);

    CREATE TABLE IF NOT EXISTS managed_products (
      key VARCHAR(128) PRIMARY KEY,
      title TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id),
      is_public INTEGER NOT NULL DEFAULT 0,
      show_usd_chart INTEGER NOT NULL DEFAULT 0,
      active_start_hour INTEGER NOT NULL DEFAULT 8,
      active_end_hour INTEGER NOT NULL DEFAULT 23,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    );

    CREATE TABLE IF NOT EXISTS managed_targets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_key VARCHAR(128) NOT NULL,
      source_key VARCHAR(128) NOT NULL,
      url TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT 1,
      adapter_settings JSON NOT NULL DEFAULT '{}',
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_managed_targets_product_key ON managed_targets(product_key);
    CREATE INDEX IF NOT EXISTS ix_managed_targets_source_key ON managed_targets(source_key);

    CREATE TABLE IF NOT EXISTS price_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id),
      product_key VARCHAR(128) NOT NULL,
      source_key VARCHAR(128) NOT NULL,
      url TEXT NOT NULL,
      title TEXT,
      seller TEXT,
      price_irr INTEGER,
      availability VARCHAR(32) NOT NULL DEFAULT 'unknown',
      observed_at DATETIME NOT NULL,
      raw_observation JSON NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_price_snapshots_run_id ON price_snapshots(run_id);
    CREATE INDEX IF NOT EXISTS ix_price_snapshots_product_key ON price_snapshots(product_key);
    CREATE INDEX IF NOT EXISTS ix_price_snapshots_source_key ON price_snapshots(source_key);
    CREATE INDEX IF NOT EXISTS ix_price_snapshots_observed_at ON price_snapshots(observed_at);

    CREATE TABLE IF NOT EXISTS fetch_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES runs(id),
      product_key VARCHAR(128) NOT NULL,
      source_key VARCHAR(128) NOT NULL,
      url TEXT NOT NULL,
      error_type VARCHAR(128) NOT NULL,
      message TEXT NOT NULL,
      observed_at DATETIME NOT NULL,
      raw_observation JSON NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_fetch_errors_run_id ON fetch_errors(run_id);
    CREATE INDEX IF NOT EXISTS ix_fetch_errors_product_key ON fetch_errors(product_key);
    CREATE INDEX IF NOT EXISTS ix_fetch_errors_source_key ON fetch_errors(source_key);
    CREATE INDEX IF NOT EXISTS ix_fetch_errors_observed_at ON fetch_errors(observed_at);

    CREATE TABLE IF NOT EXISTS managed_sources (
      key VARCHAR(128) PRIMARY KEY,
      adapter VARCHAR(64) NOT NULL,
      timeout_seconds REAL NOT NULL DEFAULT 15.0,
      rate_limit_seconds REAL NOT NULL DEFAULT 2.0,
      currency VARCHAR(16) NOT NULL DEFAULT 'IRR',
      price_multiplier INTEGER NOT NULL DEFAULT 1,
      headers JSON NOT NULL DEFAULT '{}',
      settings JSON NOT NULL DEFAULT '{}',
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username VARCHAR(64) UNIQUE NOT NULL,
      email VARCHAR(128) UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'viewer',
      must_change_password INTEGER NOT NULL DEFAULT 0,
      wallet_balance INTEGER NOT NULL DEFAULT 0,
      extra_slots INTEGER NOT NULL DEFAULT 0,
      slot_expires_at DATETIME DEFAULT NULL,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_users_username ON users(username);

    CREATE TABLE IF NOT EXISTS user_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_key VARCHAR(128) NOT NULL REFERENCES managed_products(key) ON DELETE CASCADE,
      custom_title TEXT,
      last_manual_refresh_at DATETIME DEFAULT NULL,
      created_at DATETIME NOT NULL,
      UNIQUE(user_id, product_key)
    );
    CREATE INDEX IF NOT EXISTS ix_user_products_user_id ON user_products(user_id);
    CREATE INDEX IF NOT EXISTS ix_user_products_product_key ON user_products(product_key);

    CREATE TABLE IF NOT EXISTS product_refresh_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_key VARCHAR(128) NOT NULL,
      refreshed_at DATETIME NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_product_refresh_logs_user_product ON product_refresh_logs(user_id, product_key, refreshed_at);

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      type VARCHAR(32) NOT NULL,
      description TEXT,
      created_at DATETIME NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_wallet_transactions_user_id ON wallet_transactions(user_id);

    CREATE TABLE IF NOT EXISTS packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key VARCHAR(64) UNIQUE NOT NULL,
      title VARCHAR(128) NOT NULL,
      slots INTEGER NOT NULL,
      price_toman INTEGER NOT NULL,
      duration_days INTEGER NOT NULL DEFAULT 30,
      description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_packages_key ON packages(key);
    CREATE INDEX IF NOT EXISTS ix_packages_is_active ON packages(is_active);

    CREATE TABLE IF NOT EXISTS payment_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      package_id INTEGER REFERENCES packages(id),
      package_title VARCHAR(128) NOT NULL,
      slots INTEGER NOT NULL,
      amount_toman INTEGER NOT NULL,
      gateway VARCHAR(64) NOT NULL,
      authority VARCHAR(128) UNIQUE,
      ref_id VARCHAR(128),
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      meta JSON NOT NULL DEFAULT '{}',
      paid_at DATETIME,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_payment_transactions_user_id ON payment_transactions(user_id);
    CREATE INDEX IF NOT EXISTS ix_payment_transactions_authority ON payment_transactions(authority);
    CREATE INDEX IF NOT EXISTS ix_payment_transactions_status ON payment_transactions(status);

    CREATE TABLE IF NOT EXISTS user_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slots INTEGER NOT NULL,
      price_toman INTEGER NOT NULL,
      duration_days INTEGER NOT NULL DEFAULT 30,
      source_type VARCHAR(32) NOT NULL,
      package_id INTEGER REFERENCES packages(id),
      package_key VARCHAR(64),
      package_title VARCHAR(128),
      payment_transaction_id INTEGER REFERENCES payment_transactions(id),
      starts_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_user_subscriptions_user_id ON user_subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS ix_user_subscriptions_status ON user_subscriptions(status);
    CREATE INDEX IF NOT EXISTS ix_user_subscriptions_expires_at ON user_subscriptions(expires_at);
  `);
}

export function initDatabase(db: Database.Database): void {
  createTables(db);
  runMigrations(db);
  seedDefaultSourcesIfEmpty(db);
  seedManagedProductsIfEmpty(db);
}
