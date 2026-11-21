import { readFile, writeFile } from 'node:fs/promises';

const page = new URL('../index.html', import.meta.url);
const data = JSON.parse(await readFile(new URL('../content/portfolio-content.json', import.meta.url), 'utf8'));
const source = (await readFile(page, 'utf8')).replaceAll('\r\n', '\n');

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = value => String(value).replace(/[&<>"']/g, character => entities[character]);

function link(url, label) {
    if (!/^#[a-z][a-z0-9-]*$/.test(url) && new URL(url).protocol !== 'https:') {
        throw new Error(`Expected an HTTPS URL or a local anchor: ${url}`);
    }
    return `<a href="${escape(url)}">${escape(label)}</a>`;
}

function date(item) {
    return item.datetime
        ? `<time datetime="${escape(item.datetime)}">${escape(item.date)}</time>`
        : escape(item.date);
}

function project(item) {
    const links = [link(item.repo, `${item.title} source code`)];
    if (item.demo) links.push(link(item.demo, `${item.title} demo`));
    if (item.paper) links.push(link(item.paper, `${item.title} preprint`));
    return `<article class="portfolio-card" id="${escape(item.id)}">
    <h4>${escape(item.title)}</h4>
    <p>${escape(item.summary)}</p>
    <p class="portfolio-links">${links.join(' ')}</p>
</article>`;
}

function record(item) {
    const heading = item.url ? link(item.url, item.title) : escape(item.title);
    const organization = item.organization ? ` · ${escape(item.organization)}` : '';
    const summary = item.summary ? `\n    <p>${escape(item.summary)}</p>` : '';
    return `<li class="portfolio-record">
    <strong>${heading}</strong>
    <p class="portfolio-date">${date(item)}${organization}</p>${summary}
</li>`;
}

function projectGroup(section) {
    return `<div class="portfolio-grid">
${data.projects.filter(item => item.section === section).map(project).join('\n')}
</div>`;
}

const regions = {
    projects: `<h3>Featured work</h3>
${projectGroup('featured')}
<h3>Research projects</h3>
${projectGroup('research')}`,
    experience: `<ol class="portfolio-list">\n${data.experience.map(record).join('\n')}\n</ol>`,
    timeline: `<ol class="portfolio-list">\n${data.timeline.map(record).join('\n')}\n</ol>`,
    publications: `<ul class="portfolio-list">\n${data.publications.map(record).join('\n')}\n</ul>`,
    credentials: `<ul class="portfolio-list">\n${data.credentials.map(record).join('\n')}\n</ul>`,
};

let output = source;
for (const [name, html] of Object.entries(regions)) {
    const opening = `<!-- content:${name} -->`;
    const closing = `<!-- /content:${name} -->`;
    const start = output.indexOf(opening);
    const end = output.indexOf(closing, start + opening.length);
    if (start < 0 || end < 0) throw new Error(`Missing HTML region: ${name}`);
    output = output.slice(0, start + opening.length) + '\n' + html + '\n' + output.slice(end);
}

if (process.argv.includes('--check')) {
    if (output !== source) {
        console.error('Portfolio content is out of date. Run npm run build.');
        process.exitCode = 1;
    }
} else {
    await writeFile(page, output);
}
