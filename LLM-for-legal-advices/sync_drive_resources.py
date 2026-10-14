import argparse
from html.parser import HTMLParser
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen
from uuid import uuid4

from dotenv import load_dotenv


DEFAULT_FOLDER_ID = "1_o1qKqHiF_fsOhFzlF0N1RtP1EiakqfV"
MAX_FILE_BYTES = 25 * 1024 * 1024
MAX_TOTAL_BYTES = 512 * 1024 * 1024
MAX_FOLDER_DEPTH = 8
USER_AGENT = "LEX-Legal-Corpus-Sync/1.0"

load_dotenv(Path(__file__).parent / ".env")


class DriveEntryParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.entries: list[dict[str, str]] = []
        self._entry: dict[str, str] | None = None
        self._div_depth = 0
        self._title_depth: int | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attributes = dict(attrs)
        classes = set((attributes.get("class") or "").split())
        if tag == "div" and "flip-entry" in classes:
            self._entry = {"title": "", "href": ""}
            self._div_depth = 1
            return
        if self._entry is None:
            return
        if tag == "div":
            self._div_depth += 1
            if "flip-entry-title" in classes:
                self._title_depth = self._div_depth
        elif tag == "a" and not self._entry["href"]:
            self._entry["href"] = attributes.get("href") or ""

    def handle_endtag(self, tag: str) -> None:
        if tag != "div" or self._entry is None:
            return
        if self._title_depth == self._div_depth:
            self._title_depth = None
        self._div_depth -= 1
        if self._div_depth == 0:
            if self._entry["title"] and self._entry["href"]:
                self.entries.append(self._entry)
            self._entry = None

    def handle_data(self, data: str) -> None:
        if self._entry is not None and self._title_depth is not None:
            self._entry["title"] += data


def request_bytes(url: str, limit: int) -> bytes:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    last_error: Exception | None = None
    for attempt in range(5):
        try:
            with urlopen(request, timeout=45) as response:
                content = response.read(limit + 1)
            break
        except HTTPError as error:
            if error.code not in {429, 500, 502, 503, 504}:
                raise RuntimeError(
                    f"Unable to retrieve a shared Google Drive resource (HTTP {error.code})."
                ) from error
            last_error = error
        except (URLError, TimeoutError) as error:
            last_error = error
        if attempt < 4:
            time.sleep(0.5 * (2**attempt))
    else:
        raise RuntimeError("Google Drive remained unavailable after five download attempts.") from last_error
    if len(content) > limit:
        raise RuntimeError(f"Google Drive resource exceeded the {limit}-byte download limit.")
    return content


def drive_entries(folder_id: str) -> list[dict[str, str]]:
    folder_url = f"https://drive.google.com/embeddedfolderview?id={quote(folder_id)}#list"
    page = request_bytes(folder_url, 12 * 1024 * 1024).decode("utf-8", errors="replace")
    parser = DriveEntryParser()
    parser.feed(page)
    if not parser.entries:
        raise RuntimeError(
            f"No public entries were found in Drive folder {folder_id}. "
            "Check that the folder is shared with anyone who has the link."
        )
    return parser.entries


def get_drive_id(entry: dict[str, str], kind: str) -> str | None:
    parsed = urlparse(entry["href"])
    if kind == "folder":
        match = re.fullmatch(r"/drive/folders/([A-Za-z0-9_-]+)", parsed.path)
    else:
        match = re.fullmatch(r"/file/d/([A-Za-z0-9_-]+)/view", parsed.path)
    return match.group(1) if match else None


def safe_name(name: str) -> str:
    sanitized = PurePosixPath(name.replace("\\", "/")).name
    if not sanitized or sanitized in {".", ".."}:
        raise RuntimeError("Google Drive returned an invalid resource name.")
    return sanitized


def collect_text_files(
    folder_id: str,
    visited: set[str] | None = None,
    relative_path: PurePosixPath = PurePosixPath(),
    depth: int = 0,
) -> list[tuple[str, PurePosixPath]]:
    if depth > MAX_FOLDER_DEPTH:
        raise RuntimeError("The Google Drive folder nesting exceeds the configured limit.")
    visited = visited if visited is not None else set()
    if folder_id in visited:
        return []
    visited.add(folder_id)

    files: list[tuple[str, PurePosixPath]] = []
    for entry in drive_entries(folder_id):
        name = safe_name(entry["title"])
        if name.lower().endswith(".txt"):
            file_id = get_drive_id(entry, "file")
            if file_id:
                files.append((file_id, relative_path / name))
            continue
        child_folder_id = get_drive_id(entry, "folder")
        if child_folder_id:
            files.extend(
                collect_text_files(
                    child_folder_id,
                    visited,
                    relative_path / name,
                    depth + 1,
                )
            )
    return files


def download_text_file(file_id: str) -> bytes:
    url = f"https://drive.google.com/uc?export=download&id={quote(file_id)}"
    content = request_bytes(url, MAX_FILE_BYTES)
    if not content.strip() or content.lstrip().lower().startswith((b"<!doctype html", b"<html")):
        raise RuntimeError(
            f"Google Drive did not return text file {file_id}. "
            "Check sharing permissions and whether the file is downloadable."
        )
    return content


def sync_resources(folder_id: str, output_directory: Path) -> tuple[int, int]:
    files = collect_text_files(folder_id)
    if not files:
        raise RuntimeError(f"No .txt resources were found in Google Drive folder {folder_id}.")

    output_directory = output_directory.resolve()
    output_directory.parent.mkdir(parents=True, exist_ok=True)
    total_bytes = 0

    with tempfile.TemporaryDirectory(
        prefix=".lex-drive-staging-",
        dir=output_directory.parent,
    ) as temporary_directory:
        staging_directory = Path(temporary_directory)
        for index, (file_id, relative_path) in enumerate(files, start=1):
            content = download_text_file(file_id)
            total_bytes += len(content)
            if total_bytes > MAX_TOTAL_BYTES:
                raise RuntimeError(
                    f"Drive corpus exceeded the {MAX_TOTAL_BYTES}-byte total download limit."
                )
            target = staging_directory.joinpath(*relative_path.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
            if index == 1 or index % 25 == 0 or index == len(files):
                print(f"Downloaded {index}/{len(files)}: {relative_path}")
            time.sleep(0.1)

        backup_directory = None
        if output_directory.exists():
            backup_directory = output_directory.with_name(
                f".{output_directory.name}.previous-{uuid4().hex}"
            )
            output_directory.replace(backup_directory)
        try:
            staging_directory.replace(output_directory)
        except OSError:
            if backup_directory and backup_directory.exists():
                backup_directory.replace(output_directory)
            raise

    return len(files), total_bytes


def main() -> None:
    default_output = Path(
        os.environ.get(
            "LEGAL_DRIVE_OUTPUT_DIR",
            str(Path(__file__).parent / "legal_data" / "text" / "drive-source"),
        )
    )
    parser = argparse.ArgumentParser(
        description="Sync shared Google Drive .txt legal resources for local indexing."
    )
    parser.add_argument(
        "--folder-id",
        default=os.environ.get("LEGAL_DRIVE_FOLDER_ID", DEFAULT_FOLDER_ID),
        help="Public Google Drive folder ID (defaults to the LEX legal-resource folder).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=default_output,
        help="Managed directory to replace with the downloaded .txt resources.",
    )
    args = parser.parse_args()
    count, total_bytes = sync_resources(args.folder_id, args.output_dir)
    print(f"Synced {count} legal text files ({total_bytes:,} bytes) to {args.output_dir.resolve()}")


if __name__ == "__main__":
    main()
