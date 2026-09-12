"""Collect Wave 1 Nemesis card rules from the Aeon's End wiki."""

from __future__ import annotations

import argparse
import html as html_module
import re
from pathlib import Path
from urllib.parse import quote

from lxml import html

from download_wiki_images import (
    API_URL,
    DEFAULT_PROXY,
    PAGE_NAME,
    build_opener,
    request_json,
    section_index,
)


SOURCE_ROOT = "https://aeonsend.wiki.gg/wiki/"
RULE_SECTIONS = {
    "Effect",
    "Details",
    "Overview",
    "Setup",
    "Rule",
    "Unleash Effect",
    "Increased Difficulty",
    "Clarifications & Rulings",
    "Errata",
}
SKIP_SECTIONS = {
    "Flavor Text",
    "First Edition Version",
    "Tips & Strategy",
    "Story",
    "Trivia",
    "Alternate Versions",
    "Featured In",
}


def parse_template_cards(wikitext: str) -> list[str]:
    cards: list[str] = []
    for match in re.finditer(r"\{\{CardImage\|([^}]+)\}\}", wikitext):
        args = [part.strip() for part in match.group(1).split("|")]
        file_name = args[0]
        link_name = next(
            (part.split("=", 1)[1].strip() for part in args[1:] if part.startswith("link=")),
            file_name,
        )
        if link_name not in cards:
            cards.append(link_name)
    return cards


def split_subsections(wikitext: str, pattern: str) -> list[tuple[str, str]]:
    matches = list(re.finditer(pattern, wikitext, flags=re.MULTILINE))
    result: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(wikitext)
        result.append((match.group(1).strip(), wikitext[start:end]))
    return result


def extract_card_groups(opener) -> tuple[list[tuple[int, str]], list[tuple[str, str]]]:
    basic_index = section_index(opener, "Basic Nemesis Cards")
    basic = request_json(
        opener,
        {"action": "parse", "page": PAGE_NAME, "section": basic_index, "prop": "wikitext", "format": "json"},
    )["parse"]["wikitext"]["*"]
    basic_cards: list[tuple[int, str]] = []
    for tier, body in split_subsections(basic, r"^===Tier (\d) Cards==="):
        for card in parse_template_cards(body):
            basic_cards.append((int(tier), card))

    rageborne_index = section_index(opener, "Rageborne")
    rageborne = request_json(
        opener,
        {"action": "parse", "page": PAGE_NAME, "section": rageborne_index, "prop": "wikitext", "format": "json"},
    )["parse"]["wikitext"]["*"]
    unique_match = re.search(
        r"^====Nemesis Cards====(?P<body>.*?)(?=^====Strike Deck====)",
        rageborne,
        flags=re.MULTILINE | re.DOTALL,
    )
    strike_match = re.search(r"^====Strike Deck====(?P<body>.*)$", rageborne, flags=re.MULTILINE | re.DOTALL)
    if not unique_match or not strike_match:
        raise RuntimeError("Could not find Rageborne card groups on the Core Box page")

    rageborne_cards: list[tuple[str, str]] = []
    unique_groups = parse_template_cards(unique_match.group("body"))
    for index, card in enumerate(unique_groups):
        rageborne_cards.append((f"Unique Tier {index // 3 + 1}", card))
    for card in parse_template_cards(strike_match.group("body")):
        rageborne_cards.append(("Strike Deck", card))
    return basic_cards, rageborne_cards


def clean_html(fragment: str) -> str:
    fragment_root = html.fragment_fromstring(fragment, create_parent="div")
    for node in fragment_root.xpath(
        ".//*[contains(concat(' ', normalize-space(@class), ' '), ' mw-editsection ')]"
    ):
        node.getparent().remove(node)
    for node in fragment_root.xpath(".//h1 | .//h2 | .//h3 | .//h4 | .//h5 | .//h6"):
        node.getparent().remove(node)
    for node in fragment_root.xpath(".//img"):
        alt = node.get("alt", "")
        if alt.lower() == "aether.png":
            node.tag = "span"
            node.text = " Aether "
            node.attrib.clear()
    fragment = html.tostring(fragment_root, encoding="unicode")
    fragment = re.sub(r"<!--.*?-->", "", fragment, flags=re.DOTALL)
    fragment = re.sub(r"</(?:p|li|h[1-6]|div|tr|ul|ol)>", "\n", fragment, flags=re.IGNORECASE)
    fragment = re.sub(r"<br\s*/?>", "\n", fragment, flags=re.IGNORECASE)
    fragment = re.sub(r"<[^>]+>", "", fragment)
    text = html_module.unescape(fragment).replace("\xa0", " ")
    lines = []
    for line in text.splitlines():
        line = re.sub(r"[ \t]+", " ", line).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)


