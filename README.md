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

### Built-in lectures (1–14)

All 14 lectures so far come ready to use, with flashcards, revision notes and an exam-style quiz written from the slides. They need no API key. In total there are 439 flashcards and 284 single-best-answer questions.

| # | Lecture | Cards | Quiz |
|---|---|---|---|
| 1 | Insulin and Diabetes | 40 | 24 |
| 2 | Incretin Hormones | 32 | 20 |
| 3 | Fuel Homeostasis | 29 | 20 |
| 4 | Hormonal Regulation of Fuel Homeostasis | 30 | 20 |
| 5 | Food Intake 1: Leptin and Obesity | 32 | 20 |
| 6 | Food Intake 2: Action of Leptin | 29 | 20 |
| 7 | Obesity Therapeutics and Bariatric Surgery | 31 | 20 |
| 8 | HPA Axis and Stress | 29 | 20 |
| 9 | Thyroid Hormones and Energy Homeostasis | 29 | 20 |
| 10 | Endocrine Control of Calcium Homeostasis | 29 | 20 |
| 11 | Growth Hormone | 29 | 20 |
| 12 | Hormonal Regulation of Puberty | 35 | 20 |
| 13 | Testicular Function and Sperm Physiology | 32 | 20 |
| 14 | Ovarian Function and the Menstrual Cycle | 33 | 20 |

The content lives in `src/content/lecture-NN-*.js` (`npm test` checks every file). The slide PDFs are not included in the site; tap *Add slide file* on a lecture page once to view its slides on your device. Deleting a built-in lecture removes it for good on that device.

### Adding future lectures

Tap **+ Add lecture** (home page or Settings) and pick the PDF or PowerPoint. Claude reads every slide and writes flashcards, revision notes and a 20-question quiz automatically. New lectures are numbered after your last one (15, 16, …), or from a "Lecture N" in the file name. Turn off *Settings → Write notes and quiz automatically* to only make flashcards up front and write notes and quiz when you first open them.

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
