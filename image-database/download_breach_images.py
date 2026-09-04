"""Download all images from the Breach Mages section of an Aeon's End wiki page."""

from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import ProxyHandler, Request, build_opener


API_URL = "https://aeonsend.wiki.gg/api.php"
PAGE_NAME = "Aeon's End (Core Box)"
SECTION_NAME = "Breach Mages"
USER_AGENT = "AeonsEndImageDatabase/1.0 (local project)"
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp"}
DEFAULT_PROXY = "http://127.0.0.1:7897"


def request_json(opener, params: dict[str, str], retries: int = 3) -> dict:
    url = f"{API_URL}?{urlencode(params)}"
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    for attempt in range(retries):
        try:
            with opener.open(request, timeout=30) as response:
                return json.load(response)
        except (HTTPError, URLError, TimeoutError) as error:
            if attempt == retries - 1:
                raise RuntimeError(f"Could not fetch MediaWiki API: {error}") from error
            time.sleep(2**attempt)
    raise AssertionError("unreachable")


def section_index(opener) -> str:
    data = request_json(
        opener,
        {
            "action": "parse",
            "page": PAGE_NAME,
            "prop": "sections",
            "format": "json",
        }
    )
    for section in data["parse"]["sections"]:
        if section.get("line", "").strip().lower() == SECTION_NAME.lower():
            return section["index"]
    raise RuntimeError(f"Could not find section {SECTION_NAME!r} on {PAGE_NAME!r}")


def page_image_names(opener) -> list[str]:
    data = request_json(
        opener,
        {
            "action": "parse",
            "page": PAGE_NAME,
            "section": section_index(opener),
            "prop": "images",
            "format": "json",
        },
    )
    names = data["parse"].get("images", [])
    unique_names: list[str] = []
    for name in names:
        name = name.strip().replace("_", " ")
        if name not in unique_names:
            unique_names.append(name)
    if not unique_names:
        raise RuntimeError(f"No images found in section {SECTION_NAME!r}")
    return unique_names


def image_urls(opener, image_names: list[str]) -> dict[str, str]:
    urls: dict[str, str] = {}
    normalized_names = {name.replace("_", " "): name for name in image_names}
    for start in range(0, len(image_names), 50):
        batch = image_names[start : start + 50]
        data = request_json(
            opener,
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


def download(opener, url: str, destination: Path, retries: int = 3) -> None:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(retries):
        try:
            with opener.open(request, timeout=60) as response:
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
        default=Path(__file__).parent / "breach_mages",
        help="Directory for downloaded images (default: ./breach_mages)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Download files again even when they already exist",
    )
    parser.add_argument(
        "--proxy",
        default=DEFAULT_PROXY,
        help=f"HTTP proxy URL (default: {DEFAULT_PROXY})",
    )
    parser.add_argument(
        "--no-proxy",
        action="store_true",
        help="Connect directly without using a proxy",
    )
    args = parser.parse_args()

    opener = build_opener(
        ProxyHandler({})
        if args.no_proxy
        else ProxyHandler({"http": args.proxy, "https": args.proxy})
    )
    args.output.mkdir(parents=True, exist_ok=True)
    print(f"Source section: {PAGE_NAME} -> {SECTION_NAME}")
    print(f"Connection: {'direct' if args.no_proxy else f'proxy {args.proxy}'}")
    names = page_image_names(opener)
    urls = image_urls(opener, names)
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
        download(opener, url, destination)
        downloaded += 1
        print(f"Downloaded: {destination.name}")
        time.sleep(0.2)

    print(f"Finished: {downloaded} downloaded, {skipped} skipped, {len(names)} page images selected")


if __name__ == "__main__":
    main()