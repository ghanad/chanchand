#!/usr/bin/env node
import { Command } from 'commander';
import { resolveConfigPath, loadConfig } from '../lib/config';
import { getDatabase, DEFAULT_DB_URL, latestSnapshots, productHistory, recentErrors } from '../lib/db';
import { PriceRunner } from '../lib/runner';
import { priceToman } from '../lib/serializers';

const program = new Command();
program.name('price-getter').description('Price collection CLI service for public ecommerce and market sources');

program
  .command('validate-config')
  .description('Validate YAML configuration file')
  .option('-c, --config <path>', 'YAML config path')
  .action((options) => {
    try {
      const configPath = resolveConfigPath(options.config);
      const config = loadConfig(configPath);
      const activeTargets = config.targets.filter((t) => t.enabled);
      console.log(
        `Config is valid: ${Object.keys(config.sources).length} sources, ` +
          `${Object.keys(config.products).length} products, ` +
          `${activeTargets.length}/${config.targets.length} active targets`
      );
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
      const configPath = resolveConfigPath(options.config);
      const runner = new PriceRunner(options.dbUrl);
      const summary = await runner.runConfigFile(configPath);
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

program.parse(process.argv);
