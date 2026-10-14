import os
from datetime import datetime, timezone
from pathlib import Path
import shutil
from uuid import uuid4

from langchain_community.document_loaders import TextLoader
from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter
from dotenv import load_dotenv


load_dotenv(Path(__file__).parent / ".env")

# 1. Define the data directory
data_directory = Path(
    os.environ.get("LEGAL_TEXT_DATA_DIR", str(Path(__file__).parent / "legal_data" / "text"))
).resolve()
text_files = sorted(path for path in data_directory.rglob("*.txt") if path.is_file())
if not text_files:
    raise SystemExit(
        f"No legal .txt resources found under {data_directory}. "
        "Run sync_drive_resources.py first."
    )

print(f"Loading {len(text_files)} text files from {data_directory}...")
documents = []
for text_file in text_files:
    documents.extend(
        document
        for document in TextLoader(str(text_file), autodetect_encoding=True).load()
        if document.page_content.strip()
    )
if not documents:
    raise SystemExit("No non-empty legal text documents were found; vector index was not changed.")
print(f"Loaded {len(documents)} non-empty documents.")

# 3. Initialize the Text Splitter
text_splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    length_function=len,
    separators=["\n\n", "\n", " ", ""]
)

# 4. Split documents into smaller chunks
print("Splitting data into smaller chunks...")
chunks = text_splitter.split_documents(documents)

print(f"Total number of chunks created: {len(chunks)}")
if not chunks:
    raise SystemExit("No indexable legal text chunks were created; vector index was not changed.")

# 5. Load the Embedding Model
# This will download the open-source embedding model the first time it runs
print("\nLoading the embedding model (this may take a moment on the first run)...")
embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

# 6. Create and save the Vector Database (ChromaDB)
print("Converting chunks to vectors and creating ChromaDB...")
vector_db_path = os.environ.get(
    "VECTOR_DB_PATH", str(Path(__file__).parent / "vector_database")
)
vector_db_path = Path(vector_db_path).resolve()
vector_db_path.parent.mkdir(parents=True, exist_ok=True)
staging_path = vector_db_path.with_name(
    f".{vector_db_path.name}.building-{uuid4().hex}"
)
staging_path.mkdir(parents=True)

try:
    vector_db = Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        persist_directory=str(staging_path),
    )
    indexed_ids = vector_db.get(include=[])["ids"]
    if len(indexed_ids) != len(chunks):
        raise RuntimeError("The generated vector index does not contain every text chunk.")
except Exception:
    if "vector_db" in locals():
        vector_db._client.close()
        del vector_db
        shutil.rmtree(staging_path)
    raise

vector_db._client.close()
del vector_db

backup_path = None
if vector_db_path.exists():
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup_path = vector_db_path.with_name(f"{vector_db_path.name}.previous-{timestamp}")
    vector_db_path.replace(backup_path)
try:
    staging_path.replace(vector_db_path)
except OSError:
    if backup_path and backup_path.exists():
        backup_path.replace(vector_db_path)
    raise

print(
    f"Success! Indexed {len(chunks)} chunks from {len(documents)} documents "
    f"at '{vector_db_path}'."
)
