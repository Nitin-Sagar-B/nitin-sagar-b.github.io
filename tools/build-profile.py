"""Build the plain HTML profile and JSON-LD from the terminal's content."""

import argparse
import html
import json
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
HOME = "https://nitin-sagar-b.github.io/"
PROFILE = HOME + "profile/"
PERSON_ID = PROFILE + "#person"
BEGIN = "    <!-- BEGIN GENERATED PROFILE JSON-LD -->"
END = "    <!-- END GENERATED PROFILE JSON-LD -->"


def plain(markup):
    return " ".join(html.unescape(re.sub(r"<[^>]+>", "", markup)).split())


def section(source, index):
    return re.search(rf'<template id="tpl-{index}">(.*?)</template>', source, re.S)[1]


def blocks(source, tag, class_name=None):
    attrs = rf'\bclass="{class_name}"' if class_name else ""
    pattern = rf"<{tag}\b[^>]*{attrs}[^>]*>(.*?)</{tag}>"
    return re.findall(pattern, source, re.S)


def named_span(source, class_name):
    return plain(blocks(source, "span", class_name)[0])


def links(source):
    return [
        (html.unescape(url), plain(label))
        for url, label in re.findall(r'<a\b[^>]*\bhref="([^"]+)"[^>]*>(.*?)</a>', source, re.S)
    ]


def anchor(url, label):
    return f'<a href="{html.escape(url)}">{html.escape(label)}</a>'


def read_terminal(source):
    about = section(source, 0)
    name = plain(blocks(about, "h1")[0])
    biography = plain(blocks(about, "p", "body-text")[0])
    experience = []
    for row in blocks(section(source, 3), "div", "exp-row"):
        experience.append({
            "title": named_span(row, "title"),
            "organization": named_span(row, "org").removeprefix("@ "),
            "date": named_span(row, "date"),
            "details": [plain(item) for item in blocks(row, "li")],
        })

    projects = []
    for row in blocks(section(source, 2), "li"):
        projects.append({
            "name": plain(blocks(row, "strong")[0]),
            "description": named_span(row, "dim").removeprefix("> "),
            "links": links(row),
        })

    credentials = []
    for row in blocks(section(source, 4), "li"):
        entry_links = links(row)
        name_markup = re.sub(r"<span\b[^>]*>.*?</span>", "", row, flags=re.S)
        credentials.append({
            "name": entry_links[0][1] if entry_links else plain(name_markup),
            "url": entry_links[0][0] if entry_links else None,
            "details": named_span(row, "dim").strip("[]"),
        })

    publications = []
    for row in blocks(section(source, 5), "div", "term-card highlight-card"):
        url, title = links(row)[0]
        publications.append({
            "name": title,
            "url": url,
            "date": named_span(row, "badge"),
            "details": [plain(item).removeprefix("> ") for item in blocks(row, "p")],
        })

    education = []
    for row in blocks(section(source, 7), "div", "exp-row"):
        education.append({
            "title": named_span(row, "title"),
            "organization": named_span(row, "org").removeprefix("@ "),
            "date": named_span(row, "date"),
            "details": [plain(item) for item in blocks(row, "p")],
        })
    return {
        "name": name, "biography": biography, "experience": experience,
        "projects": projects, "credentials": credentials, "publications": publications,
        "education": education, "profiles": links(section(source, 10)),
    }


def schema(data, profile):
    current = data["experience"][0]
    credentials = []
    for item in data["credentials"]:
        credential = {
            "@type": "EducationalOccupationalCredential",
            "name": item["name"],
            "recognizedBy": {
                "@type": "Organization",
                "name": item["details"].split(" | ")[0],
            },
        }
        if item["url"]:
            credential["url"] = item["url"]
        credentials.append(credential)

    person = {
        "@type": "Person", "@id": PERSON_ID, "name": data["name"],
        "url": PROFILE, "description": data["biography"],
        "jobTitle": current["title"],
        "worksFor": {"@type": "Organization", "name": current["organization"]},
        "alumniOf": {"@type": "CollegeOrUniversity", "name": data["education"][0]["organization"]},
        "sameAs": [url for url, _ in data["profiles"]],
        "hasCredential": credentials,
    }
    page = {
        "@type": "ProfilePage" if profile else "WebPage",
        "@id": (PROFILE if profile else HOME) + "#webpage",
        "url": PROFILE if profile else HOME,
        "name": f'{data["name"]} | {"Profile" if profile else "AbstractOS portfolio"}',
        "mainEntity": {"@id": PERSON_ID},
        "hasPart": [
            {
                "@type": "SoftwareSourceCode",
                "name": item["name"],
                "description": item["description"],
                "codeRepository": item["links"][0][0],
            }
            for item in data["projects"] if item["links"][0][1] == "Repository Link"
        ] + [
            {
                "@type": "ScholarlyArticle",
                "name": item["name"],
                "url": item["url"],
                "author": {"@id": PERSON_ID},
            }
            for item in data["publications"]
        ],
    }
    return {"@context": "https://schema.org", "@graph": [page, person]}


