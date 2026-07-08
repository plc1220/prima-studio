import os
import shutil
import subprocess
from pathlib import Path
from urllib.parse import quote

from .settings import get_settings


class StorageClient:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.local_root = Path(self.settings.local_storage_root)
        self.local_root.mkdir(parents=True, exist_ok=True)

    @property
    def bucket(self) -> str:
        return self.settings.gcs_bucket_name or "local-bucket"

    def build_uri(self, workspace_id: str, prefix: str, filename: str) -> str:
        safe_filename = filename.replace("/", "_").replace(" ", "_")
        normalized_prefix = prefix.strip("/")
        return f"gs://{self.bucket}/{workspace_id}/{normalized_prefix}/{safe_filename}"

    def signed_upload_url(self, gcs_uri: str, content_type: str) -> str:
        if self.settings.gcs_bucket_name:
            try:
                from google.cloud import storage

                bucket_name, blob_name = parse_gcs_uri(gcs_uri)
                client = storage.Client()
                blob = client.bucket(bucket_name).blob(blob_name)
                return _generate_signed_url(blob, method="PUT", content_type=content_type, expiration=900)
            except Exception:
                # Local/dev fallback keeps the API usable when ADC is absent.
                pass
        return f"{self.settings.public_base_url}/local-upload?target={quote(gcs_uri)}"

    def signed_download_url(self, gcs_uri: str) -> str:
        if self.settings.gcs_bucket_name:
            try:
                from google.cloud import storage

                bucket_name, blob_name = parse_gcs_uri(gcs_uri)
                client = storage.Client()
                blob = client.bucket(bucket_name).blob(blob_name)
                return _generate_signed_url(blob, method="GET", expiration=3600)
            except Exception:
                pass
        return f"{self.settings.public_base_url}/local-download?target={quote(gcs_uri)}"

    def asset_content_url(self, asset_id: str) -> str:
        return f"{self.settings.public_base_url}/assets/{asset_id}/content"

    def local_path_for_uri(self, gcs_uri: str) -> Path:
        bucket, blob = parse_gcs_uri(gcs_uri)
        path = self.local_root / bucket / blob
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def write_text(self, gcs_uri: str, text: str, content_type: str = "text/plain") -> None:
        if self.settings.gcs_bucket_name:
            try:
                from google.cloud import storage

                bucket_name, blob_name = parse_gcs_uri(gcs_uri)
                storage.Client().bucket(bucket_name).blob(blob_name).upload_from_string(
                    text, content_type=content_type
                )
                return
            except Exception:
                pass
        self.local_path_for_uri(gcs_uri).write_text(text, encoding="utf-8")

    def write_bytes(self, gcs_uri: str, data: bytes, content_type: str = "application/octet-stream") -> None:
        if self.settings.gcs_bucket_name:
            try:
                from google.cloud import storage

                bucket_name, blob_name = parse_gcs_uri(gcs_uri)
                storage.Client().bucket(bucket_name).blob(blob_name).upload_from_string(
                    data, content_type=content_type
                )
                return
            except Exception:
                pass
        self.local_path_for_uri(gcs_uri).write_bytes(data)

    def read_text(self, gcs_uri: str) -> str:
        if self.settings.gcs_bucket_name:
            try:
                from google.cloud import storage

                bucket_name, blob_name = parse_gcs_uri(gcs_uri)
                return storage.Client().bucket(bucket_name).blob(blob_name).download_as_text()
            except Exception:
                pass
        return self.local_path_for_uri(gcs_uri).read_text(encoding="utf-8")

    def copy_file(self, source_path: str | os.PathLike[str], gcs_uri: str, content_type: str) -> None:
        if self.settings.gcs_bucket_name:
            try:
                from google.cloud import storage

                bucket_name, blob_name = parse_gcs_uri(gcs_uri)
                storage.Client().bucket(bucket_name).blob(blob_name).upload_from_filename(
                    str(source_path), content_type=content_type
                )
                return
            except Exception:
                pass
        destination = self.local_path_for_uri(gcs_uri)
        shutil.copyfile(source_path, destination)

    def read_bytes(self, gcs_uri: str, start: int | None = None, end: int | None = None) -> bytes:
        if self._should_try_cloud(gcs_uri):
            try:
                from google.cloud import storage

                bucket_name, blob_name = parse_gcs_uri(gcs_uri)
                blob = storage.Client().bucket(bucket_name).blob(blob_name)
                if start is not None or end is not None:
                    return blob.download_as_bytes(start=start, end=end)
                return blob.download_as_bytes()
            except Exception:
                fallback = self._json_api_download(gcs_uri, start=start, end=end)
                if fallback is not None:
                    return fallback
        path = self.local_path_for_uri(gcs_uri)
        if start is None and end is None:
            return path.read_bytes()
        with path.open("rb") as handle:
            handle.seek(start or 0)
            size = None if end is None else end - (start or 0) + 1
            return handle.read(size)

    def size(self, gcs_uri: str) -> int:
        if self._should_try_cloud(gcs_uri):
            try:
                from google.cloud import storage

                bucket_name, blob_name = parse_gcs_uri(gcs_uri)
                blob = storage.Client().bucket(bucket_name).get_blob(blob_name)
                if blob is not None and blob.size is not None:
                    return int(blob.size)
            except Exception:
                metadata = self._json_api_metadata(gcs_uri)
                if metadata and metadata.get("size") is not None:
                    return int(metadata["size"])
        return self.local_path_for_uri(gcs_uri).stat().st_size

    def delete_uri(self, gcs_uri: str) -> None:
        if self._should_try_cloud(gcs_uri):
            try:
                from google.cloud import storage

                bucket_name, blob_name = parse_gcs_uri(gcs_uri)
                storage.Client().bucket(bucket_name).blob(blob_name).delete()
                return
            except Exception:
                if self._json_api_delete(gcs_uri):
                    return
        path = self.local_path_for_uri(gcs_uri)
        if path.exists():
            path.unlink()

    def object_exists(self, gcs_uri: str) -> bool:
        if self._should_try_cloud(gcs_uri):
            try:
                from google.cloud import storage

                bucket_name, blob_name = parse_gcs_uri(gcs_uri)
                return storage.Client().bucket(bucket_name).blob(blob_name).exists()
            except Exception:
                return self._json_api_metadata(gcs_uri) is not None
        return self.local_path_for_uri(gcs_uri).exists()

    def list_uris(self, bucket_name: str, prefix: str) -> list[str]:
        local_root = self.local_root / bucket_name / prefix.strip("/")
        if local_root.exists():
            return [f"gs://{bucket_name}/{path.relative_to(self.local_root / bucket_name)}" for path in local_root.rglob("*") if path.is_file()]
        if self.settings.gcs_bucket_name or bucket_name != self.bucket:
            try:
                from google.cloud import storage

                blobs = storage.Client().bucket(bucket_name).list_blobs(prefix=prefix.strip("/"))
                return [f"gs://{bucket_name}/{blob.name}" for blob in blobs if not blob.name.endswith("/")]
            except Exception:
                uris = self._json_api_list_uris(bucket_name, prefix.strip("/"))
                if uris is not None:
                    return uris
        if not local_root.exists():
            return []
        return [f"gs://{bucket_name}/{path.relative_to(self.local_root / bucket_name)}" for path in local_root.rglob("*") if path.is_file()]

    def list_prefixes(self, bucket_name: str, prefix: str = "") -> list[str]:
        normalized = prefix.strip("/")
        query_prefix = f"{normalized}/" if normalized else ""
        local_root = self.local_root / bucket_name / normalized
        if local_root.exists():
            return sorted(path.name for path in local_root.iterdir() if path.is_dir())
        if self.settings.gcs_bucket_name or bucket_name != self.bucket:
            try:
                from google.cloud import storage

                iterator = storage.Client().bucket(bucket_name).list_blobs(
                    prefix=query_prefix,
                    delimiter="/",
                )
                list(iterator)
                return sorted(value.removeprefix(query_prefix).strip("/") for value in iterator.prefixes)
            except Exception:
                prefixes = self._json_api_list_prefixes(bucket_name, query_prefix)
                if prefixes is not None:
                    return prefixes
        if not local_root.exists():
            return []
        return sorted(path.name for path in local_root.iterdir() if path.is_dir())

    def _should_try_cloud(self, gcs_uri: str) -> bool:
        bucket_name, _ = parse_gcs_uri(gcs_uri)
        return bool(self.settings.gcs_bucket_name) or bucket_name != self.bucket

    def _json_api_headers(self) -> dict[str, str] | None:
        token = self._gcloud_access_token()
        if not token:
            return None
        return {"Authorization": f"Bearer {token}"}

    def _gcloud_access_token(self) -> str:
        gcloud = shutil.which("gcloud") or "/Users/licheng.phan/google-cloud-sdk/bin/gcloud"
        if not Path(gcloud).exists():
            return ""
        try:
            result = subprocess.run(
                [gcloud, "auth", "print-access-token"],
                check=True,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                timeout=20,
            )
            return result.stdout.strip()
        except Exception:
            return ""

    def _json_api_metadata(self, gcs_uri: str) -> dict | None:
        headers = self._json_api_headers()
        if headers is None:
            return None
        try:
            import requests

            bucket_name, blob_name = parse_gcs_uri(gcs_uri)
            url = f"https://storage.googleapis.com/storage/v1/b/{bucket_name}/o/{quote(blob_name, safe='')}"
            response = requests.get(url, headers=headers, timeout=30)
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json()
        except Exception:
            return None

    def _json_api_download(self, gcs_uri: str, start: int | None = None, end: int | None = None) -> bytes | None:
        headers = self._json_api_headers()
        if headers is None:
            return None
        if start is not None or end is not None:
            range_start = start or 0
            range_end = "" if end is None else str(end)
            headers = {**headers, "Range": f"bytes={range_start}-{range_end}"}
        try:
            import requests

            bucket_name, blob_name = parse_gcs_uri(gcs_uri)
            url = f"https://storage.googleapis.com/download/storage/v1/b/{bucket_name}/o/{quote(blob_name, safe='')}?alt=media"
            response = requests.get(url, headers=headers, timeout=60)
            response.raise_for_status()
            return response.content
        except Exception:
            return None

    def _json_api_delete(self, gcs_uri: str) -> bool:
        headers = self._json_api_headers()
        if headers is None:
            return False
        try:
            import requests

            bucket_name, blob_name = parse_gcs_uri(gcs_uri)
            url = f"https://storage.googleapis.com/storage/v1/b/{bucket_name}/o/{quote(blob_name, safe='')}"
            response = requests.delete(url, headers=headers, timeout=30)
            return response.status_code in {200, 204, 404}
        except Exception:
            return False

    def _json_api_list_prefixes(self, bucket_name: str, prefix: str) -> list[str] | None:
        payload = self._json_api_list(bucket_name, prefix=prefix, delimiter="/")
        if payload is None:
            return None
        normalized = prefix.strip("/")
        base = f"{normalized}/" if normalized else ""
        prefixes = payload.get("prefixes", [])
        return sorted(value.removeprefix(base).strip("/") for value in prefixes)

    def _json_api_list_uris(self, bucket_name: str, prefix: str) -> list[str] | None:
        payload = self._json_api_list(bucket_name, prefix=prefix)
        if payload is None:
            return None
        return [
            f"gs://{bucket_name}/{item['name']}"
            for item in payload.get("items", [])
            if item.get("name") and not item["name"].endswith("/")
        ]

    def _json_api_list(self, bucket_name: str, *, prefix: str = "", delimiter: str | None = None) -> dict | None:
        headers = self._json_api_headers()
        if headers is None:
            return None
        try:
            import requests

            params = {"prefix": prefix, "maxResults": "1000"}
            if delimiter:
                params["delimiter"] = delimiter
            items: list[dict] = []
            prefixes: set[str] = set()
            page_token = ""
            while True:
                if page_token:
                    params["pageToken"] = page_token
                response = requests.get(
                    f"https://storage.googleapis.com/storage/v1/b/{bucket_name}/o",
                    headers=headers,
                    params=params,
                    timeout=60,
                )
                response.raise_for_status()
                payload = response.json()
                items.extend(payload.get("items", []))
                prefixes.update(payload.get("prefixes", []))
                page_token = payload.get("nextPageToken", "")
                if not page_token:
                    break
            return {"items": items, "prefixes": sorted(prefixes)}
        except Exception:
            return None


def parse_gcs_uri(gcs_uri: str) -> tuple[str, str]:
    if not gcs_uri.startswith("gs://"):
        raise ValueError(f"expected gs:// URI, got: {gcs_uri}")
    without_scheme = gcs_uri[5:]
    bucket, _, blob = without_scheme.partition("/")
    if not bucket or not blob:
        raise ValueError(f"invalid GCS URI: {gcs_uri}")
    return bucket, blob


def _generate_signed_url(blob, *, method: str, expiration: int, content_type: str | None = None) -> str:
    kwargs = {
        "version": "v4",
        "method": method,
        "expiration": expiration,
    }
    if content_type:
        kwargs["content_type"] = content_type
    try:
        return blob.generate_signed_url(**kwargs)
    except Exception:
        import google.auth
        from google.auth.transport.requests import Request

        credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        credentials.refresh(Request())
        service_account_email = getattr(credentials, "service_account_email", None)
        if not service_account_email:
            raise
        kwargs["service_account_email"] = service_account_email
        kwargs["access_token"] = credentials.token
        return blob.generate_signed_url(**kwargs)
