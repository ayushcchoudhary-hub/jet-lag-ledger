# Jet Lag Ledger

Ten years of flights, run through a body clock model, to count the days out of sync. Live at https://jetlag.ayushcchoudhary.com.

- `site/`: the deployed page (Vercel root directory). `index.html` is built; do not edit it by hand.
- `src/`: the parts (`page3.html`, `app3.js`, `engine.js`, `research.js`, `data.js`) and `assemble_site.py`, which builds `site/index.html`.
- `src/data.js` holds only past, flown flights: date, two airports and flight length. The full Flighty export is not in this repo.
- Analytics: PostHog, first-party through `/relay`, memory only, the same setup as ayushcchoudhary.com. No flight data is sent.

The studies repeated here belong to their authors: Song, Severini and Allada (PNAS, 2017), Fritz, VoPham, Wright and Vetter (Current Biology, 2020), Giuntella and Mazzonna (Journal of Health Economics, 2019).
