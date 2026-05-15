# Adapter Notes

Read this when adding or changing a price source.

## Files

- Interface and shared types: `src/price_getter/adapters/base.py`
- Registry and aliases: `src/price_getter/adapters/__init__.py`
- Generic selector scraping: `src/price_getter/adapters/generic_html.py`
- Digikala API: `src/price_getter/adapters/digikala_api.py`
- Digikala HTML: `src/price_getter/adapters/digikala_web.py`
- BRSAPI markets: `src/price_getter/adapters/brsapi_market.py`
- Adapter tests: `tests/test_adapters.py`

## Contracts

- `PriceAdapter.fetch()` returns a `PriceObservation`.
- Use `adapter_settings` for source-specific and target-specific options.
- Use `AdapterError` for expected source parsing/selection failures.
- Keep aliases in `adapters/__init__.py` and compatibility imports in `adapters/digikala.py` unless intentionally changing public behavior.
- Normalize prices to IRR before returning observations.

## Test Routing

- Generic HTML: `test_generic_html_*`
- Digikala HTML: `test_digikala_web_*`
- Digikala API: `test_digikala_api_*`
- BRSAPI: `test_brsapi_*`

Run focused tests first:

```bash
.venv/bin/pytest tests/test_adapters.py -k digikala_api
.venv/bin/pytest tests/test_adapters.py -k brsapi
```
