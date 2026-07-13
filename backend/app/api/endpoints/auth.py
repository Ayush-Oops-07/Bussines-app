from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Response, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from backend.app.db.session import get_db
from backend.app.models.models import User
from backend.app.schemas.schemas import UserLogin, UserResponse, UserChangePassword
from backend.app.security.auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    get_current_user,
    decode_token
)
from backend.app.services.audit import log_action

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/login")
async def login(
    payload: UserLogin,
    response: Response,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    username = payload.username.strip().lower()
    password = payload.password
    
    result = await db.execute(select(User).where(func.lower(User.username) == username, User.is_deleted == False))
    user = result.scalars().first()
    
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        
    verified, should_rehash = verify_password(password, user.password_hash)
    if not verified:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        
    if should_rehash:
        user.password_hash = get_password_hash(password)
        db.add(user)
        
    user.last_login = datetime.utcnow()
    db.add(user)
    
    # Create tokens
    access_token = create_access_token(data={"sub": user.username})
    refresh_token = create_refresh_token(data={"sub": user.username})
    
    # Log Action
    ip_addr = request.client.host if request.client else None
    await log_action(
        db=db,
        action="login",
        table_name="users",
        record_id=user.id,
        user_id=user.id,
        username=user.username,
        ip_address=ip_addr,
        success=True
    )
    await db.commit()
    
    # Set cookies
    response.set_cookie(
        key="access_token",
        value=f"Bearer {access_token}",
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=15 * 60
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=7 * 24 * 60 * 60
    )
    
    return {
        "ok": True,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": {
            "id": str(user.id),
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role
        }
    }

@router.post("/logout")
async def logout(
    response: Response,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    ip_addr = request.client.host if request.client else None
    await log_action(
        db=db,
        action="logout",
        table_name="users",
        record_id=current_user.id,
        user_id=current_user.id,
        username=current_user.username,
        ip_address=ip_addr,
        success=True
    )
    await db.commit()
    
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token")
    return {"ok": True}

@router.post("/refresh")
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        # Fallback to JSON payload or headers
        body = await request.json()
        refresh_token = body.get("refresh_token")
        
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token missing")
        
    payload = decode_token(refresh_token, expected_type="refresh")
    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
        
    result = await db.execute(select(User).where(User.username == username, User.is_deleted == False))
    user = result.scalars().first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
        
    new_access_token = create_access_token(data={"sub": user.username})
    
    response.set_cookie(
        key="access_token",
        value=f"Bearer {new_access_token}",
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=15 * 60
    )
    
    return {
        "ok": True,
        "access_token": new_access_token
    }

@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "authenticated": True,
        "user": {
            "id": str(current_user.id),
            "username": current_user.username,
            "full_name": current_user.full_name,
            "role": current_user.role
        }
    }

@router.post("/change-password")
async def change_password(
    payload: UserChangePassword,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        
    verified, _ = verify_password(payload.old_password, current_user.password_hash)
    if not verified:
        raise HTTPException(status_code=401, detail="Current password incorrect")
        
    current_user.password_hash = get_password_hash(payload.new_password)
    db.add(current_user)
    
    ip_addr = request.client.host if request.client else None
    await log_action(
        db=db,
        action="change_password",
        table_name="users",
        record_id=current_user.id,
        user_id=current_user.id,
        username=current_user.username,
        ip_address=ip_addr,
        success=True
    )
    await db.commit()
    return {"ok": True}
