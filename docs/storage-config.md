# Storage And Config Notes

Read this when changing YAML shape, database schema, or persistence behavior.

## Config

- Schema models live in `src/price_getter/config.py`.
- Example user config lives in `config/example.yml`.
- Safe product edits live in `src/price_getter/config_editor.py`.
- Config tests live in `tests/test_config.py` and `tests/test_config_editor.py`.
- CLI config validation is covered in `tests/test_cli.py`.

## Database

- SQLAlchemy models live in `src/price_getter/models.py`.
- Session setup lives in `src/price_getter/db.py`.
- Query/write behavior lives in `src/price_getter/repository.py`.
- Migrations live in `migrations/versions/`.
- Repository tests live in `tests/test_repository.py`.

## Change Checklist

- New YAML field: update Pydantic model, `config/example.yml`, validation tests, and any UI config editor handling.
- New adapter name: update config validation notes, adapter registry, `config/example.yml`, and adapter tests.
- New table or column: update model, migration, repository methods, serializers/output if displayed, and tests.
- Changed stored semantics: update code paths that read the field, not only the write path.
