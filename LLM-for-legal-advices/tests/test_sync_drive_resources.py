import tempfile
import unittest
from pathlib import Path, PurePosixPath
from unittest.mock import patch

from sync_drive_resources import DriveEntryParser, collect_text_files, sync_resources


class DriveResourceSyncTests(unittest.TestCase):
    def test_folder_parser_reads_file_and_folder_links(self):
        html = """
        <div class="flip-entries">
          <div class="flip-entry" id="entry-file">
            <div class="flip-entry-info">
              <a href="https://drive.google.com/file/d/file-id/view?usp=drive_web">
                <div class="flip-entry-title">statute.txt</div>
              </a>
            </div>
          </div>
          <div class="flip-entry" id="entry-folder">
            <div class="flip-entry-info">
              <a href="https://drive.google.com/drive/folders/folder-id">
                <div class="flip-entry-title">nested</div>
              </a>
            </div>
          </div>
        </div>
        """
        parser = DriveEntryParser()
        parser.feed(html)
        self.assertEqual(
            parser.entries,
            [
                {
                    "title": "statute.txt",
                    "href": "https://drive.google.com/file/d/file-id/view?usp=drive_web",
                },
                {
                    "title": "nested",
                    "href": "https://drive.google.com/drive/folders/folder-id",
                },
            ],
        )

    def test_collection_walks_folders_and_ignores_non_text_files(self):
        listing = {
            "root": [
                {
                    "title": "data",
                    "href": "https://drive.google.com/drive/folders/text-folder",
                },
                {
                    "title": "index.bin",
                    "href": "https://drive.google.com/file/d/index-id/view",
                },
            ],
            "text-folder": [
                {
                    "title": "act.txt",
                    "href": "https://drive.google.com/file/d/act-id/view",
                },
                {
                    "title": "book.pdf",
                    "href": "https://drive.google.com/file/d/pdf-id/view",
                },
            ],
        }
        with patch("sync_drive_resources.drive_entries", side_effect=lambda folder_id: listing[folder_id]):
            files = collect_text_files("root")
        self.assertEqual(files, [("act-id", PurePosixPath("data/act.txt"))])

    def test_sync_replaces_only_its_managed_corpus_and_keeps_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "drive-source"
            output.mkdir()
            (output / "old.txt").write_text("old corpus", encoding="utf-8")
            with (
                patch(
                    "sync_drive_resources.collect_text_files",
                    return_value=[("act-id", PurePosixPath("data/act.txt"))],
                ),
                patch("sync_drive_resources.download_text_file", return_value=b"new corpus"),
            ):
                count, total_bytes = sync_resources("folder-id", output)

            self.assertEqual((count, total_bytes), (1, len(b"new corpus")))
            self.assertEqual((output / "data" / "act.txt").read_bytes(), b"new corpus")
            backups = list(Path(directory).glob(".drive-source.previous-*"))
            self.assertEqual(len(backups), 1)
            self.assertEqual((backups[0] / "old.txt").read_text(encoding="utf-8"), "old corpus")


if __name__ == "__main__":
    unittest.main()
