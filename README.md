# Lecture Flashcards (5BBL0210 Endocrinology & Reproduction)

A phone-friendly study site for lecture slides.

The home page lists all your lectures in number order (name files like `Lecture 1 – Hormones.pdf`). Tap a lecture to open its page with four options:

| | |
|---|---|
| 🖼️ **Slides** | PDFs show the actual slide pages; PowerPoint shows each slide's text and speaker notes, with a button to open the file in PowerPoint |
| 📝 **Notes** | Revision notes Claude writes from the slides: summary, topics as bullet points, key terms and key numbers |
| 🃏 **Flashcards** | Spaced-repetition study (below), plus the card list for editing |
| ❓ **Quiz** | Single-best-answer MCQs (A–E) in the exam style. Get one wrong and it explains why your answer is wrong and why the right one is right; the end screen lists your mistakes to review |

Notes and quizzes (20 questions for new lectures) are made the first time you open them and saved; you can rewrite them or make new questions any time.

Each lecture has a number (guessed from file names like `Lecture 3 – Thyroid.pdf`, editable with *Edit name / number*) that sets its place on the home page.

### Built-in lectures

**Lecture 1 – Insulin and Diabetes** comes ready to use: 40 flashcards, revision notes and a 24-question exam-style quiz written from the 40 lecture slides (`src/content/lecture-01-insulin-diabetes.js`). It needs no API key. The slide PDF isn't included in the site; tap *Add slide file* on the lecture page once to view the slides on your device. Deleting a built-in lecture removes it for good on that device.

### Flashcards

- **Upload** lecture slides as PowerPoint (`.pptx`) or PDF. The text of every slide (plus speaker notes in `.pptx`) is read in your browser.
- **AI flashcards**: Claude writes 15–30 cards per lecture covering key concepts, definitions, mechanisms and numbers. Cards are grouped by lecture.
- **Study mode**: one card at a time; tap to flip; rate it **Red** (didn't get it), **Amber** (kind of) or **Green** (got it).
- **Spaced repetition**
  - Red: comes back 3 cards later in the same session, then is due again 10 minutes later
  - Amber: due again tomorrow
  - Green: due in 3 days, and the gap doubles with each green in a row (3 → 6 → 12 → 24 days…). Any red or amber resets it.
  - Only due cards are shown; the home screen shows how many are due today.
- **Saved progress**: lectures, cards, ratings, notes, quizzes and slide files are kept in your browser's storage. Use *Settings → Download backup* to move them to another device (slide files aren't in the backup; re-add them on each lecture page).
- **Edit/delete** any card (tap it in the lecture's card list, or the ✎ button while studying), add your own cards, rename or delete lectures.

## Using it

You need a Claude API key from [console.anthropic.com](https://console.anthropic.com). Open the site, go to **Settings (⚙)**, paste the key, and save. The key is stored only in your browser and sent only to Anthropic's API. Generating cards for one lecture costs a few cents.

Old `.ppt` files can't be read: save them as `.pptx` or export them to PDF first. If a PDF is scanned images with no text, the whole PDF is sent to Claude to read the pages.

## Running it

```bash
npm install
npm run dev      # local dev server
npm test         # spaced-repetition tests
npm run build    # static site in dist/
```

### Putting it online (GitHub Pages)

The workflow in `.github/workflows/deploy.yml` builds and publishes the site on every push to `main`. Turn it on once in the repo's **Settings → Pages → Source: GitHub Actions**. The site then lives at `https://<username>.github.io/<repo-name>/`; open it on your phone and use "Add to Home Screen".

## Code

| File | What it does |
|---|---|
| `src/extract.js` | Reads slide text from `.pptx` (JSZip) and `.pdf` (pdf.js) |
| `src/source.js` | Saves a lecture's slide file and prepares it for Claude |
| `src/ai.js` | Asks Claude for flashcards, notes and quizzes (JSON schema output) |
| `src/srs.js` | Red/amber/green scheduling rules |
| `src/store.js` | Lectures, cards and settings in `localStorage`; backup/restore |
| `src/idb.js` | Slide files, slide text, notes and quizzes in IndexedDB |
| `src/views/` | One file per screen: home, upload, lecture, slides, notes, quiz, study, settings |
| `src/main.js` | Router |
