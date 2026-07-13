import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.db.session import engine, AsyncSessionLocal
from app.models.base import Base
from app.db.seed import seed_defaults
from app.api.endpoints import (
    auth,
    parties,
    products,
    invoices,
    returns,
    payments,
    adjustments,
    ledger,
    audit,
    dashboard,
    reports
)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("sandeep-traders")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Initialize Database Tables
    logger.info("Initializing database tables...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables initialized.")
    
    # 2. Seed Default Data
    logger.info("Seeding default data...")
    async with AsyncSessionLocal() as session:
        await seed_defaults(session)
    logger.info("Lifespan startup complete.")
    
    yield
    
    # Shutdown
    await engine.dispose()
    logger.info("Lifespan shutdown complete.")

app = FastAPI(
    title="Sandeep Traders Business Suite",
    description="Enterprise API Backend (FastAPI + SQLAlchemy + PostgreSQL)",
    version="2.0.0",
    lifespan=lifespan
)

from app.core.config import settings
from app.middleware.security import (
    SecurityHeadersMiddleware,
    RequestTracingMiddleware,
    ResponseEnvelopeMiddleware
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register security, tracing, and response wrapping middlewares
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestTracingMiddleware)
app.add_middleware(ResponseEnvelopeMiddleware)

# Register endpoints
app.include_router(auth.router)
app.include_router(parties.router)
app.include_router(products.router)
app.include_router(invoices.router)
app.include_router(returns.router)
app.include_router(payments.router)
app.include_router(adjustments.router)
app.include_router(ledger.router)
app.include_router(audit.router)
app.include_router(dashboard.router)
app.include_router(reports.router)

# Mount backwards compatibility aliases
app.include_router(products.router, prefix="/api/invoices")

from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

# Centralized Error Handlers
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    logger.warning(f"HTTP exception on {request.url.path}: {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "message": exc.detail,
            "code": f"HTTP_{exc.status_code}",
            "errors": []
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning(f"Validation error on {request.url.path}: {exc.errors()}")
    errors = []
    for err in exc.errors():
        errors.append({
            "field": ".".join(map(str, err["loc"])),
            "message": err["msg"]
        })
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "success": False,
            "message": "Validation Error",
            "code": "VALIDATION_ERROR",
            "errors": errors
        }
    )

@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    logger.warning(f"Value/Business validation failure on {request.url.path}: {exc}")
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={
            "success": False,
            "message": str(exc),
            "code": "BAD_REQUEST",
            "errors": []
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception on {request.url.path}: {exc}")
    # Do not leak internal paths or db tracebacks
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "message": "An unexpected error occurred. Please contact your administrator.",
            "code": "INTERNAL_SERVER_ERROR",
            "errors": []
        }
    )

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "sandeep-traders"}
