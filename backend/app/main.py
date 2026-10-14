import hashlib
from contextlib import asynccontextmanager
from pathlib import PurePosixPath
import re
from typing import Literal
from uuid import UUID, uuid4

import httpx
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field, field_validator
from postgrest.exceptions import APIError
from stream_chat import StreamChat
from storage3.exceptions import StorageException
from supabase_auth.errors import AuthApiError

from .auth import Principal, bearer_scheme, require_admin, require_principal
from .config import get_settings
from .supabase import get_auth_client, get_service_client


DOCUMENT_BUCKET = "lex-private-documents"
MAX_VERIFICATION_DOCUMENT_BYTES = 8 * 1024 * 1024
ALLOWED_DOCUMENT_TYPES = {
    "application/pdf": (".pdf", b"%PDF-"),
    "image/jpeg": (".jpg", b"\xff\xd8\xff"),
    "image/png": (".png", b"\x89PNG\r\n\x1a\n"),
}


class Registration(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: Literal["client", "lawyer"]

    @field_validator("full_name")
    @classmethod
    def normalize_full_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Name must contain at least two characters.")
        return value


class Login(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class RefreshSession(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=4096)


class LogoutSession(BaseModel):
    refresh_token: str = Field(min_length=1, max_length=4096)


class AssistantQuestion(BaseModel):
    question: str = Field(min_length=1, max_length=4000)

    @field_validator("question", mode="before")
    @classmethod
    def trim_question(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value


class ReviewDecision(BaseModel):
    decision: Literal["approved", "rejected"]
    review_note: str = Field(default="", max_length=1000)


class DocumentScanResult(BaseModel):
    scan_status: Literal["clean", "rejected"]


@asynccontextmanager
async def lifespan(_: FastAPI):
    get_settings()
    yield


app = FastAPI(
    title="LEX API",
    version="1.0.0",
    description="LEX authentication, legal-assistant, and Stream Chat API.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


def stream_client() -> StreamChat:
    settings = get_settings()
    if not settings.stream_api_key or not settings.stream_api_secret:
        raise HTTPException(status_code=503, detail="Chat service is not configured.")
    return StreamChat(api_key=settings.stream_api_key, api_secret=settings.stream_api_secret)


def service_client():
    try:
        return get_service_client()
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail="Database service is not configured.") from error


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/auth/register")
def register(payload: Registration) -> dict:
    try:
        result = get_auth_client().auth.sign_up(
            {
                "email": payload.email,
                "password": payload.password,
                "options": {
                    "data": {
                        "full_name": payload.full_name.strip(),
                        "role": payload.role,
                    }
                },
            }
        )
    except AuthApiError as error:
        raise HTTPException(status_code=400, detail="Unable to create the account.") from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail="Authentication service is not configured.") from error

    if not result.session:
        return {"confirmation_required": True}
    return {
        "confirmation_required": False,
        "access_token": result.session.access_token,
        "refresh_token": result.session.refresh_token,
        "expires_in": result.session.expires_in,
        "user": {
            "id": str(result.user.id),
            "email": result.user.email,
            "name": payload.full_name.strip(),
            "role": payload.role,
        },
    }


@app.post("/api/v1/auth/login")
def login(payload: Login) -> dict:
    try:
        result = get_auth_client().auth.sign_in_with_password(
            {"email": payload.email, "password": payload.password}
        )
    except AuthApiError as error:
        raise HTTPException(status_code=401, detail="Invalid email or password.") from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail="Authentication service is not configured.") from error

    if not result.session or not result.user:
        raise HTTPException(status_code=401, detail="Email confirmation is required.")

    profile = (
        service_client()
        .table("profiles")
        .select("full_name,role")
        .eq("id", str(result.user.id))
        .maybe_single()
        .execute()
        .data
    )
    if not profile:
        raise HTTPException(status_code=403, detail="Account profile is not available.")

    return {
        "access_token": result.session.access_token,
        "refresh_token": result.session.refresh_token,
        "expires_in": result.session.expires_in,
        "user": {
            "id": str(result.user.id),
            "email": result.user.email,
            "name": profile["full_name"],
            "role": profile["role"],
        },
    }


@app.post("/api/v1/auth/refresh")
def refresh_session(payload: RefreshSession) -> dict:
    try:
        result = get_auth_client().auth.refresh_session(payload.refresh_token)
    except AuthApiError as error:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.") from error
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail="Authentication service is not configured.") from error

    if not result.session or not result.user:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")

    profile = (
        service_client()
        .table("profiles")
        .select("full_name,role")
        .eq("id", str(result.user.id))
        .maybe_single()
        .execute()
        .data
    )
    if not profile:
        raise HTTPException(status_code=403, detail="Account profile is not available.")

    return {
        "access_token": result.session.access_token,
        "refresh_token": result.session.refresh_token,
        "expires_in": result.session.expires_in,
        "user": {
            "id": str(result.user.id),
            "email": result.user.email,
            "name": profile["full_name"],
            "role": profile["role"],
        },
    }


