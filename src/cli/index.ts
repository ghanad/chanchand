#!/usr/bin/env node
import { Command } from 'commander';
import { resolveConfigPath, loadConfig } from '../lib/config';
import {
  getDatabase,
  DEFAULT_DB_URL,
  latestSnapshots,
  productHistory,
  recentErrors,
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  getUserByUsername,
  getManagedSources,
  getManagedTargets,
  getManagedProducts,
} from '../lib/db';
import { PriceRunner } from '../lib/runner';
import { priceToman } from '../lib/serializers';
import { hashPassword } from '../lib/auth';

const program = new Command();
program.name('price-getter').description('Price collection CLI service for public ecommerce and market sources');

program
  .command('validate-config')
  .description('Validate configuration (from YAML file or SQLite database)')
  .option('-c, --config <path>', 'YAML config path')
  .option('--db-url <url>', 'Database URL or path', DEFAULT_DB_URL)
  .action((options) => {
    try {
      if (options.config) {
        const configPath = resolveConfigPath(options.config);
        const config = loadConfig(configPath);
        const activeTargets = (config.targets || []).filter((t) => t.enabled);
        const productsCount = Object.keys(config.products || {}).length;
        console.log(
          `Config is valid: ${Object.keys(config.sources).length} sources` +
            (productsCount
              ? `, ${productsCount} products, ${activeTargets.length}/${config.targets?.length || 0} active targets`
              : '')
        );
      } else {
        const db = getDatabase(options.dbUrl);
        const sources = getManagedSources(db);
        const targets = getManagedTargets(db);
        const products = getManagedProducts(db);
        const activeTargets = targets.filter((t) => t.enabled);
        console.log(
          `Database configuration is valid: ${sources.length} sources, ${products.length} products, ${activeTargets.length}/${targets.length} active targets`
        );
        db.close();
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('init-db')
  .description('Initialize the SQLite database schema')
  .option('--db-url <url>', 'Database URL or path', DEFAULT_DB_URL)
  .action((options) => {
    try {
      const db = getDatabase(options.dbUrl);
      console.log(`Database initialized: ${options.dbUrl}`);
      db.close();
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('run')
  .description('Run price collection for active targets')
  .option('-c, --config <path>', 'YAML config path')
  .option('--db-url <url>', 'Database URL or path', DEFAULT_DB_URL)
  .action(async (options) => {
    try {
      const runner = new PriceRunner(options.dbUrl);
      let summary;
      if (options.config) {
        summary = await runner.runConfigFile(options.config);
      } else {
        summary = await runner.run();
      }
      console.log(
        `Run ${summary.run_id} finished with status=${summary.status}; ` +
          `targets=${summary.target_count}, success=${summary.success_count}, errors=${summary.error_count}`
      );
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('latest')
  .description('Show latest price snapshots')
  .option('--db-url <url>', 'Database URL or path', DEFAULT_DB_URL)
  .option('--limit <number>', 'Maximum rows to display', '100')
  .option('--json', 'Output as JSON')
  .action((options) => {
    try {
      const db = getDatabase(options.dbUrl);
      const limit = parseInt(options.limit, 10) || 100;
      const rows = latestSnapshots(db, limit);
      db.close();

      if (rows.length === 0) {
        console.log('No price snapshots found.');
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(rows, null, 2));
        return;
      }

      console.table(
        rows.map((r) => ({
          product: r.product_key,
          source: r.source_key,
          toman: priceToman(r.price_irr),
          irr: r.price_irr,
          availability: r.availability,
          seller: r.seller,
          observed_at: r.observed_at,
        }))
      );
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('history <product_key>')
  .description('Show price history for a given product')
  .option('--source <key>', 'Filter by source key')
  .option('--db-url <url>', 'Database URL or path', DEFAULT_DB_URL)
  .option('--limit <number>', 'Maximum rows to display', '50')
  .option('--json', 'Output as JSON')
  .action((productKey, options) => {
    try {
      const db = getDatabase(options.dbUrl);
      const limit = parseInt(options.limit, 10) || 50;
      const rows = productHistory(db, productKey, options.source, limit);
      db.close();

      if (rows.length === 0) {
        console.log(`No history found for product: ${productKey}`);
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(rows, null, 2));
        return;
      }

      console.table(
        rows.map((r) => ({
          source: r.source_key,
          toman: priceToman(r.price_irr),
          irr: r.price_irr,
          availability: r.availability,
          seller: r.seller,
          observed_at: r.observed_at,
        }))
      );
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command('errors')
  .description('Show recent fetch errors')
  .option('--db-url <url>', 'Database URL or path', DEFAULT_DB_URL)
  .option('--limit <number>', 'Maximum rows to display', '50')
  .option('--json', 'Output as JSON')
  .action((options) => {
    try {
      const db = getDatabase(options.dbUrl);
      const limit = parseInt(options.limit, 10) || 50;
      const rows = recentErrors(db, limit);
      db.close();

      if (rows.length === 0) {
        console.log('No errors found.');
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(rows, null, 2));
        return;
      }

      console.table(
        rows.map((r) => ({
          product: r.product_key,
          source: r.source_key,
          error_type: r.error_type,
          message: r.message,
          observed_at: r.observed_at,
        }))
      );
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

const userCmd = program.command('user').description('Manage system users');

userCmd
  .command('list')
  .description('List all registered users')
  .option('--db-url <url>', 'Database URL or path', DEFAULT_DB_URL)
  .action((options) => {
    try {
      const db = getDatabase(options.dbUrl);
      const users = listUsers(db);
      db.close();
      if (users.length === 0) {
        console.log('No users found.');
        return;
      }
      console.table(users);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

userCmd
  .command('create')
  .description('Create a new user')
  .requiredOption('-u, --username <username>', 'Username')
  .requiredOption('-p, --password <password>', 'Password')
  .option('-r, --role <role>', 'Role (admin or viewer)', 'viewer')
  .option('-e, --email <email>', 'Email address')
  .option('--must-change-password', 'Force user to change password on next login', false)
  .option('--db-url <url>', 'Database URL or path', DEFAULT_DB_URL)
  .action(async (options) => {
    try {
      const db = getDatabase(options.dbUrl);
      const role = options.role === 'admin' ? 'admin' : 'viewer';
      const passwordHash = await hashPassword(options.password);
      const user = createUser(db, {
        username: options.username,
        password_hash: passwordHash,
        role,
        email: options.email || null,
        must_change_password: Boolean(options.mustChangePassword),
      });
      db.close();
      console.log(`User created successfully: ID=${user.id}, Username=${user.username}, Role=${user.role}, MustChangePassword=${user.must_change_password}`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

userCmd
  .command('reset-password')
  .description('Reset a user password')
  .requiredOption('-u, --username <username>', 'Username')
  .requiredOption('-p, --password <password>', 'New password')
  .option('--must-change-password', 'Force user to change password on next login', false)
  .option('--db-url <url>', 'Database URL or path', DEFAULT_DB_URL)
  .action(async (options) => {
    try {
      const db = getDatabase(options.dbUrl);
      const user = getUserByUsername(db, options.username);
      if (!user) {
        console.error(`User not found: ${options.username}`);
        process.exit(1);
      }
      const passwordHash = await hashPassword(options.password);
      const updateParams: { password_hash: string; must_change_password?: boolean } = { password_hash: passwordHash };
      if (options.mustChangePassword) {
        updateParams.must_change_password = true;
      }
      updateUser(db, user.id, updateParams);
      db.close();
      console.log(`Password reset successfully for user: ${options.username}`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

userCmd
  .command('delete')
  .description('Delete a user')
  .requiredOption('-u, --username <username>', 'Username')
  .option('--db-url <url>', 'Database URL or path', DEFAULT_DB_URL)
  .action((options) => {
    try {
      const db = getDatabase(options.dbUrl);
      const user = getUserByUsername(db, options.username);
      if (!user) {
        console.error(`User not found: ${options.username}`);
        process.exit(1);
      }
      deleteUser(db, user.id);
      db.close();
      console.log(`User deleted successfully: ${options.username}`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
