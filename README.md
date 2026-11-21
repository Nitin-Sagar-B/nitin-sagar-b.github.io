# AbstractOS Portfolio

[Open the portfolio](https://nitin-sagar-b.github.io/) for selected projects, research, and career milestones. [Explore terminal mode](https://nitin-sagar-b.github.io/?terminal=1) for the interactive AbstractOS interface.

## Run locally

Use Node.js 22+, Python 3.11+, and Chrome, Chromium, or Edge. From the repository root, run:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/). Use a fresh browser profile or unregister the service worker in DevTools when inspecting changes against an existing local cache.

## Update content

1. Edit `portfolio-content.json` for projects, experience, credentials, publications, and timeline milestones.
2. Use confirmed dates and direct links to the repository, publication, or credential. Describe shipped behavior and include a primary source for any measured result.
3. Run `npm run build` and commit the content changes with the regenerated `index.html`. The site and terminal share the resulting markup.

Use `styles.css` and `scripts.js` for presentation and terminal behavior. If either asset changes in a release, increment both URLs’ `v` query parameter in `index.html` and the matching `RELEASE` value in `sw.js`. This gives the updated page and worker matching cache keys.

## Check and release

```sh
npm run check
npm test
npm run test:http
```

The checks verify generated content, HTML nesting and internal links, and service-worker cache upgrades. The local rendering suite opens fixtures built from the site HTML, CSS, and JavaScript in a headless browser. The HTTP suite serves the full site over loopback and verifies deep links, keyboard controls, reduced motion, and mobile access with JavaScript disabled. Set `CHROME_PATH` if your Chromium browser is installed outside the default locations.

GitHub Actions runs all three commands on pull requests that target `master` and on pushes to `master`. After a reviewed change lands, verify the GitHub Pages deployment in the repository’s Actions tab. Open the live homepage and a Projects deep link and check public demo links separately. Deploy a revert commit if a release needs to be rolled back.

## License

[MIT](LICENSE)