@app.post("/api/v1/auth/logout")
def logout(
    payload: LogoutSession,
    user: Principal = Depends(require_principal),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, bool]:
    if not user.id or not credentials:
        raise HTTPException(status_code=401, detail="Authentication required.")
    try:
        auth = get_auth_client().auth
        auth.set_session(credentials.credentials, payload.refresh_token)
        auth.sign_out()
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail="Authentication service is not configured.") from error
    except AuthApiError as error:
        raise HTTPException(status_code=401, detail="Unable to revoke this session.") from error
    return {"logged_out": True}


@app.get("/api/v1/lawyer-applications/me")
def get_my_lawyer_application(user: Principal = Depends(require_principal)) -> dict:
    if user.role != "lawyer":
        raise HTTPException(status_code=403, detail="Lawyer accounts only.")
    result = (
        service_client()
        .table("lawyer_applications")
        .select("id,mobile,bar_registration,experience_years,practice_area,jurisdiction,status,submitted_at,review_note")
        .eq("profile_id", user.id)
        .maybe_single()
        .execute()
    )
    return {"application": result.data}


@app.post("/api/v1/lawyer-applications", status_code=201)
def submit_lawyer_application(
    mobile: str = Form(min_length=10, max_length=10),
    bar_registration: str = Form(min_length=2, max_length=120),
    experience_years: int = Form(ge=0, le=70),
    practice_area: str = Form(min_length=2, max_length=120),
    jurisdiction: str = Form(min_length=2, max_length=160),
    consent: bool = Form(),
    verification_document: UploadFile = File(),
    user: Principal = Depends(require_principal),
) -> dict:
    if user.role != "lawyer":
        raise HTTPException(status_code=403, detail="Lawyer accounts only.")
    if not re.fullmatch(r"07[01245678][0-9]{7}", mobile):
        raise HTTPException(status_code=422, detail="Enter a valid Sri Lankan mobile number.")
    if not consent:
        raise HTTPException(status_code=422, detail="Application consent is required.")
    if not verification_document.filename:
        raise HTTPException(status_code=422, detail="A verification document is required.")

    mime_type = verification_document.content_type or ""
    accepted = ALLOWED_DOCUMENT_TYPES.get(mime_type)
    if not accepted:
        raise HTTPException(status_code=415, detail="Upload a PDF, JPEG, or PNG verification document.")
    extension, file_signature = accepted
    original_name = PurePosixPath(
        verification_document.filename.replace("\\", "/")
    ).name[:255]
    if not original_name or PurePosixPath(original_name).suffix.lower() not in (
        {".jpg", ".jpeg"} if mime_type == "image/jpeg" else {extension}
    ):
        raise HTTPException(status_code=415, detail="Use a filename extension matching the uploaded file.")
    contents = verification_document.file.read(MAX_VERIFICATION_DOCUMENT_BYTES + 1)
    if not contents or len(contents) > MAX_VERIFICATION_DOCUMENT_BYTES:
        raise HTTPException(status_code=413, detail="Verification documents must be at most 8 MB.")
    if not contents.startswith(file_signature):
        raise HTTPException(status_code=415, detail="The uploaded file does not match its declared type.")

    db = service_client()
    existing = (
        db.table("lawyer_applications")
        .select("id,status")
        .eq("profile_id", user.id)
        .maybe_single()
        .execute()
        .data
    )
    if existing:
        raise HTTPException(status_code=409, detail="A lawyer application already exists for this account.")

    document_id = str(uuid4())
    storage_path = f"lawyer-verification/{user.id}/{document_id}{extension}"
    storage = db.storage.from_(DOCUMENT_BUCKET)
    try:
        storage.upload(
            storage_path,
            contents,
            {"content-type": mime_type, "upsert": "false"},
        )
    except StorageException as error:
        raise HTTPException(status_code=502, detail="Private document storage is unavailable.") from error

    try:
        document_result = db.table("documents").insert(
            {
                "id": document_id,
                "owner_id": user.id,
                "category": "lawyer_verification",
                "storage_path": storage_path,
                "original_name": original_name,
                "content_type": mime_type,
                "size_bytes": len(contents),
            }
        ).execute()
    except APIError as error:
        storage.remove([storage_path])
        raise HTTPException(status_code=503, detail="Unable to save verification document metadata.") from error
    document = document_result.data[0]
    try:
        application_result = db.table("lawyer_applications").insert(
            {
                "profile_id": user.id,
                "mobile": mobile,
                "bar_registration": bar_registration.strip(),
                "experience_years": experience_years,
                "practice_area": practice_area.strip(),
                "jurisdiction": jurisdiction.strip(),
                "verification_document_id": document_id,
            }
        ).execute()
    except APIError as error:
        db.table("documents").delete().eq("id", document_id).execute()
        storage.remove([storage_path])
        raise HTTPException(status_code=503, detail="Unable to save the lawyer application.") from error

    return {
        "application": application_result.data[0],
        "document": {"id": document["id"], "scan_status": document["scan_status"]},
    }


