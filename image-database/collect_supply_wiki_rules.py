"""Collect Wave 1 supply-card rules and an image/catalog manifest from Aeon's End Wiki."""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

from download_wiki_images import (
    DEFAULT_PROXY,
    PAGE_NAME,
    build_opener,
    request_json,
    section_index,
)
from collect_nemesis_wiki_rules import (
    RULE_SECTIONS,
    SKIP_SECTIONS,
    clean_html,
    infobox_fields,
    parse_template_cards,
)


SOURCE_ROOT = "https://aeonsend.wiki.gg/wiki/"
SUPPLY_SECTIONS = {
    "Supply Gems": ("gem", "gems"),
    "Supply Relics": ("relic", "relics"),
    "Supply Spells": ("spell", "spells"),
}
STARTER_IDS = {"crystal", "spark"}


def page_details(opener, requested_title: str) -> dict:
    parsed = request_json(
        opener,
        {
            "action": "parse",
            "page": requested_title,
            "redirects": "1",
            "prop": "text|sections",
            "format": "json",
        },
    )["parse"]
    title = parsed["title"]
    fields = infobox_fields(parsed["text"]["*"])
    sections: list[tuple[str, str]] = []
    for section in parsed.get("sections", []):
        heading = section["line"]
        if heading in SKIP_SECTIONS or heading not in RULE_SECTIONS:
            continue
        section_data = request_json(
            opener,
            {
                "action": "parse",
                "page": title,
                "section": section["index"],
                "prop": "text",
                "format": "json",
            },
        )["parse"]["text"]["*"]
        text = clean_html(section_data)
        if text:
            sections.append((heading, text))
    return {
        "requested_title": requested_title,
        "title": title,
        "fields": fields,
        "sections": sections,
        "url": SOURCE_ROOT + quote(title.replace(" ", "_"), safe="()'") ,
    }


def canonical_id(name: str) -> str:
    normalized = name.lower().replace("'", "")
    normalized = re.sub(r"[^a-z0-9]+", "_", normalized).strip("_")
    return normalized


def image_match(image_root: Path, folder: str, title: str) -> str | None:
    """Find one local image while tolerating wiki suffixes such as '(Aeon's End) Front'."""
    wanted = re.sub(r"[^a-z0-9]+", "", title.lower())
    matches: list[Path] = []
    for path in (image_root / folder).glob("*"):
        if not path.is_file():
            continue
        stem = re.sub(r"[^a-z0-9]+", "", path.stem.lower())
        if stem.startswith(wanted) or wanted in stem:
            matches.append(path)
    if not matches:
        return None
    if len(matches) > 1:
        preferred = [path for path in matches if "front" in path.stem.lower()]
        if len(preferred) == 1:
            matches = preferred
    if len(matches) != 1:
        raise RuntimeError(f"Ambiguous local images for {title!r}: {', '.join(str(path) for path in matches)}")
    return matches[0].relative_to(image_root.parents[1]).as_posix()


def collect(opener, image_root: Path) -> list[dict]:
    cards: list[dict] = []
    seen: set[str] = set()
    for section, (card_type, folder) in SUPPLY_SECTIONS.items():
        section_data = request_json(
            opener,
            {
                "action": "parse",
                "page": PAGE_NAME,
                "section": section_index(opener, section),
                "prop": "wikitext",
                "format": "json",
            },
        )["parse"]["wikitext"]["*"]
        for requested_title in parse_template_cards(section_data):
            card = page_details(opener, requested_title)
            card_id = canonical_id(requested_title)
            if card_id in seen:
                raise RuntimeError(f"Duplicate supply card ID: {card_id}")
            seen.add(card_id)
            fields = card["fields"]
            if "Cost" not in fields or "Effect" not in fields:
                raise RuntimeError(f"Missing Cost or Effect on {requested_title!r}")
            cards.append({
                "id": card_id,
                "name": requested_title,
                "canonicalTitle": card["title"],
                "type": card_type,
                "cost": int(re.search(r"\d+", fields["Cost"]).group(0)),
                "image": image_match(image_root, folder, requested_title),
                "marketCandidate": card_id not in STARTER_IDS,
                "wiki": card["url"],
                "effect": fields["Effect"],
                "sections": [{"heading": heading, "text": text} for heading, text in card["sections"]],
            })
    return cards


def markdown(cards: list[dict], fetched_at: str) -> str:
    lines = [
        "# Wave 1 Supply 卡牌规则资料库",
        "",
        "> 本文由 `image-database/collect_supply_wiki_rules.py` 从 Aeon's End Wiki 自动整理。",
        "> 规则实现前仍需以项目规则约定和实际卡面核对；本文是资料来源，不是运行时代码。",
        "",
        "## 来源与范围",
        "",
        f"- Core Box 页面：[Supply Gems]({SOURCE_ROOT}Aeon%27s_End_%28Core_Box%29#Supply_Gems)、[Supply Relics]({SOURCE_ROOT}Aeon%27s_End_%28Core_Box%29#Supply_Relics)、[Supply Spells]({SOURCE_ROOT}Aeon%27s_End_%28Core_Box%29#Supply_Spells)",
        f"- 抓取时间（UTC）：{fetched_at}",
        "- 资料包含卡牌类型、费用、Effect 以及与规则有关的 Details、Clarifications、Errata；叙事内容不进入运行时规则。",
        "- Crystal 和 Spark 标记为初始牌，其余条目为商店候选牌。",
        "",
    ]
    for card_type, title in (("gem", "Gems"), ("relic", "Relics"), ("spell", "Spells")):
        lines.extend([f"## Supply {title}", ""])
        for card in (item for item in cards if item["type"] == card_type):
            candidate = "market candidate" if card["marketCandidate"] else "starter card"
            lines.extend([
                f"### {card['name']}", "",
                f"- ID：`{card['id']}`",
                f"- Type：{card['type']}",
                f"- Cost：{card['cost']}",
                f"- Scope：{candidate}",
                f"- Image：`{card['image'] or 'MISSING'}`",
                f"- Wiki：[{card['canonicalTitle']}]({card['wiki']})", "",
                "**Effect**", "", card["effect"], "",
            ])
            for section in card["sections"]:
                lines.extend([f"**{section['heading']}**", "", section["text"], ""])
    return "\n".join(lines).rstrip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-markdown", type=Path, default=Path("documents/wave1-supply-wiki-rules.md"))
    parser.add_argument("--output-json", type=Path, default=Path("documents/wave1-supply-catalog.json"))
    parser.add_argument("--image-root", type=Path, default=Path("image-database/cards/wave1"))
    parser.add_argument("--proxy", default=DEFAULT_PROXY)
    parser.add_argument("--no-proxy", action="store_true")
    args = parser.parse_args()

    from urllib.request import ProxyHandler

    opener = build_opener(ProxyHandler({}) if args.no_proxy else ProxyHandler({"http": args.proxy, "https": args.proxy}))
    fetched_at = datetime.now(timezone.utc).isoformat()
    cards = collect(opener, args.image_root)
    payload = {
        "sourcePage": PAGE_NAME,
        "fetchedAt": fetched_at,
        "cards": cards,
    }
    args.output_markdown.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_markdown.write_text(markdown(cards, fetched_at), encoding="utf-8")
    args.output_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    missing = [card["name"] for card in cards if not card["image"]]
    print(f"Collected {len(cards)} supply cards ({sum(card['marketCandidate'] for card in cards)} market candidates)")
    if missing:
        raise RuntimeError(f"Missing local images: {', '.join(missing)}")


if __name__ == "__main__":
    main()