def infobox_fields(rendered_html: str) -> dict[str, str]:
    root = html.fromstring(rendered_html)
    fields: dict[str, str] = {}
    for row in root.xpath("//*[contains(concat(' ', normalize-space(@class), ' '), ' druid-row ')]"):
        labels = row.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' druid-label ')]")
        values = row.xpath(".//*[contains(concat(' ', normalize-space(@class), ' '), ' druid-data ')]")
        if labels and values:
            label = clean_html(html.tostring(labels[0], encoding="unicode"))
            value = clean_html(html.tostring(values[-1], encoding="unicode"))
            if label and value:
                fields[label] = value
    return fields


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
    rendered = parsed["text"]["*"]
    fields = infobox_fields(rendered)
    sections: list[tuple[str, str]] = []
    for section in parsed.get("sections", []):
        heading = html_module.unescape(section["line"])
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
        "url": SOURCE_ROOT + quote(title.replace(" ", "_"), safe="()'"),
    }


def format_card(details: dict, group: str, tier: int | None = None) -> str:
    fields = details["fields"]
    display_title = details["requested_title"]
    lines = [f"### {display_title}", "", f"- 分类：{group}"]
    if display_title != details["title"]:
        lines.append(f"- Wiki canonical title：{details['title']}")
    if tier is not None:
        lines.append(f"- Tier：{tier}")
    for key in ("Type", "Nemesis", "Tier", "Life", "Power", "Card Number(s)"):
        if key in fields and not (key == "Tier" and tier is not None):
            lines.append(f"- {key}：{fields[key]}")
    lines.extend([f"- Wiki：[{details['title']}]({details['url']})", ""])
    if "Effect" in fields:
        lines.extend(["**Infobox effect**", "", fields["Effect"], ""])
    for heading, text in details["sections"]:
        lines.extend([f"**{heading}**", "", text, ""])
    return "\n".join(lines).rstrip()


def build_document(opener) -> str:
    basic_cards, rageborne_cards = extract_card_groups(opener)
    output = [
        "# Wave 1 Nemesis 卡牌规则资料库",
        "",
        "> 本文由 `image-database/collect_nemesis_wiki_rules.py` 从 Aeon's End Wiki 自动整理。",
        "> 规则实现前仍需以项目规则约定和实际卡面核对；本文是资料来源，不是运行时代码。",
        "",
        "## 来源与范围",
        "",
        f"- Core Box 页面：[Basic Nemesis Cards]({SOURCE_ROOT}Aeon%27s_End_%28Core_Box%29#Basic_Nemesis_Cards)",
        f"- Core Box 页面：[Rageborne]({SOURCE_ROOT}Aeon%27s_End_%28Core_Box%29#Rageborne)",
        "- Basic 候选卡：22 张，按 Tier 1/2/3 分组。",
        "- Rageborne 相关牌：9 张 Unique Nemesis Cards、6 张 Strike Cards。",
        "- 详情页中的 Flavor Text、Story、Trivia 等叙事内容不列入规则摘要；保留 Effect、Setup、Rule、Unleash、难度、澄清和 Errata 等规则段落。",
        "",
        "## Basic Nemesis Cards",
        "",
    ]
    for tier in (1, 2, 3):
        output.extend([f"### Tier {tier}", ""])
        for card_tier, title in (item for item in basic_cards if item[0] == tier):
            output.extend([format_card(page_details(opener, title), "Basic Nemesis Card", tier), ""])

    output.extend(["## Rageborne", ""])
    mat = page_details(opener, "Rageborne")
    output.extend(["### Nemesis Mat", "", f"- Wiki：[Rageborne]({mat['url']})", ""])
    for heading, text in mat["sections"]:
        output.extend([f"**{heading}**", "", text, ""])

    output.extend(["### Rageborne Cards", ""])
    for group, title in rageborne_cards:
        output.extend([format_card(page_details(opener, title), group), ""])
    return "\n".join(output).rstrip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).parents[1] / "documents" / "wave1-nemesis-wiki-rules.md",
    )
    parser.add_argument("--proxy", default=DEFAULT_PROXY)
    parser.add_argument("--no-proxy", action="store_true")
    args = parser.parse_args()
    from urllib.request import ProxyHandler

    opener = build_opener(ProxyHandler({}) if args.no_proxy else ProxyHandler({"http": args.proxy, "https": args.proxy}))
    document = build_document(opener)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(document, encoding="utf-8")
    print(f"Wrote {args.output} ({document.count('### ') - 2} card/mat entries)")


if __name__ == "__main__":
    main()