def script(graph):
    # Escape '<' so content can never terminate the HTML script element.
    payload = json.dumps(graph, ensure_ascii=False, indent=2).replace("<", r"\u003c")
    return '    <script type="application/ld+json">\n' + payload + "\n    </script>"


def render_roles(items):
    return "\n".join(
        f'<article><h3>{html.escape(item["title"])}</h3>'
        f'<p class="detail">{html.escape(item["organization"])} · {html.escape(item["date"])}</p>'
        + "".join(f"<p>{html.escape(detail)}</p>" for detail in item["details"])
        + "</article>"
        for item in items
    )


def project_links(item):
    return " · ".join(
        anchor(url, f'{item["name"]} repository' if label == "Repository Link" else label)
        for url, label in item["links"]
    )


def render_profile(data):
    name = html.escape(data["name"])
    current = data["experience"][0]
    role = html.escape(f'{current["title"]} at {current["organization"]}')
    bio = html.escape(data["biography"])
    projects = "\n".join(
        f'<article><h3>{html.escape(item["name"])}</h3><p>{html.escape(item["description"])}</p>'
        + '<p class="links">' + project_links(item)
        + "</p></article>"
        for item in data["projects"]
    )
    credentials = "\n".join(
        "<li>" + (anchor(item["url"], item["name"]) if item["url"] else html.escape(item["name"]))
        + f'<span class="detail"> · {html.escape(item["details"])}</span></li>'
        for item in data["credentials"]
    )
    publications = "\n".join(
        f'<article><h3>{anchor(item["url"], item["name"])}</h3>'
        f'<p class="detail">{html.escape(item["date"])}</p>'
        + "".join(f"<p>{html.escape(detail)}</p>" for detail in item["details"])
        + "</article>"
        for item in data["publications"]
    )
    external = " · ".join(
        anchor(url, "LinkedIn" if "linkedin.com" in url else "GitHub")
        for url, _ in data["profiles"]
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{name} | Profile</title>
    <meta name="description" content="{role}. Open-source projects, experience, credentials, and publications.">
    <link rel="canonical" href="{PROFILE}">
    <link rel="icon" href="/assets/images/image.png" type="image/png">
{script(schema(data, profile=True))}
    <style>
        :root {{ color-scheme: dark; }}
        body {{ margin: 0; color: #ececef; background: #0b0c10; font: 1rem/1.65 system-ui, sans-serif; }}
        main {{ max-width: 48rem; margin: auto; padding: clamp(1.25rem, 6vw, 4rem); }}
        h1, h2, h3 {{ line-height: 1.25; overflow-wrap: anywhere; }}
        h1 {{ font-size: clamp(2rem, 7vw, 3.75rem); margin-bottom: .5rem; }}
        h2 {{ border-bottom: 1px solid #383a43; padding-bottom: .5rem; }}
        h3 {{ margin: 0 0 .35rem; }}
        p {{ margin: .35rem 0 .75rem; }}
        li {{ margin-bottom: .65rem; }}
        section {{ margin-top: 3rem; }}
        article {{ padding: 1rem 0; border-bottom: 1px solid #282a32; }}
        a {{ color: #ffbe98; text-underline-offset: .2em; overflow-wrap: anywhere; }}
        a:focus-visible {{ outline: 2px solid #ffbe98; outline-offset: .25rem; }}
        .detail {{ color: #b6b8c4; }}
        .links {{ margin-bottom: 0; }}
    </style>
</head>
<body>
    <main>
        <header id="person">
            <a href="/">Open the AbstractOS terminal</a>
            <h1>{name}</h1>
            <p><strong>{role}</strong></p>
            <p>{bio}</p>
            <p>{external}</p>
        </header>
        <section aria-labelledby="projects">
            <h2 id="projects">Projects</h2>
{projects}
        </section>
        <section aria-labelledby="experience">
            <h2 id="experience">Experience</h2>
{render_roles(data["experience"])}
        </section>
        <section aria-labelledby="credentials">
            <h2 id="credentials">Credentials</h2>
            <ul>
{credentials}
            </ul>
        </section>
        <section aria-labelledby="publications">
            <h2 id="publications">Publications</h2>
{publications}
        </section>
        <section aria-labelledby="education">
            <h2 id="education">Education</h2>
{render_roles(data["education"])}
        </section>
    </main>
</body>
</html>
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail if generated content is stale.")
    args = parser.parse_args()
    homepage = ROOT / "index.html"
    profile = ROOT / "profile" / "index.html"
    source = homepage.read_text(encoding="utf-8")
    data = read_terminal(source)
    start = source.index(BEGIN) + len(BEGIN)
    stop = source.index(END, start)
    output = {
        homepage: source[:start] + "\n" + script(schema(data, profile=False)) + "\n" + source[stop:],
        profile: render_profile(data),
    }
    for path, content in output.items():
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != content:
                parser.exit(1, f"{path.relative_to(ROOT)} is stale. Run python tools/build-profile.py.\n")
        else:
            path.parent.mkdir(exist_ok=True)
            path.write_text(content, encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
