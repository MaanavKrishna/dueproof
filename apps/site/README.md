# Dueproof website

The project website: Next.js and TypeScript, exported as static files. It is
not part of the product; the app's own interface lives in `dueproof/web/static/`.

```bash
npm install
```

```bash
npm run dev        # http://localhost:8090
```

```bash
npm run build      # static site in out/
```

The documentation pages are rendered at build time from the Markdown in
`../docs`, and its screenshots are copied in, so edit the docs there. For a
GitHub Pages project site, build with `PAGES_BASE_PATH=/dueproof`.

## Design

Indian offices log incoming letters in an inward register, stamp each one
RECEIVED in violet stamp-pad ink, and mark what matters with a highlighter.
The site borrows that: a fountain-pen ink-navy frame (`--cloth`), white ruled
paper with a red margin, highlighter yellow (`--gilt`) for proof and the main
action, violet (`--stamp`) for stamps, and coral red (`--due`) for dates that
are due. Tokens are at the top of `app/globals.css`. Type is Archivo, using its
width axis for headings; Noto fonts render the 22 scripts.

The home page's sample register is `lib/register.ts`. The GST notice in it is
`tests/fixtures/notice-gst-asmt10.pdf` word for word, and every field shown for
it is checked by `tests/test_notices.py`. The language list in
`lib/languages.ts` mirrors `dueproof/languages.py`.
