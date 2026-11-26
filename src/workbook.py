"""Check the official UCI file before either workbook reader processes XML."""
import hashlib
from contextlib import contextmanager
from zipfile import ZipFile

import openpyxl

SHA256 = "43465a06f2ccf7c8b5bd2892bc7defb52f97487934fe93b16ae4c3936424676d"


@contextmanager
def verified_workbook(path):
    with open(path, "rb") as source:
        if hashlib.file_digest(source, "sha256").hexdigest() != SHA256:
            raise ValueError("Expected the original UCI Online Retail.xlsx release.")
        source.seek(0)
        with ZipFile(source) as archive:
            if sum(entry.file_size for entry in archive.infolist()) > 512 * 1024**2:
                raise ValueError("Workbook exceeds the 512 MiB expanded-size limit.")
        source.seek(0)
        book = openpyxl.load_workbook(source, read_only=True, data_only=True, keep_links=False)
        try:
            yield book
        finally:
            book.close()
