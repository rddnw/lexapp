import hmac
import os
from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from rag import ask_legal_question, get_retriever


app = FastAPI(
    title="LEX Legal Assistant",
    version="1.0.0",
    description="Private inference API for the Sri Lankan legal-document assistant.",
)
bearer = HTTPBearer(auto_error=False)


class Question(BaseModel):
    question: str = Field(min_length=1, max_length=4000)


def require_service_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> None:
    expected = os.environ.get("LEGAL_AI_API_KEY", "")
    if not expected:
        raise HTTPException(status_code=503, detail="Assistant API is not configured.")
    if not credentials or not hmac.compare_digest(credentials.credentials, expected):
        raise HTTPException(status_code=401, detail="Invalid service credentials.")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/ready", dependencies=[Depends(require_service_token)])
def ready() -> dict[str, str]:
    if not os.environ.get("GROQ_API_KEY"):
        raise HTTPException(status_code=503, detail="Assistant model or legal corpus is not ready.")
    try:
        get_retriever()
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    return {"status": "ready"}


@app.post("/chat", dependencies=[Depends(require_service_token)])
async def chat(payload: Question) -> dict:
    try:
        result = await run_in_threadpool(ask_legal_question, payload.question.strip())
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail="Legal assistant is not configured.") from error
    return result
