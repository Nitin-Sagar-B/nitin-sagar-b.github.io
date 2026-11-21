"""Validate HTML nesting, unique IDs, and local references in the Pages entry point."""

from html.parser import HTMLParser
import json
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
VOID = set("area base br col embed hr img input link meta param source track wbr".split())


class PageValidator(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.ids = {}
        self.refs = []
        self.errors = []
        self.doctype = False

    def handle_decl(self, decl):
        self.doctype |= decl.lower() == "doctype html"

    def check_attributes(self, tag, attrs):
        line = self.getpos()[0]
        names = [name for name, _ in attrs]
        if len(names) != len(set(names)):
            self.errors.append(f"line {line}: duplicate attribute on <{tag}>")
        for name, value in attrs:
            if name == "id" and value:
                if value in self.ids:
                    self.errors.append(f"line {line}: duplicate ID {value}")
                self.ids[value] = line
            if name in ("href", "src", "poster") and value:
                self.refs.append((line, value))

    def handle_starttag(self, tag, attrs):
        self.check_attributes(tag, attrs)
        if tag not in VOID:
            self.stack.append((tag, self.getpos()[0]))

    def handle_startendtag(self, tag, attrs):
        self.check_attributes(tag, attrs)

    def handle_endtag(self, tag):
        line = self.getpos()[0]
        if not self.stack or self.stack[-1][0] != tag:
            self.errors.append(f"line {line}: unexpected </{tag}>")
            return
        self.stack.pop()

    def finish(self):
        if not self.doctype:
            self.errors.append("missing HTML doctype")
        self.errors.extend(f"line {line}: unclosed <{tag}>" for tag, line in self.stack)
        for line, url in self.refs:
            parsed = urlsplit(url)
            if parsed.scheme or parsed.netloc:
                continue
            filename = unquote(parsed.path).lstrip("/")
            if filename and not (ROOT / filename).exists():
                self.errors.append(f"line {line}: missing local file {filename}")
            if parsed.fragment and filename in ("", "index.html"):
                target = unquote(parsed.fragment)
                if target not in self.ids:
                    self.errors.append(f"line {line}: missing anchor #{target}")
        manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8-sig"))
        for icon in manifest["icons"]:
            path = icon["src"]
            if not (ROOT / path).is_file():
                self.errors.append(f"manifest.json: missing icon {path}")
        if self.errors:
            raise SystemExit("\n".join(self.errors))
        print("HTML nesting, IDs, and local links passed")


page = PageValidator()
page.feed((ROOT / "index.html").read_text(encoding="utf-8-sig"))
page.close()
page.finish()