@app.get("/api/v1/admin/lawyer-applications")
def list_lawyer_applications(user: Principal = Depends(require_admin)) -> dict:
    db = service_client()
    applications = (
        db
        .table("lawyer_applications")
        .select("id,profile_id,verification_document_id,mobile,bar_registration,experience_years,practice_area,jurisdiction,status,submitted_at,review_note")
        .eq("status", "pending")
        .order("submitted_at")
        .limit(100)
        .execute()
        .data
    )
    if not applications:
        return {"applications": []}
    profile_ids = [application["profile_id"] for application in applications]
    document_ids = [application["verification_document_id"] for application in applications]
    profiles = (
        db.table("profiles")
        .select("id,full_name")
        .in_("id", profile_ids)
        .execute()
        .data
    )
    documents = (
        db.table("documents")
        .select("id,original_name,scan_status")
        .in_("id", document_ids)
        .execute()
        .data
    )
    profile_names = {profile["id"]: profile["full_name"] for profile in profiles}
    documents_by_id = {document["id"]: document for document in documents}
    return {
        "applications": [
            {
                **application,
                "full_name": profile_names.get(application["profile_id"], "LEX lawyer"),
                "document": documents_by_id.get(application["verification_document_id"]),
            }
            for application in applications
        ]
    }


@app.get("/api/v1/admin/lawyer-applications/{application_id}/document")
def get_lawyer_application_document(
    application_id: UUID,
    user: Principal = Depends(require_admin),
) -> dict:
    del user
    db = service_client()
    application = (
        db.table("lawyer_applications")
        .select("verification_document_id")
        .eq("id", str(application_id))
        .maybe_single()
        .execute()
        .data
    )
    if not application:
        raise HTTPException(status_code=404, detail="Lawyer application was not found.")
    document = (
        db.table("documents")
        .select("storage_path,original_name,content_type,scan_status")
        .eq("id", application["verification_document_id"])
        .maybe_single()
        .execute()
        .data
    )
    if not document:
        raise HTTPException(status_code=404, detail="Verification document was not found.")
    try:
        signed_url = db.storage.from_(DOCUMENT_BUCKET).create_signed_url(
            document["storage_path"], 60
        )
    except StorageException as error:
        raise HTTPException(status_code=502, detail="Private document storage is unavailable.") from error
    return {
        "url": signed_url.get("signedURL"),
        "expires_in": 60,
        "file_name": document["original_name"],
        "content_type": document["content_type"],
        "scan_status": document["scan_status"],
    }


