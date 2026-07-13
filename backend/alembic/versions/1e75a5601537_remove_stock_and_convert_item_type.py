"""remove_stock_and_convert_item_type

Revision ID: 1e75a5601537
Revises: 6539a82b1bbe
Create Date: 2026-07-12 16:35:14.844448

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1e75a5601537'
down_revision: Union[str, Sequence[str], None] = '6539a82b1bbe'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Drop products.stock_qty
    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.drop_column('stock_qty')

    # 2. Alter invoice_items.item_type
    with op.batch_alter_table('invoice_items', schema=None) as batch_op:
        batch_op.alter_column('item_type',
                   existing_type=sa.VARCHAR(length=9),
                   type_=sa.String(length=20),
                   existing_nullable=False)


def downgrade() -> None:
    # 1. Add products.stock_qty back
    with op.batch_alter_table('products', schema=None) as batch_op:
        batch_op.add_column(sa.Column('stock_qty', sa.Float(), nullable=True))

    # 2. Alter invoice_items.item_type back
    with op.batch_alter_table('invoice_items', schema=None) as batch_op:
        batch_op.alter_column('item_type',
                   existing_type=sa.String(length=20),
                   type_=sa.VARCHAR(length=9),
                   existing_nullable=False)
