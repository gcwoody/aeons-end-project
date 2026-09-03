"""Download breach images used by the Aeon's End wiki Breach page."""

from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen


API_URL = "https://aeonsend.wiki.gg/api.php"
PAGE_NAME = "Breach"
USER_AGENT = "AeonsEndImageDatabase/1.0 (local project)"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}


def request_json(params: dict[str, str], retries: int = 3) -> dict:
    url = f"{API_URL}?{urlencode(params)}"
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    for attempt in range(retries):
        try:
            with urlopen(request, timeout=30) as response:
                return json.load(response)
        except (HTTPError, URLError, TimeoutError) as error:
            if attempt == retries - 1:
                raise RuntimeError(f"Could not fetch MediaWiki API: {error}") from error
            time.sleep(2**attempt)
    raise AssertionError("unreachable")


def page_image_names(include_all: bool) -> list[str]:
    data = request_json(
        {
            "action": "parse",
            "page": PAGE_NAME,
            "prop": "images",
            "format": "json",
        }
    )
    image_names = data["parse"]["images"]
    if include_all:
        return image_names
    return [name for name in image_names if "breach" in name.lower()]


def image_urls(image_names: list[str]) -> dict[str, str]:
    urls: dict[str, str] = {}
    normalized_names = {name.replace("_", " "): name for name in image_names}
    for start in range(0, len(image_names), 50):
        batch = image_names[start : start + 50]
        data = request_json(
            {
                "action": "query",
                "titles": "|".join(f"File:{name}" for name in batch),
                "prop": "imageinfo",
                "iiprop": "url",
                "format": "json",
            }
        )
        for page in data["query"]["pages"].values():
            image_info = page.get("imageinfo", [])
            if image_info:
                api_name = page["title"][len("File:") :]
                urls[normalized_names.get(api_name, api_name)] = image_info[0]["url"]
    return urls


def safe_filename(image_name: str) -> str:
    filename = Path(image_name).name
    filename = re.sub(r"[<>:\"/\\|?*\x00-\x1f]", "_", filename)
    if Path(filename).suffix.lower() not in IMAGE_EXTENSIONS:
        filename += ".jpg"
    return filename


def download(url: str, destination: Path, retries: int = 3) -> None:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(retries):
        try:
            with urlopen(request, timeout=60) as response:
                destination.write_bytes(response.read())
            return
        except (HTTPError, URLError, TimeoutError) as error:
            if attempt == retries - 1:
                raise RuntimeError(f"Could not download {url}: {error}") from error
            time.sleep(2**attempt)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).parent / "breach",
        help="Directory for downloaded images (default: ./breach)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Download files again even when they already exist",
    )
    parser.add_argument(
        "--include-all-page-images",
        action="store_true",
        help="Download every image referenced by the page, including non-breach assets",
    )
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    names = page_image_names(args.include_all_page_images)
    urls = image_urls(names)
    missing = [name for name in names if name not in urls]
    if missing:
        print(f"Warning: no original URL returned for {len(missing)} image(s): {', '.join(missing)}")

    downloaded = 0
    skipped = 0
    for name in names:
        url = urls.get(name)
        if not url:
            continue
        destination = args.output / safe_filename(name)
        if destination.exists() and not args.force:
            skipped += 1
            continue
        download(url, destination)
        downloaded += 1
        print(f"Downloaded: {destination.name}")
        time.sleep(0.2)

    print(f"Finished: {downloaded} downloaded, {skipped} skipped, {len(names)} page images selected")


if __name__ == "__main__":
    main()