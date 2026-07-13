import os
import pytest
import pytest_asyncio
import uuid
from datetime import date
from decimal import Decimal
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import StaticPool

# Set test environment DB before importing app main
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"
os.environ["DATABASE_URL"] = TEST_DB_URL

from app.main import app
from app.db.session import get_db
from app.models.base import Base
from app.models.models import User, Party, Product, Invoice, LedgerEntry, PurchaseReturn, PaymentTransaction, InvoiceAdjustment
from app.security.auth import get_password_hash

# Create test engine and session
test_engine = create_async_engine(
    TEST_DB_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = async_sessionmaker(
    bind=test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

@pytest_asyncio.fixture(scope="function", autouse=True)
async def setup_test_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

async def override_get_db():
    async with TestingSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

app.dependency_overrides[get_db] = override_get_db

def get_json(res):
    d = res.json()
    if isinstance(d, dict) and d.get("success") is True and "data" in d:
        return d["data"]
    return d

@pytest.mark.asyncio
async def test_complete_business_flow():
    # 1. Initialize client and seed default users
    async with TestingSessionLocal() as db:
        admin_pwd = get_password_hash("password123")
        admin_user = User(
            username="admin",
            password_hash=admin_pwd,
            full_name="Admin User",
            role="admin",
            is_active=True
        )
        db.add(admin_user)
        
        # Add products
        p1 = Product(name="ULTRATECH CEMENT", party_type="customer", default_unit="BAG", default_rate=Decimal("400.00"), is_active=True)
        p2 = Product(name="IRON RODS 12MM", party_type="customer", default_unit="TON", default_rate=Decimal("60000.00"), is_active=True)
        db.add_all([p1, p2])
        await db.commit()
        
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 2. Login to get JWT
        login_res = await client.post("/api/auth/login", json={"username": "admin", "password": "password123"})
        assert login_res.status_code == 200
        token = get_json(login_res)["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 3. Create Customer
        party_payload = {
            "name": "Suresh Traders",
            "party_type": "customer",
            "opening_balance": 1000.00,
            "mobile": "9999999999"
        }
        party_res = await client.post("/api/parties/", json=party_payload, headers=headers)
        assert party_res.status_code == 201
        party_data = get_json(party_res)
        party_id = party_data["id"]
        assert party_data["balance"] == 1000.00
        
        # 4. Create Invoice
        invoice_payload = {
            "party_id": party_id,
            "party_type": "customer",
            "invoice_date": date.today().isoformat(),
            "items": [
                {
                    "product_name": "ULTRATECH CEMENT",
                    "quantity": 20,
                    "rate": 400.00,
                    "discount_pct": 0,
                    "gst_pct": 0,
                    "item_type": "bill_item"
                },
                {
                    "product_name": "IRON RODS 12MM",
                    "quantity": 1,
                    "rate": 60000.00,
                    "discount_pct": 0,
                    "gst_pct": 0,
                    "item_type": "bill_item"
                }
            ]
        }
        invoice_res = await client.post("/api/invoices/", json=invoice_payload, headers=headers)
        assert invoice_res.status_code == 201
        invoice_data = get_json(invoice_res)["invoice"]
        assert invoice_data["total_amount"] == 68000.00
        
        # Verify customer balance: 1000 + 68000 = 69000
        summary_res = await client.get(f"/api/parties/{party_id}/summary", headers=headers)
        assert summary_res.status_code == 200
        assert get_json(summary_res)["current_balance"] == 69000.00
        
        # 5. Partial Purchase Return (Return 5 Cement, 0.5 Ton Rods)
        # Total returns: (5 * 400 = 2000) + (0.5 * 60000 = 30000) = 32000.00
        return_payload = {
            "party_id": party_id,
            "party_type": "customer",
            "return_date": date.today().isoformat(),
            "reference_invoice_id": invoice_data["id"],
            "items": [
                {
                    "product_name": "ULTRATECH CEMENT",
                    "quantity": 5,
                    "rate": 400.00,
                    "discount_pct": 0,
                    "gst_pct": 0,
                    "item_type": "bill_item"
                },
                {
                    "product_name": "IRON RODS 12MM",
                    "quantity": 0.5,
                    "rate": 60000.00,
                    "discount_pct": 0,
                    "gst_pct": 0,
                    "item_type": "bill_item"
                }
            ]
        }
        return_res = await client.post("/api/returns/", json=return_payload, headers=headers)
        assert return_res.status_code == 201
        return_data = get_json(return_res)["return"]
        assert return_data["total_amount"] == 32000.00
        
        # Customer balance should be: 69000 - 32000 = 37000
        summary_res2 = await client.get(f"/api/parties/{party_id}/summary", headers=headers)
        assert get_json(summary_res2)["current_balance"] == 37000.00
            
        # 6. Payment Transaction (Customer pays ₹30,000)
        payment_payload = {
            "customer_id": party_id,
            "payment_type": "RECEIVED",
            "amount": 30000.00,
            "payment_mode": "cash",
            "transaction_date": date.today().isoformat()
        }
        payment_res = await client.post("/api/payments/", json=payment_payload, headers=headers)
        assert payment_res.status_code == 201
        payment_data = get_json(payment_res)["transaction"]
        assert get_json(payment_res)["new_balance"] == 7000.00
        
        # 7. Check ledger history and calculations
        ledger_res = await client.get(f"/api/ledger/{party_id}", headers=headers)
        assert ledger_res.status_code == 200
        ledger_data = get_json(ledger_res)
        assert len(ledger_data["entries"]) == 3  # Invoice (debit), Return (credit), Payment (credit)
        # Final running balance check:
        # start: 1000.00 (opening balance)
        # Entry 1 (Invoice): 1000 + 68000 = 69000
        # Entry 2 (Return): 69000 - 32000 = 37000
        # Entry 3 (Payment): 37000 - 30000 = 7000
        assert ledger_data["entries"][0]["running_balance"] == 69000.00
        assert ledger_data["entries"][1]["running_balance"] == 37000.00
        assert ledger_data["entries"][2]["running_balance"] == 7000.00


@pytest.mark.asyncio
async def test_reports_endpoints():
    # Setup test data
    async with TestingSessionLocal() as db:
        admin_pwd = get_password_hash("password123")
        admin_user = User(
            username="admin",
            password_hash=admin_pwd,
            full_name="Admin User",
            role="admin",
            is_active=True
        )
        db.add(admin_user)
        await db.commit()
        
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Login
        login_res = await client.post("/api/auth/login", json={"username": "admin", "password": "password123"})
        token = get_json(login_res)["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # Create customer
        party_res = await client.post("/api/parties/", json={
            "name": "Test Customer",
            "party_type": "customer",
            "opening_balance": 500.00,
            "mobile": "1234567890"
        }, headers=headers)
        party_data = get_json(party_res)
        party_id = party_data["id"]
        
        # Create invoice
        invoice_res = await client.post("/api/invoices/", json={
            "party_id": party_id,
            "party_type": "customer",
            "invoice_date": date.today().isoformat(),
            "items": [
                {
                    "product_name": "TEST PRODUCT",
                    "quantity": 2,
                    "rate": 1000.00,
                    "discount_pct": 0,
                    "gst_pct": 0,
                    "item_type": "bill_item"
                }
            ]
        }, headers=headers)
        assert invoice_res.status_code == 201
        
        # 1. Test JSON Monthly Sales Report
        res = await client.get("/api/reports/monthly-sales", headers=headers)
        assert res.status_code == 200
        sales_data = get_json(res)
        assert sales_data["num_invoices"] == 1
        assert sales_data["total_sales"] == 2000.00
        
        # 2. Test JSON Customer Ledger Report
        res = await client.get(f"/api/reports/customer-ledger/{party_id}", headers=headers)
        assert res.status_code == 200
        ledger_data = get_json(res)
        assert ledger_data["party"]["name"] == "TEST CUSTOMER"
        assert ledger_data["summary"]["total_debit"] == 2000.00
        
        # 3. Test PDF Monthly Sales Download
        res = await client.get("/api/reports/monthly-sales/pdf", headers=headers)
        assert res.status_code == 200
        assert res.headers["content-type"] == "application/pdf"
        assert len(res.content) > 0
        
        # 4. Test Excel Monthly Sales Download
        res = await client.get("/api/reports/monthly-sales/excel", headers=headers)
        assert res.status_code == 200
        assert res.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        assert len(res.content) > 0
        
        # 5. Test PDF Customer Ledger Download
        res = await client.get(f"/api/reports/customer-ledger/pdf?customer_id={party_id}", headers=headers)
        assert res.status_code == 200
        assert res.headers["content-type"] == "application/pdf"
        assert len(res.content) > 0
        
        # 6. Test Excel Customer Ledger Download
        res = await client.get(f"/api/reports/customer-ledger/excel?customer_id={party_id}", headers=headers)
        assert res.status_code == 200
        assert res.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        assert len(res.content) > 0
