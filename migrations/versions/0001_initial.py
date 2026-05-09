"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-09
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("config_path", sa.Text(), nullable=True),
        sa.Column("target_count", sa.Integer(), nullable=False),
        sa.Column("success_count", sa.Integer(), nullable=False),
        sa.Column("error_count", sa.Integer(), nullable=False),
    )
    op.create_table(
        "sources",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("runs.id"), nullable=False),
        sa.Column("key", sa.String(length=128), nullable=False),
        sa.Column("adapter", sa.String(length=64), nullable=False),
        sa.Column("config_json", sa.JSON(), nullable=False),
    )
    op.create_index("ix_sources_run_id", "sources", ["run_id"])
    op.create_index("ix_sources_key", "sources", ["key"])

    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("runs.id"), nullable=False),
        sa.Column("key", sa.String(length=128), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("config_json", sa.JSON(), nullable=False),
    )
    op.create_index("ix_products_run_id", "products", ["run_id"])
    op.create_index("ix_products_key", "products", ["key"])

    op.create_table(
        "product_targets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("runs.id"), nullable=False),
        sa.Column("product_key", sa.String(length=128), nullable=False),
        sa.Column("source_key", sa.String(length=128), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("config_json", sa.JSON(), nullable=False),
    )
    op.create_index("ix_product_targets_run_id", "product_targets", ["run_id"])
    op.create_index("ix_product_targets_product_key", "product_targets", ["product_key"])
    op.create_index("ix_product_targets_source_key", "product_targets", ["source_key"])

    op.create_table(
        "price_snapshots",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("runs.id"), nullable=False),
        sa.Column("product_key", sa.String(length=128), nullable=False),
        sa.Column("source_key", sa.String(length=128), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=True),
        sa.Column("seller", sa.Text(), nullable=True),
        sa.Column("price_irr", sa.Integer(), nullable=True),
        sa.Column("availability", sa.String(length=32), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("raw_observation", sa.JSON(), nullable=False),
    )
    op.create_index("ix_price_snapshots_run_id", "price_snapshots", ["run_id"])
    op.create_index("ix_price_snapshots_product_key", "price_snapshots", ["product_key"])
    op.create_index("ix_price_snapshots_source_key", "price_snapshots", ["source_key"])
    op.create_index("ix_price_snapshots_observed_at", "price_snapshots", ["observed_at"])

    op.create_table(
        "fetch_errors",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("run_id", sa.Integer(), sa.ForeignKey("runs.id"), nullable=False),
        sa.Column("product_key", sa.String(length=128), nullable=False),
        sa.Column("source_key", sa.String(length=128), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("error_type", sa.String(length=128), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("raw_observation", sa.JSON(), nullable=False),
    )
    op.create_index("ix_fetch_errors_run_id", "fetch_errors", ["run_id"])
    op.create_index("ix_fetch_errors_product_key", "fetch_errors", ["product_key"])
    op.create_index("ix_fetch_errors_source_key", "fetch_errors", ["source_key"])
    op.create_index("ix_fetch_errors_observed_at", "fetch_errors", ["observed_at"])


def downgrade() -> None:
    op.drop_table("fetch_errors")
    op.drop_table("price_snapshots")
    op.drop_table("product_targets")
    op.drop_table("products")
    op.drop_table("sources")
    op.drop_table("runs")
