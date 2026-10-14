# Sri Lanka legal-assistant service

This repository supplies the legal-retrieval model service used by the LEX website. LEX
continues to use its own existing frontend; the Streamlit page in this repository is only
an optional local preview.

## Configure and build the legal corpus

1. Create and activate a Python virtual environment, then install `requirements.txt`.
2. Copy `.env.example` to `.env`; set `GROQ_API_KEY` and a long random
   `LEGAL_AI_API_KEY`. Keep both values private. Set `LEGAL_AI_MODEL` to a model ID enabled
   for the configured Groq account.
3. Sync the shared legal text resources and build a fresh local index:

   ```powershell
   python sync_drive_resources.py
   python Code2_create_vector_database.py
   ```

   The default Drive folder ID is the public folder supplied for LEX. Override it with
   `LEGAL_DRIVE_FOLDER_ID` or `--folder-id` if the source folder changes. The sync downloads
   only `.txt` files into the ignored `legal_data/text/drive-source` directory; it does not
   copy the supplied, incomplete Chroma export. Existing local indexes are retained as
   timestamped backups when a new index is successfully built. Review document accuracy,
   copyright, and permission before indexing. Stop the assistant API before rebuilding an
   index so its open Chroma database can be safely replaced, especially on Windows.
4. Alternatively, put source PDFs under `legal_data/text/pdf` and run
   `python Pdf_to_txt_convert.py` before building the index.
5. Start the private API:

   ```powershell
   uvicorn api:app --app-dir . --host 127.0.0.1 --port 8100 --env-file .env
   ```

   For the LEX backend on a different host, bind the API only to a private network and
   protect it with a firewall or private service network. The bearer key is shared with
   `backend/.env` as `LEGAL_AI_API_KEY`.

The authenticated `POST /chat` endpoint accepts `{"question":"..."}` and returns an
answer with source filenames. `/health` is a liveness check; `/ready` requires the internal
bearer key and validates that the configured model key and non-empty vector index are ready.
The service does not persist user questions or responses.

## Security

The old Streamlit implementation contained a hard-coded Groq credential. It has been
removed from the working tree, but removing it from the current file does not revoke it
from Git history or prior copies. Revoke/rotate that credential with its provider before
deploying. Never put provider credentials in frontend code or commit `.env` files.
