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

Indian offices log incoming letters in a cloth-bound inward register, and
stamp each letter RECEIVED. The site borrows that: bottle-green cloth
(`--cloth`), white ruled paper, gilt (`--gilt`) for proof, which is also the
colour the app outlines evidence in, and stamp red (`--stamp`) for due dates.
Tokens are at the top of `app/globals.css`. Type is Archivo, using its width
axis for headings; Noto fonts render the 22 scripts.

The home page's sample register is `lib/register.ts`. The GST notice in it is
`tests/fixtures/notice-gst-asmt10.pdf` word for word, and every field shown for
it is checked by `tests/test_notices.py`. The language list in
`lib/languages.ts` mirrors `dueproof/languages.py`.