@app.post("/api/v1/admin/documents/{document_id}/scan-result")
def set_document_scan_result(
    document_id: UUID,
    payload: DocumentScanResult,
    user: Principal = Depends(require_admin),
) -> dict:
    result = (
        service_client()
        .table("documents")
        .update({"scan_status": payload.scan_status})
        .eq("id", str(document_id))
        .execute()
        .data
    )
    if not result:
        raise HTTPException(status_code=404, detail="Document was not found.")
    return {"scan_status": payload.scan_status}


@app.post("/api/v1/admin/lawyer-applications/{application_id}/review")
def review_lawyer_application(
    application_id: UUID,
    payload: ReviewDecision,
    user: Principal = Depends(require_admin),
) -> dict:
    result = service_client().rpc(
        "review_lawyer_application",
        {
            "application_id": str(application_id),
            "reviewer_id": user.id,
            "decision": payload.decision,
            "reviewer_note": payload.review_note,
        },
    ).execute()
    decision = result.data.get("result") if isinstance(result.data, dict) else None
    if decision == "not_found":
        raise HTTPException(status_code=404, detail="Lawyer application was not found.")
    if decision == "already_reviewed":
        raise HTTPException(status_code=409, detail="Lawyer application has already been reviewed.")
    if decision == "document_not_clean":
        raise HTTPException(status_code=409, detail="The verification document must pass a security scan first.")
    return {"status": decision}


@app.get("/api/v1/auth/me")
def me(user: Principal = Depends(require_principal)) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "verified": user.verified,
        "is_admin": user.is_admin,
    }


@app.post("/api/v1/assistant/messages")
async def assistant_message(
    payload: AssistantQuestion,
    user: Principal = Depends(require_principal),
) -> dict:
    settings = get_settings()
    if not settings.legal_ai_api_url or not settings.legal_ai_api_key:
        raise HTTPException(status_code=503, detail="Legal assistant is not configured.")
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=10.0)) as client:
            response = await client.post(
                settings.legal_ai_api_url,
                json={"question": payload.question.strip()},
                headers={"Authorization": f"Bearer {settings.legal_ai_api_key}"},
            )
            response.raise_for_status()
    except (httpx.TimeoutException, httpx.RequestError) as error:
        raise HTTPException(status_code=502, detail="The legal assistant is temporarily unavailable.") from error
    except httpx.HTTPStatusError as error:
        raise HTTPException(status_code=502, detail="The legal assistant could not answer this request.") from error

    try:
        result = response.json()
    except ValueError as error:
        raise HTTPException(status_code=502, detail="The legal assistant returned an invalid response.") from error
    answer = result.get("answer")
    sources = result.get("sources", [])
    if (
        not isinstance(result, dict)
        or not isinstance(answer, str)
        or not answer.strip()
        or not isinstance(sources, list)
        or any(not isinstance(source, str) for source in sources)
    ):
        raise HTTPException(status_code=502, detail="The legal assistant returned an invalid response.")
    return {"answer": answer, "sources": sources}


@app.get("/api/v1/lawyers")
def list_verified_lawyers(user: Principal = Depends(require_principal)) -> dict:
    db = service_client()
    response = (
        db
        .table("profiles")
        .select("id,full_name")
        .eq("role", "lawyer")
        .eq("is_verified", True)
        .order("full_name")
        .limit(100)
        .execute()
    )
    profiles = response.data
    if not profiles:
        return {"lawyers": []}
    applications = (
        db.table("lawyer_applications")
        .select("profile_id,practice_area,jurisdiction,experience_years")
        .in_("profile_id", [profile["id"] for profile in profiles])
        .eq("status", "approved")
        .execute()
        .data
    )
    by_profile = {application["profile_id"]: application for application in applications}
    return {
        "lawyers": [
            {
                **profile,
                "practice_area": by_profile.get(profile["id"], {}).get("practice_area"),
                "jurisdiction": by_profile.get(profile["id"], {}).get("jurisdiction"),
                "experience_years": by_profile.get(profile["id"], {}).get("experience_years"),
            }
            for profile in profiles
        ]
    }


