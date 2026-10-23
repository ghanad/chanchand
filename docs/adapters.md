# Adapter Notes

Read this when adding or changing a price source.

## Files

- Interface and shared types: `src/lib/adapters/types.ts` (`PriceAdapter`, `PriceObservation`, `PriceObservationRaw`)
- Registry and aliases: `src/lib/adapters/index.ts` (`getAdapter`, `adapters` map)
- Generic CSS selector scraping: `src/lib/adapters/genericHtml.ts`
- Digikala API: `src/lib/adapters/digikalaApi.ts`
- Digikala Web (HTML/SSR): `src/lib/adapters/digikalaWeb.ts`
- BRSAPI gold and currency markets: `src/lib/adapters/brsapiMarket.ts`
- Adapter tests: `tests/adapters.test.ts`

## Contracts

- `PriceAdapter.fetch(target: ProductTarget, source: SourceConfig)` returns `Promise<PriceObservation>`.
- Use `adapter_settings` for source-specific and target-specific options (e.g., CSS selector, API tokens).
- Throw descriptive errors for expected source parsing/selection failures so `runner.ts` logs them to `fetch_errors`.
- Normalize prices to IRR (`price_irr`) before returning observations (using `normalizeDigits` and `parsePriceString` from `src/lib/pricing.ts`).
- Respect `price_multiplier` (e.g., 10 for TOMAN to IRR conversion).
- Set `availability` to `'in_stock'`, `'out_of_stock'`, or `'unknown'`.

## Test Routing

Run tests using Vitest:

```bash
# Run all tests
npm test

# Run only adapter tests
npx vitest tests/adapters.test.ts
```

## Adding a New Adapter

1. **Implement Adapter**: Create a file in `src/lib/adapters/yourAdapter.ts` implementing the `PriceAdapter` interface with an async `fetch` method.
2. **Register in Index**: Add the adapter instance to the `adapters` record in `src/lib/adapters/index.ts`.
3. **Allow in Config Schema**: Add your adapter name to `SourceConfigSchema` in `src/lib/config.ts`.
4. **Update UI Dropdown**: Add your adapter option to the dropdown in `src/components/views/SourcesView.tsx`.
5. **Add Tests**: Add unit tests in `tests/adapters.test.ts` with test fixtures or mocks.
