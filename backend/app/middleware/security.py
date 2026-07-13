"""
backend/app/middleware/security.py — Security headers and request tracing middleware.
"""

import time
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Appends standard HTTP security headers to all responses.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


class RequestTracingMiddleware(BaseHTTPMiddleware):
    """
    Adds X-Request-ID to requests and response headers for request tracking/audit.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        # Store on request state so it's accessible within routes/logger
        request.state.request_id = request_id

        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time

        response.headers["X-Request-ID"] = request_id
        response.headers["X-Process-Time"] = f"{process_time:.4f}s"
        return response


import json

class ResponseEnvelopeMiddleware(BaseHTTPMiddleware):
    """
    Wraps all successful API JSON responses inside { "success": true, "data": ... }
    """
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        
        # Only wrap API JSON responses, ignore docs, health checks, etc.
        content_type = response.headers.get("content-type") or ""
        if (
            request.url.path.startswith("/api/") and 
            not request.url.path.startswith("/api/health") and
            "application/json" in content_type and
            200 <= response.status_code < 300
        ):
            # Read and wrap the body
            body = b""
            async for chunk in response.body_iterator:
                body += chunk
            try:
                data = json.loads(body.decode("utf-8"))
                # If it's already in the wrapped shape, do not re-wrap
                if isinstance(data, dict) and "success" in data and ("data" in data or "message" in data):
                    wrapped = data
                else:
                    wrapped = {
                        "success": True,
                        "data": data
                    }
                new_body = json.dumps(wrapped).encode("utf-8")
                
                # Reconstruct response
                headers = dict(response.headers)
                headers["content-length"] = str(len(new_body))
                return Response(
                    content=new_body,
                    status_code=response.status_code,
                    headers=headers,
                    media_type="application/json"
                )
            except Exception:
                # Fallback to original body on error
                headers = dict(response.headers)
                return Response(
                    content=body,
                    status_code=response.status_code,
                    headers=headers,
                    media_type="application/json"
                )
        return response
