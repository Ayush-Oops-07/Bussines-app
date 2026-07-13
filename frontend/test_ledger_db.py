import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from backend.app.services import ledger_service
from backend.app.models.models import Party
from sqlalchemy import select

async def main():
    engine = create_async_engine("sqlite+aiosqlite:///./sandeep_traders.db")
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as db:
        # Get first customer
        party_res = await db.execute(select(Party).limit(1))
        party = party_res.scalar()
        if not party:
            print("No party found")
            return
        print(f"Testing for party: {party.name} ({party.id})")
        
        # Test 1: calling with None parameters
        res1 = await ledger_service.get_ledger(db, party.id, from_date=None, to_date=None, search_q="")
        print(f"None params entries count: {len(res1['entries'])}")

if __name__ == "__main__":
    asyncio.run(main())