@app.post("/api/v1/chat/direct/{other_user_id}")
def create_direct_chat(
    other_user_id: UUID,
    user: Principal = Depends(require_principal),
) -> dict:
    other_user_id = str(other_user_id)
    if user.id == other_user_id:
        raise HTTPException(status_code=400, detail="You cannot start a chat with yourself.")

    profiles = (
        service_client()
        .table("profiles")
        .select("id,full_name,role,is_verified")
        .in_("id", [user.id, other_user_id])
        .execute()
        .data
    )
    if len(profiles) != 2:
        raise HTTPException(status_code=404, detail="Chat participant was not found.")

    other = next((profile for profile in profiles if profile["id"] == other_user_id), None)
    if user.role == other["role"] or other["role"] not in ("client", "lawyer"):
        raise HTTPException(status_code=403, detail="Chats are available between clients and lawyers.")
    if (user.role == "lawyer" and not user.verified) or (
        other["role"] == "lawyer" and not other["is_verified"]
    ):
        raise HTTPException(status_code=403, detail="Only verified lawyers can join direct chats.")

    members = sorted([user.id, other_user_id])
    conversation_key = ":".join(members)
    db = service_client()
    existing_conversation = (
        db.table("chat_conversations")
        .select("provider_channel_id")
        .eq("conversation_key", conversation_key)
        .maybe_single()
        .execute()
        .data
    )
    if user.role == "lawyer" and not existing_conversation:
        raise HTTPException(status_code=403, detail="The client must initiate this conversation.")

    settings = get_settings()
    channel_id = (
        existing_conversation["provider_channel_id"]
        if existing_conversation
        else "lex-" + hashlib.sha256(conversation_key.encode()).hexdigest()[:40]
    )
    chat = stream_client()
    chat.upsert_users(
        [
            {"id": user.id, "name": user.name},
            {"id": other_user_id, "name": other["full_name"]},
        ]
    )
    channel = chat.channel("messaging", channel_id, {"members": members})
    channel.create(user.id, get_or_create=True)
    existing_members = {
        member.get("user_id")
        for member in channel.query().get("members", [])
        if member.get("user_id")
    }
    missing_members = [member_id for member_id in members if member_id not in existing_members]
    if missing_members:
        channel.add_members(missing_members, user_id=user.id)
    db.table("chat_conversations").upsert(
        {
            "conversation_key": conversation_key,
            "provider": "stream",
            "provider_channel_id": channel_id,
            "member_ids": members,
        },
        on_conflict="conversation_key",
    ).execute()
    token = chat.create_token(user.id)

    return {
        "api_key": settings.stream_api_key,
        "channel_id": channel_id,
        "channel_type": "messaging",
        "token": token,
        "user": {"id": user.id, "name": user.name},
        "other_user": {"id": other_user_id, "name": other["full_name"]},
    }


@app.get("/api/v1/chat/session")
def chat_session(user: Principal = Depends(require_principal)) -> dict:
    settings = get_settings()
    client = stream_client()
    client.upsert_user({"id": user.id, "name": user.name})
    return {
        "api_key": settings.stream_api_key,
        "token": client.create_token(user.id),
        "user": {"id": user.id, "name": user.name, "role": user.role},
    }


@app.post("/api/v1/chat/lawyer-lounge")
def get_lawyer_lounge(user: Principal = Depends(require_principal)) -> dict:
    if user.role != "lawyer" or not user.verified:
        raise HTTPException(status_code=403, detail="The lawyer lounge is available to verified lawyers.")

    settings = get_settings()
    client = stream_client()
    channel = client.channel(
        "messaging",
        "lex-lawyer-lounge",
        {"name": "LEX Lawyer Lounge", "members": [user.id]},
    )
    channel.create(user.id, get_or_create=True)
    current_members = {
        member.get("user_id")
        for member in channel.query().get("members", [])
        if member.get("user_id")
    }
    if user.id not in current_members:
        channel.add_members([user.id], user_id=user.id)
    return {
        "api_key": settings.stream_api_key,
        "channel_id": "lex-lawyer-lounge",
        "channel_type": "messaging",
        "token": client.create_token(user.id),
        "user": {"id": user.id, "name": user.name},
    }
