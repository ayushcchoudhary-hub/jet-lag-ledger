# Builds the public site (jetlag.ayushcchoudhary.com) from the same parts as the artifact: local d3, meta tags, first-party analytics.
import shutil
OUT='/home/claude/jet-lag-ledger/site/'
page=open('page3.html').read()
parts={'/*DATA*/':open('data.js').read(),'/*RESEARCH*/':open('research.js').read(),'/*ENGINE*/':open('engine.js').read(),'/*APP*/':open('app3.js').read()}
for k,v in parts.items():
    assert '</script' not in v.lower(), k
    page=page.replace(k,v,1)
assert 'Gate Departure (Scheduled)\\"' not in page and 'data.full' not in page
U='https://jetlag.ayushcchoudhary.com'
meta='''<title>Jet Lag Ledger</title>
<meta name="description" content="Ten years of flights, run through a body clock model, to count the days out of sync. Add your own Flighty file. By Ayush Choudhary.">
<meta property="og:title" content="Jet Lag Ledger: how long have I been jet-lagged?">
<meta property="og:description" content="Ten years of flights, run through a body clock model. Add your own Flighty file and get yours.">
<meta property="og:image" content="%s/og.jpg">
<meta property="og:url" content="%s/">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">''' % (U,U)
assert page.count('<title>Jet Lag Ledger</title>')==1; page=page.replace('<title>Jet Lag Ledger</title>',meta)
for cdn,loc in (('https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js','/d3.min.js'),('https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js','/topojson.min.js')):
    assert page.count(cdn)==1; page=page.replace(cdn,loc)
track='''<script type="module">
/* Visitor analytics: PostHog (US cloud), same setup as ayushcchoudhary.com. First-party: the script is /v.js and data goes to /relay (a Vercel rewrite).
   Nothing is stored in the browser: no cookies, no banner. Each page load is one anonymous visit. No flight data is ever sent: a file you add stays in your browser.
   Off away from the live domain, for bots, and when the browser sends Do Not Track or Global Privacy Control. Visit /?notrack once to stop counting your own visits (/?track undoes it). */
const KEY = 'phc_pV99R48SprP9tisLua6KZ38B9Pr6v2wnaNh3KyLvngEU';
let off = false;
try {
  const q = new URLSearchParams(location.search);
  if (q.has('notrack')) localStorage.setItem('notrack', '1');
  if (q.has('track')) localStorage.removeItem('notrack');
  off = localStorage.getItem('notrack') === '1';
} catch {}
if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl) off = true;
if (KEY && !off && !navigator.webdriver && location.hostname === 'jetlag.ayushcchoudhary.com') {
  const { default: posthog } = await import('/v.js');
  posthog.init(KEY, {
    api_host: '/relay', ui_host: 'https://us.posthog.com',
    persistence: 'memory', person_profiles: 'identified_only',
    capture_pageview: false, capture_pageleave: true, autocapture: false,
    disable_session_recording: true, disable_surveys: true, advanced_disable_flags: true, disable_external_dependency_loading: true
  });
  posthog.register({ site: 'jet-lag-ledger' });
  posthog.capture('$pageview');
  if (/[?&](utm_|notrack|track)/.test(location.search)) history.replaceState(history.state, '', location.pathname + location.hash);
  const ev = (name, props) => posthog.capture(name, props);
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="http"]');
    if (a && a.host !== location.host) ev('link_clicked', { to: a.hostname.replace(/^www\\./, ''), label: a.textContent.trim().slice(0, 40) });
    if (e.target.closest('#tourBtn, #againBtn')) ev('tour_clicked');
    const x = e.target.closest('.xcard'); if (x) ev('experiment_opened', { experiment: +x.dataset.i + 1 });
    if (e.target.closest('#mapPlay')) ev('replay_played');
    if (e.target.closest('#shDl')) ev('card_downloaded');
    if (e.target.closest('#shShare')) ev('card_shared');
  }, true);
  /* a visitor added a file: count that it happened, nothing about the file */
  document.getElementById('file').addEventListener('change', () => ev('file_added', { how: 'choose' }));
  document.getElementById('drop').addEventListener('drop', () => ev('file_added', { how: 'drop' }));
}
</script>
</body>'''
assert page.count('</body>')==1; page=page.replace('</body>',track)
open(OUT+'index.html','w').write(page)
shutil.copy('node_modules/d3/dist/d3.min.js',OUT+'d3.min.js'); shutil.copy('node_modules/topojson/dist/topojson.min.js',OUT+'topojson.min.js')
shutil.copy('/home/claude/personal-site/assets/v.js',OUT+'v.js')
open(OUT+'vercel.json','w').write('{\n  "$schema": "https://openapi.vercel.sh/vercel.json",\n  "rewrites": [\n    { "source": "/relay/:path(.*)", "destination": "https://us.i.posthog.com/:path" }\n  ]\n}\n')
open(OUT+'favicon.svg','w').write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#fff"/><circle cx="32" cy="32" r="21" fill="#f8f7f3" stroke="#1b1b1b" stroke-width="3.5"/><path d="M32 32l7-12" fill="none" stroke="#EF4E14" stroke-width="3.5" stroke-linecap="round"/><path d="M32 32V18M32 32l-11 6" fill="none" stroke="#1b1b1b" stroke-width="3.5" stroke-linecap="round"/></svg>\n')
print(len(page))
