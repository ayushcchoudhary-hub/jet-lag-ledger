(function () {
  "use strict";
  const E = window.JLL, AP = window.AIRPORTS, MLB = window.MLB, DST = window.DST, SUN = window.SUN, US = window.US;
  const TODAY = new Date().toISOString().slice(0, 10);
  const RULES = { east: 1, west: 1.5, threshold: 2 };
  const RULESETS = [[1, 1.5, 2], [1, 1, 2], [1, 1.5, 3], [1.5, 2, 2]];
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const C = { behind: "#EF4E14", ahead: "#2F6FDB", behindDeep: "#C23A08", aheadDeep: "#1F55B5", ink: "#141414", muted: "#5B6672", line: "#E3E6EA", soft: "#F5F6F7", grey: "#AEB5BD", land: "#EEF1F4" };
  const $ = id => document.getElementById(id);
  const fmt = n => Math.round(n).toLocaleString("en-GB");
  const f1 = n => (Math.round(n * 10) / 10).toFixed(1);
  const hrs = n => f1(n).replace(".0", "");
  const sgn = (v, d = 1) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d);
  const monthYear = ymd => new Date(ymd + "T12:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  const longDate = ymd => new Date(ymd + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const dayMonth = ymd => new Date(ymd + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const showDate = ymd => isMine ? monthYear(ymd) : longDate(ymd);
  const showSpan = (a, b) => isMine ? (monthYear(a) === monthYear(b) ? "in " + monthYear(b) : monthYear(a) + " to " + monthYear(b)) : dayMonth(a) + " to " + longDate(b);
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const DUR = REDUCED ? 0 : 700;

  /* ---------- small helpers ---------- */
  const tip = $("tip");
  function showTip(html, ev) {
    const p = ev.touches ? ev.touches[0] : ev;
    tip.innerHTML = html; tip.classList.add("on");
    const r = tip.getBoundingClientRect();
    let x = p.clientX + 14, y = p.clientY + 14;
    if (x + r.width > innerWidth - 8) x = p.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = p.clientY - r.height - 14;
    tip.style.left = Math.max(6, x) + "px"; tip.style.top = Math.max(6, y) + "px";
  }
  const hideTip = () => tip.classList.remove("on");

  const live = new Set();
  function chart(el, fn) {
    el._run = () => { const cs = getComputedStyle(el), W = Math.max(260, Math.floor(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight))); el._w = W; el._cw = Math.floor(el.clientWidth); el.innerHTML = ""; fn(d3.select(el).append("svg").attr("width", W), W); };
    live.add(el); el._run();
  }
  let rz;
  window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => {
    for (const el of [...live]) { if (!el.isConnected) live.delete(el); else if (Math.abs(Math.floor(el.clientWidth) - (el._cw || 0)) > 1) el._run(); }
    hero.resize();
  }, 150); });

  const T = (g, x, y, txt, o = {}) => g.append("text").attr("x", x).attr("y", y).text(txt)
    .attr("font-family", o.display ? "var(--display)" : o.mono ? "var(--mono)" : "var(--body)").attr("font-size", o.size || 14)
    .attr("font-weight", o.weight || 400).attr("fill", o.fill || C.ink).attr("text-anchor", o.anchor || "start");

  const behindScale = d3.interpolateRgb("#FBD3C2", "#B93A0C"), aheadScale = d3.interpolateRgb("#CFDDF7", "#1D4FA8");
  function gapColor(g) { const m = Math.abs(g); if (m < 1) return "#EEEEEC"; const t = Math.min(1, (m - 1) / 8); return g > 0 ? behindScale(t) : aheadScale(t); }

  const OFFSET_CITY = { "-10": "Honolulu", "-9": "Anchorage", "-8": "Los Angeles", "-7": "Denver", "-6": "Chicago", "-5": "New York", "-4": "Halifax", "-3": "São Paulo", "-2": "mid-Atlantic", "-1": "Azores", "0": "London", "1": "Paris", "2": "Cairo", "3": "Istanbul", "4": "Dubai", "5": "Karachi", "6": "Dhaka", "7": "Bangkok", "8": "Singapore", "9": "Tokyo", "10": "Sydney", "11": "Nouméa", "12": "Auckland", "13": "Samoa" };

  let S = null, isMine = true;
  const who = () => isMine ? { I: "I", my: "my", My: "My", me: "Me" } : { I: "You", my: "your", My: "Your", me: "You" };

  function load(text, name, mine) {
    const rows = E.parseCSV(text);
    if (!rows.length || !("From" in rows[0]) || !("To" in rows[0]) || !("Date" in rows[0]))
      throw new Error("This file has no Date, From and To columns. Export it from Flighty as a CSV and try again.");
    const prep = E.prepare(rows, AP, TODAY);
    if (mine && window.MY_META) Object.assign(prep.stats, window.MY_META);   // my public file is already cleaned; these are the counts from the full export
    if (prep.flights.length < 2) throw new Error("I found fewer than two past flights in this file, so there is nothing to measure yet.");
    const sim = E.simulate(prep, TODAY, RULES), sum = E.summarize(prep, sim);
    const range = RULESETS.map(r => E.simulate(prep, TODAY, { east: r[0], west: r[1], threshold: r[2] }).lagDays);
    const d = sim.daily, thr = RULES.threshold; let past = 0, fut = 0, best = 0, cur = 0, bestEnd = 0, maxD = d[0];
    d.forEach((x, i) => {
      if (x.gap >= thr) past++; else if (x.gap <= -thr) fut++;
      if (Math.abs(x.gap) >= thr) { cur++; if (cur > best) { best = cur; bestEnd = i; } } else cur = 0;
      if (Math.abs(x.gap) > Math.abs(maxD.gap)) maxD = x;
    });
    S = { prep, sim, sum, range: [Math.min(...range), Math.max(...range)], name, past, fut, streak: best, streakStart: d[Math.max(0, bestEnd - best + 1)].ymd, streakEnd: d[bestEnd].ymd, maxD };
    isMine = mine; document.body.classList.toggle("is-yours", !mine);
    document.querySelectorAll("[data-you]").forEach(el => { if (el.dataset.me == null) el.dataset.me = el.innerHTML; el.innerHTML = mine ? el.dataset.me : el.dataset.you; });
    $("hDays").textContent = fmt(sum.lagDays);
    renderTicket(); hero.setup(); setupGhost(); renderSplit(); chart($("timeline"), drawTimeline); renderRings(); renderWaffle(); renderYears(); renderSens(true);
    renderPipeline(); renderDecode(); renderFooter(); renderShare();
  }

  /* ---------- ticket ---------- */
  function renderTicket() {
    const s = S.sum, w = who();
    const rows = [["Flights", fmt(s.flights)], ["Miles", fmt(s.miles)], ["Hours in the air", fmt(s.hours)], ["Airports", fmt(s.airports)], ["Journeys", fmt(s.journeys)]];
    $("ticket").innerHTML = `<div class="t-head"><span>JET LAG LEDGER</span><span>${monthYear(s.first).toUpperCase()} – ${monthYear(s.last).toUpperCase()}</span></div>
      <div style="margin-top:10px">${rows.map(r => `<div class="t-row"><span>${r[0]}</span><span>${r[1]}</span></div>`).join("")}</div>
      <div class="t-perf"></div>
      <div class="t-lab" style="display:flex;justify-content:space-between;align-items:center"><span>Days out of sync</span><b class="st r">ESTIMATE</b></div>
      <div class="t-big">${fmt(s.lagDays)}</div>
      <div class="t-split"><div><b class="behind">${fmt(S.past)}</b><span>days behind, living in the past</span></div><div><b class="ahead">${fmt(S.fut)}</b><span>days ahead, living in the future</span></div></div>
      <div class="t-note">Out of sync: ${w.my} body clock was 2 hours or more from the wall clock. Range across rule sets: ${fmt(S.range[0])} to ${fmt(S.range[1])} days.</div>`;
    $("mapTitle").textContent = isMine ? "Ten years of flights" : "Your flights";
    $("mapSub").textContent = `${monthYear(s.first)} to ${monthYear(s.last)}`;
  }

  /* ---------- hero replay ---------- */
  const hero = (function () {
    const canvas = $("heroMap"), ctx = canvas.getContext("2d"), slider = $("mapT"), btn = $("mapPlay");
    let W = 0, H = 0, proj, path, land, arcs = [], raf = null, last = 0, playing = false, p = 1, dur = 22000, first = 0, lastDay = 1;
    function size() { const r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); W = r.width; H = r.height; canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    function setup() {
      size(); land = topojson.feature(window.LAND, window.LAND.objects.land);
      const pts = { type: "MultiPoint", coordinates: S.prep.flights.flatMap(f => [[AP[f.from][1], AP[f.from][0]], [AP[f.to][1], AP[f.to][0]]]) };
      proj = d3.geoNaturalEarth1().fitExtent([[W * 0.03, H * 0.1], [W * 0.97, H * 0.9]], pts); path = d3.geoPath(proj, ctx);
      first = S.prep.flights[0].day; lastDay = S.prep.flights[S.prep.flights.length - 1].day;
      arcs = S.prep.flights.map(f => {
        const ip = d3.geoInterpolate([AP[f.from][1], AP[f.from][0]], [AP[f.to][1], AP[f.to][0]]), n = Math.max(8, Math.round(f.miles / 150)), pp = [];
        for (let i = 0; i <= n; i++) pp.push(proj(ip(i / n)));
        return { f, pts: pp, t: (f.day - first) / Math.max(1, lastDay - first) * 0.985, dir: f.shift > 0.25 ? 1 : f.shift < -0.25 ? -1 : 0 };
      });
      p = 1; draw();
    }
    const col = (dir, a) => dir > 0 ? `rgba(239,78,20,${a})` : dir < 0 ? `rgba(47,111,219,${a})` : `rgba(91,102,114,${a})`;
    function stroke(pts, upto, c, w) {
      ctx.beginPath(); ctx.strokeStyle = c; ctx.lineWidth = w; const n = Math.max(1, Math.floor(upto * (pts.length - 1)));
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i <= n; i++) { if (Math.abs(pts[i][0] - pts[i - 1][0]) > W / 2) ctx.moveTo(pts[i][0], pts[i][1]); else ctx.lineTo(pts[i][0], pts[i][1]); }
      ctx.stroke(); return pts[n];
    }
    function draw() {
      const fin = p >= 1, span = 0.015;
      ctx.clearRect(0, 0, W, H); ctx.fillStyle = C.land; ctx.beginPath(); path(land); ctx.fill(); ctx.lineCap = "round";
      let n = 0; const seen = new Set();
      for (const a of arcs) {
        if (!fin && a.t > p) continue; n++; seen.add(a.f.from); seen.add(a.f.to);
        if (fin || a.t + span <= p) { stroke(a.pts, 1, col(a.dir, fin ? 0.5 : 0.34), 1.3); continue; }
        const h = stroke(a.pts, d3.easeCubicInOut((p - a.t) / span), col(a.dir, 1), 2.4);
        ctx.beginPath(); ctx.fillStyle = C.ink; ctx.arc(h[0], h[1], 3.5, 0, 7); ctx.fill();
      }
      ctx.fillStyle = C.ink; for (const c of seen) { const q = proj([AP[c][1], AP[c][0]]); ctx.beginPath(); ctx.arc(q[0], q[1], 2, 0, 7); ctx.fill(); }
      const day = Math.round(first + Math.min(1, p / 0.985) * (lastDay - first));
      const dd = fin ? S.sim.daily[S.sim.daily.length - 1] : S.sim.daily[clamp(day - S.sim.daily[0].day, 0, S.sim.daily.length - 1)];
      $("tkDate").textContent = fin ? "Today" : monthYear(E.ymdOf(day));
      const g = dd.gap, el = $("tkGap");
      el.textContent = "Body clock: " + (Math.abs(g) < 1 ? "in sync" : `${f1(Math.abs(g))} h ${g > 0 ? "behind" : "ahead"}`);
      el.style.color = Math.abs(g) >= 2 ? (g > 0 ? C.behindDeep : C.aheadDeep) : ""; el.style.fontWeight = Math.abs(g) >= 2 ? 600 : 400;
      $("tkFlights").textContent = `${fmt(n)} flights`;
      slider.value = Math.round(p * 1000);
    }
    function frame(ts) {
      if (!playing) return; const dt = last ? ts - last : 16; last = ts; p = Math.min(1, p + dt / dur); draw();
      if (p < 1) raf = requestAnimationFrame(frame); else stop();
    }
    function stop() { playing = false; cancelAnimationFrame(raf); btn.textContent = "▶"; btn.setAttribute("aria-label", "Play the replay"); }
    function play(ms) {
      if (REDUCED) { p = 1; draw(); return; }
      dur = ms || 22000; if (p >= 1) p = 0; playing = true; last = 0; btn.textContent = "❚❚"; btn.setAttribute("aria-label", "Pause the replay"); raf = requestAnimationFrame(frame);
    }
    btn.addEventListener("click", () => playing ? stop() : play());
    slider.addEventListener("input", () => { stop(); p = slider.value / 1000; draw(); });
    return { setup, play, restart(ms) { stop(); p = 0; play(ms); }, resize() { if (S) { const was = playing, keep = p; stop(); setup(); p = keep; draw(); if (was) play(dur); } } };
  })();

  /* ---------- 01 out of sync: the ghost trip ---------- */
  const GH = { trip: null, win: [], i: 0, timer: null };
  function pickTrip() {
    const J = S.prep.journeys; let best = null;
    J.forEach((j, i) => { const nx = J[i + 1], stay = nx ? nx.start - j.end : 999; if (j.net >= 6 && j.net <= 9 && stay >= 11) best = j; });
    if (best) return best;
    J.forEach((j, i) => { const nx = J[i + 1], stay = nx ? nx.start - j.end : 999; if (Math.abs(j.net) >= 5 && stay >= 8) best = j; });
    return best || J.slice().sort((a, b) => Math.abs(b.net) - Math.abs(a.net))[0];
  }
  function setupGhost() {
    const j = pickTrip(), days = S.sim.daily, i0 = days.findIndex(d => d.day === j.end), J = S.prep.journeys, nx = J[j.id + 1];
    const len = clamp(nx ? nx.start - j.end : 11, 1, 11);
    GH.trip = j; GH.win = days.slice(i0, i0 + len); GH.i = Math.min(3, GH.win.length - 1);
    const g0 = GH.win[0].gap;
    $("ghTitle").textContent = `${j.fromCity} to ${j.toCity}, ${monthYear(E.ymdOf(j.end))}`;
    $("ghSub").textContent = `${hrs(Math.abs(j.net))} hours ${j.net > 0 ? "east" : "west"} \u00b7 tap a day below`;
    $("daystrip").innerHTML = GH.win.map((d, i) => { const m = Math.abs(d.gap); return `<button class="ds" type="button" data-i="${i}" aria-pressed="false" aria-label="${i === 0 ? "Landing day" : "Day " + i}"><div class="b"><i style="height:${Math.max(2, m / Math.max(1, Math.abs(g0)) * 26)}px;background:${m >= 2 ? (d.gap > 0 ? C.behind : C.ahead) : C.grey}"></i></div>${i === 0 ? "Land" : i}</button>`; }).join("");
    $("daystrip").querySelectorAll(".ds").forEach(b => b.addEventListener("click", () => { ghostStop(); setGhost(+b.dataset.i); }));
    chart($("ghost"), drawGhost); setGhost(GH.i);
  }
  function bodyCity(d) {
    const j = GH.trip, last = j.flights[j.flights.length - 1], destOff = last.toOff, bodyOff = destOff - d.gap;
    if (Math.abs(d.gap) < 0.25) return j.toCity;
    const wr = o => ((Math.round(o) + 11) % 24 + 24) % 24 - 11;
    if (wr(bodyOff) === wr(j.flights[0].fromOff)) return j.fromCity;
    return OFFSET_CITY[String(wr(bodyOff))] || `UTC${sgn(wr(bodyOff), 0)}`;
  }
  function drawGhost(svg, W) {
    const j = GH.trip, a = j.flights[0], b = j.flights[j.flights.length - 1], o = [AP[a.from][1], AP[a.from][0]], d = [AP[b.to][1], AP[b.to][0]];
    const g0 = GH.win[0].gap, sign = g0 >= 0 ? 1 : -1, H = Math.round(clamp(W * 0.5, 240, 400)); svg.attr("height", H);
    const lonB = g => d[0] - g * 15, lons = [d[0], lonB(g0), d[0] - sign * Math.abs(j.net) * 15], lonMin = Math.min(...lons) - 14, lonMax = Math.max(...lons) + 14;
    const latMin = Math.max(-70, Math.min(o[1], d[1]) - 16), latMax = Math.min(80, Math.max(o[1], d[1]) + 14);
    const proj = d3.geoEquirectangular().rotate([-(lonMin + lonMax) / 2, 0]).fitExtent([[0, 30], [W, H - 6]], { type: "MultiPoint", coordinates: [[lonMin, latMin], [lonMax, latMax]] });
    const path = d3.geoPath(proj), land = topojson.feature(window.LAND, window.LAND.objects.land);
    svg.append("path").datum(land).attr("d", path).attr("fill", C.land);
    const n = Math.ceil(Math.abs(g0)), every = W < 520 && n > 5 ? 2 : 1;
    for (let k = 0; k <= n; k++) {
      const x = proj([d[0] - sign * k * 15, d[1]])[0];
      svg.append("line").attr("x1", x).attr("x2", x).attr("y1", 26).attr("y2", H).attr("stroke", k === 0 ? C.ink : "#C5CBD3").attr("stroke-width", k === 0 ? 1.5 : 1).attr("stroke-dasharray", k === 0 ? null : "3 4");
      if (k === 0) T(svg, Math.min(x, W - 40), 16, "wall clock", { mono: 1, size: 11, weight: 600, anchor: "middle" });
      else if (k === n) T(svg, Math.max(x, 44), 16, `${k} h ${sign > 0 ? "behind" : "ahead"}`, { mono: 1, size: 11, fill: C.muted, anchor: "middle" });
      else if (k % every === 0 && k < n - (every > 1 ? 1 : 0)) T(svg, x, 16, `${sign > 0 ? "\u2212" : "+"}${k} h`, { mono: 1, size: 11, fill: C.muted, anchor: "middle" });
    }
    svg.append("path").datum({ type: "LineString", coordinates: [o, d] }).attr("d", path).attr("fill", "none").attr("stroke", C.muted).attr("stroke-width", 1.2).attr("stroke-dasharray", "2 5");
    const pd = proj(d), link = svg.append("line").attr("stroke-width", 4).attr("stroke-linecap", "round");
    const pill = svg.append("g"), pr = pill.append("rect").attr("rx", 11).attr("height", 22).attr("fill", "#fff").attr("stroke-width", 1.5), pt = T(pill, 0, 0, "", { mono: 1, size: 12, weight: 600, anchor: "middle" });
    svg.append("circle").attr("cx", pd[0]).attr("cy", pd[1]).attr("r", 8).attr("fill", C.ink).attr("stroke", "#fff").attr("stroke-width", 2.5);
    const meRight = pd[0] < W - 150, w = who();
    const mx0 = meRight ? pd[0] + 13 : Math.min(W - 8, pd[0] + 70), my0 = meRight ? pd[1] - 12 : pd[1] - 34;
    T(svg, mx0, my0, w.me, { size: 15, weight: 700, anchor: meRight ? "start" : "end" }).attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4);
    T(svg, mx0, my0 + 17, `in ${j.toCity}`, { size: 12.5, fill: C.muted, anchor: meRight ? "start" : "end" }).attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4);
    const ring = svg.append("circle").attr("r", 10).attr("fill", "#fff").attr("stroke-width", 4), dot = svg.append("circle").attr("r", 3.5);
    const bl1 = T(svg, 0, 0, `${w.My} body`, { size: 15, weight: 700 }).attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4);
    const bl2 = T(svg, 0, 0, "", { size: 12.5, fill: C.muted }).attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4);
    $("ghost")._upd = i => {
      const dd = GH.win[i], g = dd.gap, m = Math.abs(g), c = g >= 0 ? C.behind : C.ahead, fr = clamp(m / Math.max(0.01, Math.abs(g0)));
      const pb = proj([lonB(g), d[1] + (o[1] - d[1]) * fr]), sync = m < 0.25;
      link.attr("x1", pb[0]).attr("y1", pb[1]).attr("x2", pd[0]).attr("y2", pd[1]).attr("stroke", c).attr("opacity", sync ? 0 : 0.9);
      ring.attr("cx", pb[0]).attr("cy", pb[1]).attr("stroke", c).attr("opacity", sync ? 0 : 1); dot.attr("cx", pb[0]).attr("cy", pb[1]).attr("fill", c).attr("opacity", sync ? 0 : 1);
      const left = pb[0] > 120, lx = pb[0] + (left ? -15 : 15), near = Math.abs(pb[0] - pd[0]) < 130;
      bl1.attr("x", lx).attr("y", pb[1] + (near ? 30 : -12)).attr("text-anchor", left ? "end" : "start").attr("opacity", sync ? 0 : 1);
      bl2.attr("x", lx).attr("y", pb[1] + (near ? 46 : 5)).attr("text-anchor", left ? "end" : "start").attr("opacity", sync ? 0 : 1).text(`on ${bodyCity(dd)} time`);
      const mx = (pb[0] + pd[0]) / 2, my = (pb[1] + pd[1]) / 2, txt = sync ? "Back in sync" : `${hrs(m)} h ${g > 0 ? "behind" : "ahead"}`, tw = txt.length * 7.4 + 18;
      const pcx = clamp(sync ? pd[0] : mx, tw / 2 + 4, W - tw / 2 - 4);
      pr.attr("x", pcx - tw / 2).attr("y", (sync ? pd[1] + 18 : my - 11)).attr("width", tw).attr("stroke", sync ? C.ink : c);
      pt.attr("x", pcx).attr("y", (sync ? pd[1] + 18 : my - 11) + 15).text(txt);
    };
    $("ghost")._upd(GH.i);
  }
  function face(id, hours, color) {
    const h = ((hours % 24) + 24) % 24, night = h < 6 || h >= 21, ink = night ? "#E9ECF3" : C.ink, c = color === C.ink ? ink : color;
    let s = `<circle cx="100" cy="100" r="92" fill="${night ? "#0D1B2A" : "#fff"}" stroke="${C.ink}" stroke-width="3"/>`;
    for (let i = 0; i < 12; i++) { const a = i / 12 * 2 * Math.PI, r1 = i % 3 ? 84 : 77; s += `<line x1="${100 + Math.sin(a) * r1}" y1="${100 - Math.cos(a) * r1}" x2="${100 + Math.sin(a) * 90}" y2="${100 - Math.cos(a) * 90}" stroke="${ink}" stroke-width="${i % 3 ? 1.5 : 3}"/>`; }
    const ha = (h % 12) / 12 * 2 * Math.PI, ma = (h % 1) * 2 * Math.PI;
    s += `<line x1="100" y1="100" x2="${100 + Math.sin(ha) * 48}" y2="${100 - Math.cos(ha) * 48}" stroke="${c}" stroke-width="7" stroke-linecap="round"/><line x1="100" y1="100" x2="${100 + Math.sin(ma) * 70}" y2="${100 - Math.cos(ma) * 70}" stroke="${c}" stroke-width="3.5" stroke-linecap="round"/><circle cx="100" cy="100" r="5" fill="${c}"/>`;
    s += `<text x="100" y="146" text-anchor="middle" font-family="var(--mono)" font-size="13" fill="${night ? "#9AA6B8" : C.muted}">${night ? "night" : h < 12 ? "morning" : h < 18 ? "afternoon" : "evening"}</text>`;
    $(id).innerHTML = s;
  }
  const clockStr = h => { h = ((h % 24) + 24) % 24; const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh >= 12 ? "pm" : "am"}`; };
  function setGhost(i) {
    GH.i = i; const d = GH.win[i], g = d.gap, m = Math.abs(g), lag = m >= RULES.threshold, j = GH.trip, w = who();
    if ($("ghost")._upd) $("ghost")._upd(i);
    face("cWall", 8, C.ink); face("cBody", 8 - g, lag ? (g > 0 ? C.behind : C.ahead) : C.ink);
    feel(m);
    $("tWall").textContent = clockStr(8); $("tBody").textContent = clockStr(8 - g);
    $("capWall").textContent = `Wall clock, ${j.toCity}`; $("capBody").textContent = `${w.My} body clock`;
    const when = i === 0 ? "Landing day" : `Day ${i}`;
    $("saying").innerHTML = m < 0.25 ? `<b>${when} in ${j.toCity}.</b> ${w.My} body has caught up. Back in sync.`
      : `<b>${when} in ${j.toCity}.</b> The wall clock says 8:00 am. ${w.My} body says ${clockStr(8 - g)}. It is still on ${bodyCity(d)} time, ${hrs(m)} hours ${g > 0 ? "behind" : "ahead"}. ${lag ? "This day counts as out of sync." : "Under 2 hours, so this day does not count."}`;
    $("daystrip").querySelectorAll(".ds").forEach((b, k) => b.setAttribute("aria-pressed", k === i ? "true" : "false"));
  }
  function feel(m) {
    const t = clamp(m / 7), svg = d3.select("#cFeel"); svg.selectAll("*").remove();
    const g = svg.append("g").attr("transform", `rotate(${t * 9} 100 170)`);
    g.append("path").attr("d", "M44 196c4-30 26-44 56-44s52 14 56 44").attr("fill", C.soft).attr("stroke", C.ink).attr("stroke-width", 5);
    g.append("circle").attr("cx", 100).attr("cy", 92).attr("r", 58).attr("fill", "#fff").attr("stroke", C.ink).attr("stroke-width", 5);
    g.append("path").attr("d", "M62 52c10-16 34-24 56-16 12 4 20 10 24 20-22-8-52-10-80-4z").attr("fill", C.ink);
    const ry = Math.max(1.6, 10 * (1 - 0.88 * t));
    [78, 122].forEach((cx, k) => {
      g.append("ellipse").attr("cx", cx).attr("cy", 92).attr("rx", 8).attr("ry", ry).attr("fill", C.ink);
      g.append("path").attr("d", `M${cx - 13} ${82 - 6 * (1 - t) + (k ? -1 : 1) * 0} L${cx + 13} ${82 - 6 * (1 - t)}`).attr("stroke", C.ink).attr("stroke-width", 4).attr("stroke-linecap", "round").attr("opacity", t > 0.2 ? 1 : 0).attr("transform", `rotate(${(k ? -1 : 1) * 12 * t} ${cx} 82)`);
      g.append("path").attr("d", `M${cx - 11} 104q11 9 22 0`).attr("fill", "none").attr("stroke", C.muted).attr("stroke-width", 3).attr("stroke-linecap", "round").attr("opacity", clamp(t * 1.5));
    });
    g.append("path").attr("d", `M80 124Q100 ${124 + 16 * (1 - 2.2 * t)} 120 124`).attr("fill", "none").attr("stroke", C.ink).attr("stroke-width", 5).attr("stroke-linecap", "round");
    if (m >= RULES.threshold) { const z = 16 + 16 * t; T(svg, 150, 44, "z", { display: 1, size: z, weight: 800, fill: C.muted }); T(svg, 166, 26, "z", { display: 1, size: z * 0.7, weight: 800, fill: C.muted }); }
    $("tFeel").textContent = m < 0.25 ? "Fine" : m < 2 ? "A bit off" : m < 4 ? "Tired" : "Wrecked";
  }
  function ghostStop() { clearInterval(GH.timer); GH.timer = null; $("ghPlay").textContent = "▶"; }
  function ghostPlay(ms) {
    ghostStop(); if (REDUCED) return; setGhost(0); $("ghPlay").textContent = "❚❚";
    GH.timer = setInterval(() => { if (GH.i >= GH.win.length - 1) return ghostStop(); setGhost(GH.i + 1); }, ms || 800);
  }
  $("ghPlay").addEventListener("click", () => GH.timer ? ghostStop() : ghostPlay());

  /* ---------- shared chart: dot and range rows ---------- */
  function dotRows(svg, W, items, o) {
    const narrow = W < 540, left = narrow ? 14 : (o.left || 200), right = 58, step = narrow ? 70 : 58, top = 18, H = top + items.length * step + 50; svg.attr("height", H);
    const x = d3.scaleLinear().domain(o.domain).range([left, W - right]), y1 = top + items.length * step;
    x.ticks(narrow ? 4 : 7).forEach(t => {
      svg.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", top - 6).attr("y2", y1).attr("stroke", t === 0 ? C.ink : C.line).attr("stroke-width", t === 0 ? 1.5 : 1);
      T(svg, x(t), y1 + 16, (o.tick || (v => sgn(v, 0)))(t), { mono: 1, size: 11.5, fill: C.muted, anchor: "middle" });
    });
    T(svg, (left + W - right) / 2, y1 + 38, o.title, { size: 12.5, fill: C.muted, anchor: "middle" });
    items.forEach((it, i) => {
      const y = top + i * step + (narrow ? 40 : 28);
      if (narrow) T(svg, 14, y - 20, it.label, { size: 13.5, weight: 600 }); else { T(svg, left - 14, y + (it.sub ? -2 : 5), it.label, { size: 14, weight: 600, anchor: "end" }); if (it.sub) T(svg, left - 14, y + 14, it.sub, { size: 12, fill: C.muted, anchor: "end" }); }
      if (it.lo != null) { svg.append("line").attr("x1", x(it.lo)).attr("x2", x(it.hi)).attr("y1", y).attr("y2", y).attr("stroke", it.col).attr("stroke-width", 3).attr("stroke-linecap", "round").attr("opacity", .55); }
      svg.append("circle").attr("cx", x(it.v)).attr("cy", y).attr("r", 8).attr("fill", it.col).attr("stroke", "#fff").attr("stroke-width", 2.5);
      T(svg, x(it.hi != null ? it.hi : it.v) + 10, y + 5, it.text, { mono: 1, size: 13, weight: 600 });
    });
  }

  /* ---------- experiment 1: baseball ---------- */
  const lower48 = (() => { const st = topojson.feature(US, US.objects.states); return { type: "FeatureCollection", features: st.features.filter(f => !["02", "15", "72", "78", "60", "66", "69"].includes(f.id)) }; })();
  function drawBaseball(svg, W) {
    const a = MLB.all, e = a.east * 100, w = a.west * 100, eLo = e - 196 * a.east_se, eHi = e + 196 * a.east_se, wLo = w - 196 * a.west_se, wHi = w + 196 * a.west_se;
    const H = 344, L = 16, R = 16; svg.attr("height", H);
    const x = d3.scaleLinear().domain([-7, 7]).range([L, W - R]), x0 = x(0);
    [-6, -3, 3, 6].forEach(t => { svg.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", 52).attr("y2", 236).attr("stroke", C.line); T(svg, x(t), 252, sgn(t, 0), { mono: 1, size: 11.5, fill: C.muted, anchor: "middle" }); });
    T(svg, x0, 16, "In sync", { size: 14, weight: 700, anchor: "middle" }); T(svg, x0, 33, `${fmt(a.base * 100)} home runs allowed per 100 games`, { size: 12.5, fill: C.muted, anchor: "middle" });
    svg.append("line").attr("x1", x0).attr("x2", x0).attr("y1", 44).attr("y2", 240).attr("stroke", C.ink).attr("stroke-width", 2);
    const row = (y, v, lo, hi, col, deep, label) => {
      const nar = W < 520, t = svg.append("text").attr("x", nar ? L : v > 0 ? x0 + 10 : x0 - 10).attr("y", y - 10).attr("text-anchor", nar || v > 0 ? "start" : "end").attr("font-family", "var(--body)").attr("font-size", 14).attr("font-weight", 600);
      t.append("tspan").text(label + "  "); t.append("tspan").attr("fill", deep).attr("font-family", "var(--display)").attr("font-size", 22).attr("font-weight", 800).text(sgn(v));
      const r = svg.append("rect").attr("y", y).attr("height", 44).attr("rx", 5).attr("fill", col).attr("x", x0).attr("width", 0);
      r.transition().duration(DUR).attr("x", Math.min(x0, x(v))).attr("width", Math.abs(x(v) - x0));
      const g = svg.append("g").attr("opacity", 0); g.transition().delay(DUR * .7).duration(DUR * .5).attr("opacity", 1);
      g.append("line").attr("x1", x(lo)).attr("x2", x(hi)).attr("y1", y + 22).attr("y2", y + 22).attr("stroke", C.ink).attr("stroke-width", 1.5);
      [lo, hi].forEach(q => g.append("line").attr("x1", x(q)).attr("x2", x(q)).attr("y1", y + 15).attr("y2", y + 29).attr("stroke", C.ink).attr("stroke-width", 1.5));
    };
    row(84, e, eLo, eHi, C.behind, C.behindDeep, "After flying east"); row(172, w, wLo, wHi, C.ahead, C.aheadDeep, "After flying west");
    T(svg, L, 272, W < 520 ? "\u2190 better pitching" : "\u2190 fewer allowed: better pitching", { size: 12, fill: C.muted }); T(svg, W - R, 272, W < 520 ? "worse pitching \u2192" : "more allowed: worse \u2192", { size: 12, fill: C.muted, anchor: "end" });
    const by = 300; svg.append("line").attr("x1", x(w)).attr("x2", x(e)).attr("y1", by).attr("y2", by).attr("stroke", C.ink).attr("stroke-width", 2);
    [w, e].forEach(q => svg.append("line").attr("x1", x(q)).attr("x2", x(q)).attr("y1", by - 6).attr("y2", by + 6).attr("stroke", C.ink).attr("stroke-width", 2));
    T(svg, x((w + e) / 2), by + 24, `The gap: ${f1(a.diff * 100)} home runs per 100 games`, { size: 14, weight: 700, anchor: "middle" });
  }
  const SEA = { i: 0, timer: null };
  function viewSeason(el) {
    const G = MLB.games, lag = G.filter(g => g.gap >= 2).length;
    SEA.i = Math.max(0, G.findIndex(g => g.gap >= 3)); if (SEA.i < 0) SEA.i = Math.max(0, G.findIndex(g => g.gap >= 2));
    el.innerHTML = `<div class="sinfo"><b id="sDate"></b><span id="sCity"></span><span class="pillg" id="sGap"></span><span id="sCount"></span></div><div id="sMap"></div><div id="sLine"></div>
      <div class="jctl" style="border:2px solid ${C.ink};border-radius:14px;margin-top:8px"><button class="play" id="sPlay" type="button" aria-label="Play the season">▶</button><input id="sT" type="range" min="0" max="${G.length - 1}" value="${SEA.i}" aria-label="Game of the season"><span class="date" id="sN"></span></div>`;
    const set = i => {
      SEA.i = i; const g = G[i], gap = g.gap, c = gap >= 2 ? C.behind : gap <= -2 ? C.ahead : C.ink;
      $("sDate").textContent = dayMonth(g.d); $("sCity").textContent = (g.home ? "Home in " : "Away in ") + g.city;
      $("sGap").textContent = Math.abs(gap) < 0.05 ? "In sync" : `${hrs(Math.abs(gap))} h ${gap > 0 ? "behind" : "ahead"}${Math.abs(gap) >= 2 ? ": jet-lagged" : ""}`; $("sGap").style.background = c;
      $("sCount").textContent = `${G.slice(0, i + 1).filter(q => q.gap >= 2).length} of ${lag} east-lagged games so far`;
      $("sN").textContent = `Game ${i + 1} of ${G.length}`; $("sT").value = i;
      if ($("sMap")._upd) $("sMap")._upd(i); if ($("sLine")._upd) $("sLine")._upd(i);
    };
    chart($("sMap"), (svg, W) => {
      const H = Math.round(Math.min(W * 0.56, 330)); svg.attr("height", H);
      const proj = d3.geoAlbers().fitExtent([[4, 4], [W - 4, H - 4]], lower48), path = d3.geoPath(proj);
      svg.append("path").datum(lower48).attr("d", path).attr("fill", C.land).attr("stroke", "#fff").attr("stroke-width", 1);
      const parks = [...new Map(G.map(q => [q.park, q])).values()], pts = G.map(q => proj([q.lon, q.lat]));
      parks.forEach(pk => { const q = proj([pk.lon, pk.lat]); svg.append("circle").attr("cx", q[0]).attr("cy", q[1]).attr("r", 3.5).attr("fill", "#fff").attr("stroke", C.muted).attr("stroke-width", 1.5); });
      const trail = svg.append("path").attr("fill", "none").attr("stroke", C.ink).attr("stroke-opacity", .18).attr("stroke-width", 1.3);
      const hop = svg.append("path").attr("fill", "none").attr("stroke-width", 3).attr("stroke-linecap", "round");
      const dot = svg.append("circle").attr("r", 9).attr("stroke", "#fff").attr("stroke-width", 3), lab = T(svg, 0, 0, "", { size: 13, weight: 700 }).attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4);
      $("sMap")._upd = i => {
        const gap = G[i].gap, c = gap >= 2 ? C.behind : gap <= -2 ? C.ahead : C.ink; let k = i; while (k > 0 && G[k - 1].park === G[i].park) k--;
        trail.attr("d", "M" + pts.slice(0, i + 1).map(q => q.join(",")).join("L"));
        hop.attr("d", k > 0 ? `M${pts[k - 1].join(",")}L${pts[i].join(",")}` : null).attr("stroke", c);
        dot.attr("cx", pts[i][0]).attr("cy", pts[i][1]).attr("fill", c);
        const right = pts[i][0] < W - 110; lab.attr("x", pts[i][0] + (right ? 14 : -14)).attr("y", pts[i][1] + 5).attr("text-anchor", right ? "start" : "end").text(G[i].city);
      }; $("sMap")._upd(SEA.i);
    });
    chart($("sLine"), (svg, W) => {
      const H = 150, L = 40, R = 8; svg.attr("height", H);
      const x = d3.scaleLinear().domain([0, G.length - 1]).range([L, W - R]), y = d3.scaleLinear().domain([3.6, -3.6]).range([H - 20, 8]);
      svg.append("rect").attr("x", L).attr("width", W - R - L).attr("y", y(2)).attr("height", y(3.6) - y(2)).attr("fill", "#FFF1EA");
      svg.append("rect").attr("x", L).attr("width", W - R - L).attr("y", y(-3.6)).attr("height", y(-2) - y(-3.6)).attr("fill", "#EAF1FD");
      T(svg, W - R - 4, y(3.6) - 5, "jet-lagged: body behind", { mono: 1, size: 10.5, fill: C.behindDeep, anchor: "end" }); T(svg, W - R - 4, y(-3.6) + 13, "jet-lagged: body ahead", { mono: 1, size: 10.5, fill: C.aheadDeep, anchor: "end" });
      [-2, 0, 2].forEach(t => { svg.append("line").attr("x1", L).attr("x2", W - R).attr("y1", y(t)).attr("y2", y(t)).attr("stroke", t === 0 ? C.muted : C.line); T(svg, L - 6, y(t) + 4, t === 0 ? "0" : `${Math.abs(t)} h`, { mono: 1, size: 10.5, fill: C.muted, anchor: "end" }); });
      ["Apr", "May", "Jun", "Jul", "Aug", "Sep"].forEach(m => { const i = G.findIndex(q => new Date(q.d + "T12:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }) === m); if (i >= 0) T(svg, x(i), H - 4, m, { mono: 1, size: 10.5, fill: C.muted, anchor: "middle" }); });
      svg.append("path").attr("fill", "none").attr("stroke", C.ink).attr("stroke-width", 1.6).attr("d", d3.line().x((d, i) => x(i)).y(d => y(clamp(d.gap, -3.6, 3.6))).curve(d3.curveStepAfter)(G));
      G.forEach((q, i) => { if (q.gap >= 2) svg.append("circle").attr("cx", x(i)).attr("cy", y(Math.min(3.6, q.gap))).attr("r", 3.5).attr("fill", C.behind); });
      const cur = svg.append("line").attr("y1", 4).attr("y2", H - 18).attr("stroke", C.ink).attr("stroke-width", 2), cd = svg.append("circle").attr("r", 5.5).attr("stroke", "#fff").attr("stroke-width", 2);
      const ov = svg.append("rect").attr("x", L).attr("y", 0).attr("width", W - R - L).attr("height", H).attr("fill", "transparent").style("cursor", "ew-resize");
      const pick = ev => { const [mx] = d3.pointer(ev, svg.node()); seasonStop(); set(clamp(Math.round(x.invert(mx)), 0, G.length - 1)); };
      ov.on("click", pick).on("mousemove", ev => { if (ev.buttons) pick(ev); });
      $("sLine")._upd = i => { const gap = G[i].gap; cur.attr("x1", x(i)).attr("x2", x(i)); cd.attr("cx", x(i)).attr("cy", y(clamp(gap, -3.6, 3.6))).attr("fill", gap >= 2 ? C.behind : gap <= -2 ? C.ahead : C.ink); };
      $("sLine")._upd(SEA.i);
    });
    const seasonStop = () => { clearInterval(SEA.timer); SEA.timer = null; if ($("sPlay")) $("sPlay").textContent = "▶"; };
    $("sT").addEventListener("input", ev => { seasonStop(); set(+ev.target.value); });
    $("sPlay").addEventListener("click", () => {
      if (SEA.timer) return seasonStop(); if (SEA.i >= G.length - 1) set(0); $("sPlay").textContent = "❚❚";
      SEA.timer = setInterval(() => { if (!$("sT") || SEA.i >= G.length - 1) return seasonStop(); set(SEA.i + 1); }, 90);
    });
    set(SEA.i);
  }
  function drawPeriods(svg, W) {
    const mk = (e, label, sub) => ({ label, sub, v: e.diff * 100, lo: (e.diff - 1.96 * e.diff_se) * 100, hi: (e.diff + 1.96 * e.diff_se) * 100, col: C.ink, text: sgn(e.diff * 100) });
    dotRows(svg, W, [mk(MLB.paper, "1992 to 2011", "the paper's years"), mk(MLB.new, "2012 to 2025", "new seasons"), mk(MLB.all, "All 34 seasons", "")], { domain: [-6, 14], title: "Gap between east and west, in home runs allowed per 100 games", left: 150 });
  }

  /* ---------- experiment 2: clock change ---------- */
  function drawWeeks(weeks, spring) {
    return (svg, W) => {
      const narrow = W < 520, m = { l: 46, r: 14, t: 40, b: narrow ? 50 : 34 }, H = 330; svg.attr("height", H);
      const val = Object.fromEntries(weeks), ctrl = (val[-2] + val[-1] + val[2] + val[3]) / 4, v0 = val[0], extra = v0 - ctrl;
      const x = d3.scalePoint().domain(weeks.map(d => d[0])).range([m.l + 24, W - m.r - 24]);
      const vs = weeks.map(d => d[1]), y = d3.scaleLinear().domain([Math.min(...vs) - 14, Math.max(...vs) + (narrow ? 44 : 26)]).range([H - m.b, m.t]);
      T(svg, 0, 14, narrow ? "Fatal crashes per week, average year" : "Fatal crashes per week, in an average year (2000 to 2024)", { size: 12.5, fill: C.muted });
      y.ticks(4).forEach(t => { svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(t)).attr("y2", y(t)).attr("stroke", C.line); T(svg, m.l - 6, y(t) + 4, t, { mono: 1, size: 11.5, fill: C.muted, anchor: "end" }); });
      svg.append("path").attr("fill", "none").attr("stroke", C.grey).attr("stroke-width", 1.5).attr("d", d3.line().x(d => x(d[0])).y(d => y(d[1]))(weeks));
      svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(ctrl)).attr("y2", y(ctrl)).attr("stroke", C.ink).attr("stroke-width", 1.5).attr("stroke-dasharray", "5 4");
      T(svg, W - m.r, y(ctrl) + 16, `Usual level: ${fmt(ctrl)}`, { mono: 1, size: 11.5, anchor: "end" });
      const col = spring ? C.behind : C.muted;
      const bar = svg.append("line").attr("x1", x(0)).attr("x2", x(0)).attr("y1", y(ctrl)).attr("y2", y(ctrl)).attr("stroke", col).attr("stroke-width", 5).attr("stroke-linecap", "round");
      bar.transition().duration(DUR).attr("y2", y(v0));
      weeks.forEach(([w, v]) => {
        const isC = [-2, -1, 2, 3].includes(w);
        svg.append("circle").attr("cx", x(w)).attr("cy", y(v)).attr("r", w === 0 ? 9 : 6).attr("fill", w === 0 ? col : isC ? "#fff" : C.grey).attr("stroke", w === 0 ? "#fff" : isC ? C.ink : "#fff").attr("stroke-width", 2);
        const lbl = w === 0 ? (narrow ? "After" : "Week after") : narrow ? sgn(w, 0) : `${Math.abs(w)} wk ${w < 0 ? "before" : "after"}`;
        T(svg, x(w), H - m.b + 18, lbl, { mono: 1, size: 11.5, anchor: "middle", fill: w === 0 ? C.ink : C.muted, weight: w === 0 ? 600 : 400 });
      });
      if (narrow) T(svg, (m.l + W - m.r) / 2, H - 8, "weeks from the clock change", { size: 12, fill: C.muted, anchor: "middle" });
      const tx = narrow ? x(0) : x(0) + 16, ty = narrow ? y(v0) - 36 : y(v0) + (spring ? 4 : -34), anc = narrow ? "middle" : "start";
      T(svg, tx, ty, `${sgn(extra, 0)}`, { display: 1, size: 30, weight: 800, fill: spring ? C.behindDeep : C.muted, anchor: anc });
      T(svg, tx, ty + 18, spring ? `fatal crashes (${sgn((v0 / ctrl - 1) * 100)}%)` : "no clear change", { size: 13, weight: 600, anchor: anc });
      const lx = x(-3), ly = m.t + 6;
      svg.append("circle").attr("cx", lx).attr("cy", ly).attr("r", 5).attr("fill", "#fff").attr("stroke", C.ink).attr("stroke-width", 2); T(svg, lx + 10, ly + 4, "comparison weeks", { size: 11.5, fill: C.muted });
      svg.append("circle").attr("cx", lx + 128).attr("cy", ly).attr("r", 5).attr("fill", C.grey); T(svg, lx + 138, ly + 4, "other weeks", { size: 11.5, fill: C.muted });
    };
  }
  function drawBlocks(svg, W) {
    const B = DST.blocks, narrow = W < 520, m = { l: 46, r: 10, t: 36, b: narrow ? 50 : 36 }, H = 320; svg.attr("height", H);
    const x = d3.scaleBand().domain(B.map(b => b.h0)).range([m.l, W - m.r]).padding(0.22), y = d3.scaleLinear().domain([-14, 28]).range([H - m.b, m.t]);
    T(svg, 0, 14, "Change in fatal crashes in the week after springing forward, by time of day", { size: 12.5, fill: C.muted });
    [-10, 0, 10, 20].forEach(t => { svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(t)).attr("y2", y(t)).attr("stroke", t === 0 ? C.ink : C.line).attr("stroke-width", t === 0 ? 1.5 : 1); T(svg, m.l - 6, y(t) + 4, sgn(t, 0) + "%", { mono: 1, size: 11.5, fill: C.muted, anchor: "end" }); });
    const names = ["12–3 am", "3–6 am", "6–9 am", "9–12 am", "12–3 pm", "3–6 pm", "6–9 pm", "9–12 pm"], short = ["12a", "3a", "6a", "9a", "12p", "3p", "6p", "9p"];
    B.forEach((b, i) => {
      const v = (b.rr - 1) * 100, hot = b.h0 === 3 || b.h0 === 6, cx = x(b.h0) + x.bandwidth() / 2;
      const r = svg.append("rect").attr("x", x(b.h0)).attr("width", x.bandwidth()).attr("rx", 4).attr("fill", hot ? C.behind : C.grey).attr("y", y(0)).attr("height", 0);
      r.transition().duration(DUR).attr("y", Math.min(y(v), y(0))).attr("height", Math.abs(y(v) - y(0)));
      svg.append("line").attr("x1", cx).attr("x2", cx).attr("y1", y((b.lo - 1) * 100)).attr("y2", y((b.hi - 1) * 100)).attr("stroke", C.ink).attr("stroke-width", 1.5);
      if (hot || b.h0 === 0) T(svg, cx, v > 0 ? y((b.hi - 1) * 100) - 7 : y((b.lo - 1) * 100) + 16, sgn(v, 0) + "%", { mono: 1, size: 13, weight: 600, anchor: "middle" });
      T(svg, cx, H - m.b + 18, narrow ? short[i] : names[i], { mono: 1, size: 11, anchor: "middle", fill: hot ? C.ink : C.muted, weight: hot ? 600 : 400 });
    });
    if (narrow) T(svg, (m.l + W - m.r) / 2, H - 8, "time of day (3-hour blocks)", { size: 12, fill: C.muted, anchor: "middle" });
  }
  function drawUK(svg, W) {
    const D = DST, it = (label, sub, o, col) => ({ label, sub, v: (o.rr - 1) * 100, lo: (o.lo - 1) * 100, hi: (o.hi - 1) * 100, col, text: sgn((o.rr - 1) * 100) + "%" });
    dotRows(svg, W, [it("US, fatal crashes", fmt(D.totals.us_fatal) + " crashes", D.us, C.behind), it("Britain, fatal crashes", fmt(D.totals.uk_fatal) + " crashes", D.uk, C.ink), it("Britain, all injury crashes", fmt(D.totals.uk_all) + " crashes", D.uk_all, C.ink)],
      { domain: [-8, 14], title: "Change in the week after the spring clock change", tick: v => sgn(v, 0) + "%", left: 210 });
  }

  /* ---------- experiment 3: sunset line ---------- */
  const TA = SUN.towns[0], TB = SUN.towns[1], JUN = 171, SUNGAP = Math.round((TA.days[JUN][1] - TB.days[JUN][1]) * 60);
  const TOWNDIST = Math.round(d3.geoDistance([TA.lon, TA.lat], [TB.lon, TB.lat]) * 3958.8);
  const hm = h => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh >= 12 ? "pm" : "am"}`; };
  function drawSunset(svg, W) {
    const narrow = W < 520, m = { l: 48, r: 14, t: 34, b: 28 }, H = 330; svg.attr("height", H);
    const x = d3.scaleUtc().domain([new Date("2025-01-01"), new Date("2025-12-31")]).range([m.l, W - m.r]), y = d3.scaleLinear().domain([16.4, 21.6]).range([H - m.b, m.t]);
    T(svg, 0, 14, "Sunset on the local clock, each day of 2025", { size: 12.5, fill: C.muted });
    for (let h = 17; h <= 21; h++) { svg.append("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y(h)).attr("y2", y(h)).attr("stroke", C.line); T(svg, m.l - 6, y(h) + 4, `${h - 12} pm`, { mono: 1, size: 11.5, fill: C.muted, anchor: "end" }); }
    (narrow ? ["Jan", "Apr", "Jul", "Oct"] : ["Jan", "Mar", "May", "Jul", "Sep", "Nov"]).forEach((mm, i) => T(svg, x(new Date(Date.UTC(2025, i * (narrow ? 3 : 2), 15))), H - 8, mm, { mono: 1, size: 11.5, fill: C.muted, anchor: "middle" }));
    const gen = d3.line().x(d => x(new Date(d[0]))).y(d => y(d[1]));
    svg.append("path").attr("fill", "none").attr("stroke", C.ahead).attr("stroke-width", 3).attr("d", gen(TB.days));
    svg.append("path").attr("fill", "none").attr("stroke", C.behind).attr("stroke-width", 3).attr("d", gen(TA.days));
    const xj = x(new Date(TA.days[JUN][0])), ya = y(TA.days[JUN][1]), yb = y(TB.days[JUN][1]);
    svg.append("line").attr("x1", xj).attr("x2", xj).attr("y1", ya).attr("y2", yb).attr("stroke", C.ink).attr("stroke-width", 2.5);
    [ya, yb].forEach(q => svg.append("circle").attr("cx", xj).attr("cy", q).attr("r", 4.5).attr("fill", C.ink));
    T(svg, xj + 10, (ya + yb) / 2 + 5, `${SUNGAP} min later`, { size: 14, weight: 700 }).attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4);
    const xs = x(new Date("2025-04-20")), ia = 109;
  }
  function drawTowns(svg, W) {
    const H = Math.round(clamp(W * 0.62, 260, 380)); svg.attr("height", H);
    const st = topojson.feature(US, US.objects.states), region = { type: "FeatureCollection", features: st.features.filter(f => ["01", "13", "47", "28", "12", "45", "37", "21"].includes(f.id)) };
    const border = topojson.mesh(US, US.objects.states, (a, b) => (a.id === "01" && b.id === "13") || (a.id === "13" && b.id === "01"));
    const proj = d3.geoMercator().fitExtent([[10, 10], [W - 10, H - 10]], { type: "MultiPoint", coordinates: [[-88.6, 31.0], [-82.0, 36.2]] }), path = d3.geoPath(proj);
    svg.append("path").datum(region).attr("d", path).attr("fill", C.land).attr("stroke", "#fff").attr("stroke-width", 1.5);
    svg.append("path").datum(border).attr("d", path).attr("fill", "none").attr("stroke", C.ink).attr("stroke-width", 3).attr("stroke-dasharray", "7 5");
    const ga = proj([-83.6, 32.9]), al = proj([-86.9, 32.9]);
    T(svg, al[0], al[1], "CENTRAL TIME", { mono: 1, size: 12.5, weight: 600, anchor: "middle", fill: C.aheadDeep }); T(svg, al[0], al[1] + 18, "Alabama", { size: 13, fill: C.muted, anchor: "middle" });
    T(svg, ga[0], ga[1], "EASTERN TIME", { mono: 1, size: 12.5, weight: 600, anchor: "middle", fill: C.behindDeep }); T(svg, ga[0], ga[1] + 18, "Georgia", { size: 13, fill: C.muted, anchor: "middle" });
    [[TA, C.behind, 1], [TB, C.ahead, -1]].forEach(([t, c, s]) => {
      const q = proj([t.lon, t.lat]); svg.append("circle").attr("cx", q[0]).attr("cy", q[1]).attr("r", 9).attr("fill", c).attr("stroke", "#fff").attr("stroke-width", 3);
      T(svg, q[0] + s * 14, q[1] - 12, t.name.split(",")[0], { size: 15, weight: 700, anchor: s > 0 ? "start" : "end" }).attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4);
      T(svg, q[0] + s * 14, q[1] + 5, `sunset ${hm(t.days[JUN][1])}`, { mono: 1, size: 12, anchor: s > 0 ? "start" : "end" }).attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 4);
    });
  }

  /* ---------- takeaway pictures ---------- */
  const CAR = `<svg viewBox="0 0 26 14" aria-hidden="true"><path d="M1.5 10V8.300c0-.9.600-1.700 1.500-1.900l2.800-.6 2.300-3.300c.4-.6 1-.9 1.700-.9h5.900c.7 0 1.300.3 1.700.9l2.200 3.200 3.300.7c.9.2 1.600 1 1.600 1.900V10z"/><circle cx="7.500" cy="10.500" r="2.600" stroke="#fff" stroke-width="1.200"/><circle cx="18.500" cy="10.500" r="2.600" stroke="#fff" stroke-width="1.200"/></svg>`;
  const MOON = `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M14.500 13.800A7 7 0 0 1 7.200 3 7.500 7.500 0 1 0 17 12.800a7 7 0 0 1-2.500 1z"/></svg>`;
  const many = (n, f) => Array.from({ length: n }, (_, k) => f(k)).join("");
  function picBall(el) {
    const base = a0.base * 100, w = base + a0.west * 100, e = base + a0.east * 100, nw = Math.round(w), ex = Math.round(a0.diff * 100);
    el.innerHTML = `<div class="pic">
      <div class="prow"><div class="plab"><b style="color:${C.aheadDeep}">After flying west</b><span>${f1(w)} home runs allowed per 100 games</span></div><div class="dots">${many(nw, k => `<i class="w" style="--d:${k}"></i>`)}</div></div>
      <div class="prow"><div class="plab"><b style="color:${C.behindDeep}">After flying east</b><span>${f1(e)} home runs allowed per 100 games</span></div><div class="dots">${many(nw, k => `<i class="e" style="--d:${k}"></i>`)}${many(ex, k => `<i class="x" style="--d:${nw + 30 + k * 22}"></i>`)}</div></div>
      <div class="pbig"><b>+${ex}</b><span>more home runs allowed per 100 games after flying east. The dark dots are the extra ones.</span></div></div>`;
  }
  function picCars(el) {
    const u = Math.round(sprCtrl / 10), af = Math.round(spr[0] / 10), ex = af - u;
    el.innerHTML = `<div class="pic">
      <div class="clk"><svg viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="26" fill="#fff" stroke="${C.ink}" stroke-width="4"/><line x1="30" y1="30" x2="30" y2="11" stroke="${C.ink}" stroke-width="3" stroke-linecap="round"/><line class="hh" x1="30" y1="30" x2="30" y2="17" stroke="${C.behind}" stroke-width="4.500" stroke-linecap="round"/></svg><span><b>2:00 am becomes 3:00 am.</b> One hour of the night is gone.</span></div>
      <div class="prow"><div class="plab"><b>A usual week</b><span>${fmt(sprCtrl)} fatal crashes</span></div><div class="cars">${many(u, k => `<i class="u" style="--d:${k}">${CAR}</i>`)}</div></div>
      <div class="prow"><div class="plab"><b style="color:${C.behindDeep}">The week after the change</b><span>${fmt(spr[0])} fatal crashes</span></div><div class="cars">${many(u, k => `<i class="a" style="--d:${k}">${CAR}</i>`)}${many(ex, k => `<i class="x" style="--d:${u + 20 + k * 24}">${CAR}</i>`)}</div></div>
      <div class="pbig"><b>+${Math.round(sprExtra)}</b><span>more fatal crashes in that one week. One car is 10 fatal crashes. Average per year, ${DST.years[0]} to ${DST.years[1]}.</span></div></div>`;
  }
  function picSunset(el) {
    const hours = Math.round(19 * 365 / 60), nights = Math.round(19 * 365 / 60 / 8), A = TA.name.split(",")[0], Bn = TB.name.split(",")[0];
    el.innerHTML = `<div class="pic"><div class="chain big">
      <div><small>1 \u00b7 THE CLOCK</small><div class="skies"><div class="sky dark"><em></em><span>${Bn}</span></div><div class="sky lite"><em></em><span>${A}</span></div></div><b>${SUNGAP} min</b><span>later sunset in ${A}. At 8:00 pm on 21 June the sun has set in ${Bn}. It is still up in ${A}, ${TOWNDIST} miles away.</span><i class="st d">CALCULATED HERE</i></div>
      <div><small>2 \u00b7 SLEEP</small><div class="moons">${many(nights, k => `<i style="--d:${k * 14}">${MOON}</i>`)}</div><b>19 min</b><span>less sleep a night on the late side. Over a year that is about ${hours} hours: ${nights} nights of 8 hours.</span><i class="st g">FROM THE PAPER</i></div>
      <div><small>3 \u00b7 MONEY</small><div class="coins">${many(100, k => `<i class="${k >= 97 ? "x" : ""}" style="--d:${k >= 97 ? 140 + (k - 97) * 22 : k}"></i>`)}</div><b>3%</b><span>less income on the late side. That is 3 of every 100 earned.</span><i class="st g">FROM THE PAPER</i></div>
    </div></div>`;
  }

  /* ---------- experiments carousel ---------- */
  const a0 = MLB.all, spr = Object.fromEntries(DST.weeks_spring), sprCtrl = (spr[-2] + spr[-1] + spr[2] + spr[3]) / 4, sprExtra = spr[0] - sprCtrl;
  const CREDIT = [
    { by: "Song, Severini and Allada", yr: 2017, title: "How jet lag impairs Major League Baseball performance", j: "PNAS", url: "https://doi.org/10.1073/pnas.1608847114", mine: "The idea, the method and the finding are theirs. This page repeats their test on public game logs and adds 14 newer seasons. The numbers shown are from that repeat." },
    { by: "Fritz, VoPham, Wright and Vetter", yr: 2020, title: "A chronobiological evaluation of the acute effects of daylight saving time on traffic accident risk", j: "Current Biology", url: "https://doi.org/10.1016/j.cub.2019.12.045", mine: "The idea, the method and the finding are theirs. This page repeats their test on public crash records, with newer years. The numbers shown are from that repeat." },
    { by: "Giuntella and Mazzonna", yr: 2019, title: "Sunset time and the economic effects of social jetlag: evidence from US time zone borders", j: "Journal of Health Economics", url: "https://doi.org/10.1016/j.jhealeco.2019.03.007", mine: "The idea, the method and both findings are theirs. This page does not repeat the study. It only calculates sunset times for two towns." },
  ];
  const EXPS = [
    { card: "Baseball", num: sgn(a0.diff * 100), take: "home runs per 100 games. Teams allow more after flying east than after flying west.", name: "The baseball test", tag: ["d", "REPLICATION"],
      q: "Does jet lag hurt performance? Does the direction of travel matter?",
      how: "The baseball schedule flies teams across time zones all season. The schedule decides who is jet-lagged, not the team. So I compare jet-lagged games with other games, after adjusting for the team, the season and the ballpark.",
      learned: `Direction matters. Pitchers allow about <em>${Math.round(a0.diff * 100)} more home runs per 100 games</em> after flying east than after flying west.`,
      cav: `Against playing in sync: ${sgn(a0.east * 100)} after flying east, ${sgn(a0.west * 100)} after flying west. Each one alone is small enough to be chance. The gap is the firmer result: about ${Math.round(a0.diff * 100)}, with a range of ${Math.round((a0.diff - 1.96 * a0.diff_se) * 100)} to ${Math.round((a0.diff + 1.96 * a0.diff_se) * 100)}. I cannot explain why flying west looks better than staying in sync.`,
      views: [
        { label: "The picture", note: "One dot is one home run allowed per 100 games. Dots are rounded. The gap is small but it is the firm part of the result.", draw: picBall },
        { label: "The result", note: "Bars show the change against playing in sync. More home runs allowed means worse pitching. The thin black lines show the 95% range: the likely range of the true value.", draw: el => chart(el, drawBaseball) },
        { label: "One season", note: `The ${MLB.year} Arizona Diamondbacks. Drag the slider or press play. A game is jet-lagged when the line leaves the white band.`, draw: viewSeason },
        { label: "Paper vs new years", note: "The gap is clearer in the paper's years. In the 14 newer seasons it is smaller and could be chance. The two periods do not differ reliably.", draw: el => chart(el, drawPeriods) },
      ],
      facts: [["Data", `${fmt(MLB.total_games)} games, ${MLB.seasons[0]} to ${MLB.seasons[1]}. Retrosheet game logs.`], ["How I compared", "Jet-lagged games against other games, adjusted for team, season and ballpark."], ["Honest note", "A small effect. My error bars treat each game as independent, so the true range is wider. Paper: Song, Severini and Allada, PNAS 2017."]] },
    { card: "Clock change", num: sgn((DST.us.rr - 1) * 100) + "%", take: "fatal US crashes in the week after clocks spring forward.", name: "The clock change test", tag: ["d", "REPLICATION"],
      q: "Does losing one hour of sleep make the roads more dangerous?",
      how: "Every spring, most of the US loses one hour on the same night. Little else changes that week. So I compare the week after with the weeks around it.",
      learned: `In the week after clocks spring forward, the US has about <em>${Math.round(sprExtra)} more fatal crashes</em> than usual. That is ${f1((DST.us.rr - 1) * 100)}% more.`,
      cav: "In autumn, when people gain an hour, nothing clear happens. This fits lost sleep and darker mornings. It does not prove which one. Most of the rise is between 3 and 9 am.",
      views: [
        { label: "The picture", note: "The usual week is the average of the two weeks before and the second and third weeks after. Cars are rounded to the nearest 10 crashes.", draw: picCars },
        { label: "Spring: hour lost", note: "Crashes rise through spring anyway. So the week after is compared with weeks on both sides (the open circles).", draw: el => chart(el, drawWeeks(DST.weeks_spring, true)) },
        { label: "Autumn: hour gained", note: "The same chart for the autumn change. The week after sits on the usual level.", draw: el => chart(el, drawWeeks(DST.weeks_autumn, false)) },
        { label: "Time of day", note: "Most of the rise is between 3 and 9 am: darker mornings, on less sleep. Midnight to 3 am dips because one of those hours does not exist on the night of the change.", draw: el => chart(el, drawBlocks) },
        { label: "Britain", note: "Since 2007, Britain changes its clocks two to three weeks after the US. Fatal crashes there show no clear rise, but the range is wide. For all injury crashes the range is narrow and shows no rise. Britain does not repeat the US result.", draw: el => chart(el, drawUK) },
      ],
      facts: [["Data", `${fmt(DST.totals.us_fatal)} fatal crashes, ${DST.years[0]} to ${DST.years[1]}. NHTSA FARS. Arizona and Hawaii left out.`], ["How I compared", "The week after, against the two weeks before and weeks 2 and 3 after."], ["Honest note", "The paper found 6%. Fritz and others, Current Biology 2020."]] },
    { card: "Sunset line", num: "−19 min", take: "of sleep a night on the late-sunset side of a time zone border.", name: "The sunset line", tag: ["g", "FROM THE PAPER"],
      q: "Does a later sunset on the clock cost people sleep?",
      how: "At a time zone border, two neighbours get the same sun. But their clocks differ by one hour. So on one side the sun sets an hour later on the clock. Work and school still start at the same clock time.",
      learned: `People on the late-sunset side sleep <em>19 minutes less</em> each night, and earn about 3% less.`,
      cav: `Those two numbers are from the paper. I could not get its survey data. My part is the sunset times. In two towns ${TOWNDIST} miles apart, the clock says sunset is ${SUNGAP} minutes later on the Eastern side.`,
      views: [
        { label: "The picture", note: "Step 1 is calculated here. Steps 2 and 3 are the findings of Giuntella and Mazzonna. The yearly sleep figure is my arithmetic: 19 minutes times 365.", draw: picSunset },
        { label: "Sunset times", note: `${TA.name} and ${TB.name} get almost the same sun. On 21 June the clock says sunset is at ${hm(TA.days[JUN][1])} in ${TA.name.split(",")[0]} and ${hm(TB.days[JUN][1])} in ${TB.name.split(",")[0]}. The jumps in March and November are the clock changes.`, draw: el => {
          el.innerHTML = `<div class="key" style="margin:10px 0 2px"><span><i style="border-color:${C.behind}"></i>${TA.name}: Eastern time</span><span><i style="border-color:${C.ahead}"></i>${TB.name}: Central time</span></div><div id="sunChart"></div>`;
          chart($("sunChart"), drawSunset); } },
        { label: "Two towns", note: `${TA.name} and ${TB.name}. The state border between them is also the time zone border.`, draw: el => chart(el, drawTowns) },
      ],
      facts: [["Data", "The paper used US time-use and health surveys."], ["How they compared", "People living just either side of each US time zone border."], ["Source", "Giuntella and Mazzonna, Journal of Health Economics 2019."]] },
  ];
  const X = { i: 0, v: [0, 0, 0] };
  function renderExp() {
    clearInterval(SEA.timer); SEA.timer = null;
    const ex = EXPS[X.i], vi = X.v[X.i];
    $("exp").innerHTML = `<div class="xcards" role="tablist" aria-label="Experiments">${EXPS.map((e, i) => `<button class="xcard" type="button" role="tab" aria-selected="${i === X.i}" data-i="${i}"><small>EXPERIMENT ${i + 1} · ${e.card.toUpperCase()}</small><small class="by">${CREDIT[i].by}, ${CREDIT[i].yr}</small><b>${e.num}</b><span>${e.take}</span><em class="go">${i === X.i ? "Showing below" : "Open \u203A"}</em></button>`).join("")}</div>
      <div class="frame" id="xframe" tabindex="0" aria-label="Experiment ${X.i + 1} of 3. Use left and right arrow keys to change experiment.">
        <div class="xhead"><div class="xnav"><button type="button" id="xPrev" aria-label="Previous experiment">‹</button><span>Experiment ${X.i + 1} of ${EXPS.length}</span><button type="button" id="xNext" aria-label="Next experiment">›</button></div><span class="st ${ex.tag[0]}">${ex.tag[1]}</span></div>
        <div class="xbody">
          <div class="xtext"><h3>${ex.name}</h3>
            <p class="credit" id="xcredit"><small>THE STUDY</small><a href="${CREDIT[X.i].url}" target="_blank" rel="noopener">${CREDIT[X.i].by} (${CREDIT[X.i].yr}). \u201C${CREDIT[X.i].title}.\u201D ${CREDIT[X.i].j}.</a> ${CREDIT[X.i].mine}</p>
            <dl class="qa" id="xqa"><div><dt>The question</dt><dd>${ex.q}</dd></div><div><dt>The natural experiment</dt><dd>${ex.how}</dd></div></dl>
            <div class="learned"><small>WHAT WE LEARNED</small><p class="big">${ex.learned}</p><p class="cav">${ex.cav}</p></div>
          </div>
          <div class="xviz"><div class="seg" role="group" aria-label="Views">${ex.views.map((v, k) => `<button type="button" data-k="${k}" aria-pressed="${k === vi}">${v.label}</button>`).join("")}</div>
            <div class="xview" id="xview"></div><p class="xnote">${ex.views[vi].note}</p></div>
        </div>
        <div class="xfoot">${ex.facts.map(f => `<div class="fact"><small>${f[0]}</small>${f[1]}</div>`).join("")}</div>
      </div>`;
    ex.views[vi].draw($("xview"));
    $("exp").querySelectorAll(".xcard").forEach(b => b.addEventListener("click", () => setExp(+b.dataset.i)));
    $("exp").querySelectorAll(".seg button").forEach(b => b.addEventListener("click", () => setExp(X.i, +b.dataset.k)));
    $("xPrev").addEventListener("click", () => setExp((X.i + EXPS.length - 1) % EXPS.length)); $("xNext").addEventListener("click", () => setExp((X.i + 1) % EXPS.length));
    $("xframe").addEventListener("keydown", ev => { if (ev.target.tagName === "INPUT") return; if (ev.key === "ArrowRight") { setExp((X.i + 1) % EXPS.length); $("xframe").focus(); } if (ev.key === "ArrowLeft") { setExp((X.i + EXPS.length - 1) % EXPS.length); $("xframe").focus(); } });
  }
  function setExp(i, v) { X.i = i; if (v != null) X.v[i] = v; renderExp(); }

  /* ---------- 03 ten years ---------- */
  function renderSplit() {
    const w = who(), md = S.maxD;
    $("split").innerHTML = `<div class="stat be"><b class="behind">${fmt(S.past)}</b><span>days living in the past. Body behind the clock, after flying east.</span></div>
      <div class="stat ah"><b class="ahead">${fmt(S.fut)}</b><span>days living in the future. Body ahead of the clock, after flying west.</span></div>
      <div class="stat"><b>${fmt(S.streak)}</b><span>days in a row out of sync, ${showSpan(S.streakStart, S.streakEnd)}.</span></div>
      <div class="stat"><b>${hrs(Math.abs(md.gap))} h</b><span>${w.my} biggest gap, ${isMine ? "in " + monthYear(md.ymd) : "on " + longDate(md.ymd)}${md.cause ? ` (${md.cause})` : ""}.</span></div>`;
    $("yearsSub").textContent = `Every day since ${w.my} first logged flight. Above the line, ${w.my} body was ahead of the clock. Below it, behind.`;
  }
  function drawTimeline(svg, W) {
    const days = S.sim.daily, narrow = W < 720, years = [...new Set(days.map(d => d.ymd.slice(0, 4)))];
    const segs = narrow ? years.map(yy => ({ label: yy, days: days.filter(d => d.ymd.startsWith(yy)), x0: E.dayNum(yy + "-01-01"), x1: E.dayNum(yy + "-12-31") + 1 })) : [{ days, x0: days[0].day, x1: days[days.length - 1].day + 1 }];
    const rowH = narrow ? 46 : 250, gapR = narrow ? 8 : 0, top = narrow ? 22 : 8, L = narrow ? 34 : 46, R = 6, H = top + segs.length * (rowH + gapR) + (narrow ? 0 : 22); svg.attr("height", H);
    const maxA = Math.max(6, Math.ceil(d3.max(days, d => Math.abs(d.gap))));
    if (narrow) { T(svg, L, 12, "▲ ahead: the future", { mono: 1, size: 11, fill: C.aheadDeep }); T(svg, W - R, 12, "▼ behind: the past", { mono: 1, size: 11, fill: C.behindDeep, anchor: "end" }); }
    const cursor = svg.append("line").attr("stroke", C.ink).attr("stroke-width", 1).attr("opacity", 0);
    segs.forEach((sg, k) => {
      const y0 = top + k * (rowH + gapR), x = d3.scaleLinear().domain([sg.x0, sg.x1]).range([L, W - R]), y = d3.scaleLinear().domain([-maxA, maxA]).range([y0 + rowH, y0]);
      svg.append("rect").attr("x", L).attr("width", W - R - L).attr("y", y(2)).attr("height", y(-2) - y(2)).attr("fill", C.soft);
      if (!narrow) {
        years.forEach(yy => { const xx = x(E.dayNum(yy + "-01-01")); if (xx >= L) svg.append("line").attr("x1", xx).attr("x2", xx).attr("y1", y0).attr("y2", y0 + rowH).attr("stroke", C.line); T(svg, x(E.dayNum(yy + "-07-01")), y0 + rowH + 16, yy, { mono: 1, size: 11.5, fill: C.muted, anchor: "middle" }); });
        [2, 6, 10].filter(t => t <= maxA).forEach(t => [t, -t].forEach(v => T(svg, L - 6, y(v) + 4, `${t} h`, { mono: 1, size: 11, fill: C.muted, anchor: "end" })));
        [2, -2].forEach(v => svg.append("line").attr("x1", L).attr("x2", W - R).attr("y1", y(v)).attr("y2", y(v)).attr("stroke", C.grey).attr("stroke-dasharray", "3 4"));
        T(svg, L + 8, y0 + 16, "AHEAD: living in the future (flew west)", { mono: 1, size: 11.5, weight: 600, fill: C.aheadDeep }); T(svg, L + 8, y0 + rowH - 8, "BEHIND: living in the past (flew east)", { mono: 1, size: 11.5, weight: 600, fill: C.behindDeep });
      } else T(svg, 0, y(0) + 4, "'" + sg.label.slice(2), { mono: 1, size: 11.5, fill: C.muted });
      const area = f => d3.area().x(d => x(d.day)).y0(y(0)).y1(d => y(f(-d.gap))).curve(d3.curveStepAfter)(sg.days.concat([{ day: sg.days[sg.days.length - 1].day + 1, gap: sg.days[sg.days.length - 1].gap }]));
      svg.append("path").attr("d", area(v => Math.max(0, v))).attr("fill", C.ahead); svg.append("path").attr("d", area(v => Math.min(0, v))).attr("fill", C.behind);
      svg.append("line").attr("x1", L).attr("x2", W - R).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", C.ink).attr("stroke-width", 1);
      const by = new Map(sg.days.map(d => [d.day, d]));
      const move = ev => { const [mx] = d3.pointer(ev.touches ? ev.touches[0] : ev, svg.node()), d = by.get(Math.floor(x.invert(mx))); if (!d) return hideTip(); const mm = Math.abs(d.gap);
        cursor.attr("x1", mx).attr("x2", mx).attr("y1", y0).attr("y2", y0 + rowH).attr("opacity", .5);
        showTip(`<b>${showDate(d.ymd)}</b><br>${mm < 0.05 ? "In sync" : `Body ${f1(mm)} h ${d.gap > 0 ? "behind: in the past" : "ahead: in the future"}`}${d.cause && mm >= 2 ? `<br>${d.cause}` : ""}`, ev); };
      svg.append("rect").attr("x", L).attr("y", y0).attr("width", W - R - L).attr("height", rowH).attr("fill", "transparent").on("mousemove", move).on("touchstart", move).on("touchmove", move).on("mouseleave", () => { hideTip(); cursor.attr("opacity", 0); });
    });
  }
  function renderRings() {
    const days = S.sim.daily, years = [...new Set(days.map(d => d.ymd.slice(0, 4)))], size = 700, c = size / 2, r0 = 92, r1 = 300, rw = (r1 - r0) / years.length;
    const el = $("rings"); el.innerHTML = ""; const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${size} ${size}`).attr("role", "img").attr("aria-label", "Rings: one per year, one tick per day"), g = svg.append("g").attr("transform", `translate(${c},${c})`);
    const yi = new Map(years.map((y, i) => [y, i])), arc = d3.arc();
    g.selectAll("path").data(days).join("path").attr("d", d => { const y = d.ymd.slice(0, 4), doy = E.dayNum(d.ymd) - E.dayNum(y + "-01-01"), len = +y % 4 === 0 ? 366 : 365, ri = r0 + yi.get(y) * rw; return arc({ innerRadius: ri + 1, outerRadius: ri + rw - 1.5, startAngle: doy / len * 2 * Math.PI, endAngle: (doy + 1) / len * 2 * Math.PI + 0.002 }); })
      .attr("fill", d => gapColor(d.gap))
      .on("mousemove", (ev, d) => { const m = Math.abs(d.gap); showTip(`<b>${showDate(d.ymd)}</b><br>${m < 0.05 ? "In sync" : `Body ${f1(m)} h ${d.gap > 0 ? "behind" : "ahead"}`}${d.cause && m >= 2 ? `<br>${d.cause}` : ""}`, ev); }).on("mouseleave", hideTip);
    ["Jan", "Apr", "Jul", "Oct"].forEach((m, i) => { const a = i * Math.PI / 2, rr = r1 + 24; g.append("text").attr("x", Math.sin(a) * rr).attr("y", -Math.cos(a) * rr + 5).attr("text-anchor", "middle").attr("font-family", "var(--mono)").attr("font-size", 18).attr("fill", C.muted).text(m); });
    years.forEach((y, i) => { if (i === 0 || i === years.length - 1) g.append("text").attr("x", -8).attr("text-anchor", "end").attr("y", -(r0 + i * rw + rw / 2) + 5).attr("font-family", "var(--mono)").attr("font-size", 17).attr("font-weight", 600).attr("fill", C.ink).attr("paint-order", "stroke").attr("stroke", "#fff").attr("stroke-width", 5).text(y); });
    g.append("text").attr("text-anchor", "middle").attr("y", 4).attr("font-family", "var(--display)").attr("font-size", 54).attr("font-weight", 800).attr("letter-spacing", "-0.04em").attr("fill", C.ink).text(fmt(S.sum.lagDays));
    g.append("text").attr("text-anchor", "middle").attr("y", 28).attr("font-family", "var(--body)").attr("font-size", 18).attr("fill", C.muted).text("days out of sync");
  }
  function renderWaffle() {
    const lag = S.sim.daily.filter(d => Math.abs(d.gap) >= RULES.threshold && d.cause), groups = d3.rollups(lag, v => v, d => d.cause).sort((a, b) => b[1].length - a[1].length);
    const top = groups.slice(0, 5), rest = groups.slice(5).flatMap(g => g[1]); if (rest.length) top.push(["Every other route", rest]);
    $("waffle").innerHTML = top.map(([k, v]) => `<div class="wg"><div class="gl"><span>${k}</span><span class="mono">${v.length} days</span></div><div class="waffle">${v.slice().sort((a, b) => (b.gap > 0) - (a.gap > 0)).map(d => `<i style="background:${d.gap > 0 ? C.behind : C.ahead}"></i>`).join("")}</div></div>`).join("");
  }
  function renderYears() {
    const lag = S.sim.daily.filter(d => Math.abs(d.gap) >= RULES.threshold), by = d3.rollup(lag, v => [v.filter(d => d.gap > 0).length, v.filter(d => d.gap < 0).length], d => d.ymd.slice(0, 4));
    const all = [...new Set(S.sim.daily.map(d => d.ymd.slice(0, 4)))].map(y => [y, by.get(y) || [0, 0]]), max = d3.max(all, d => d[1][0] + d[1][1]) || 1, el = $("yearsBars");
    el.style.setProperty("--n", all.length);
    el.innerHTML = all.map(([y, [e, w]]) => `<div class="ycol" data-tip="${y}: ${e + w} days. ${e} behind, ${w} ahead."><span class="v">${e + w}</span><div class="b" style="height:${(e + w) / max * 110}px"><i style="flex:${w};background:${C.ahead}"></i><i style="flex:${e};background:${C.behind}"></i></div><span class="y">'${y.slice(2)}</span></div>`).join("");
    el.querySelectorAll("[data-tip]").forEach(n => { n.addEventListener("mousemove", ev => showTip(n.dataset.tip, ev)); n.addEventListener("mouseleave", hideTip); });
  }

  /* ---------- 04 how sure ---------- */
  function renderSens(reset) {
    if (reset) { $("sEast").value = 1; $("sWest").value = 1.5; $("sThr").value = 2; }
    const e = +$("sEast").value, w = +$("sWest").value, t = +$("sThr").value;
    $("vEast").textContent = `${f1(e)} h a day`; $("vWest").textContent = `${f1(w)} h a day`; $("vThr").textContent = `${hrs(t)} h`;
    const sim = E.simulate(S.prep, TODAY, { east: e, west: w, threshold: t });
    $("sensOut").textContent = fmt(sim.lagDays); $("sensSub").textContent = `days, about ${f1(sim.lagDays / 30.44)} months`;
    const maxV = Math.max(600, Math.ceil(S.range[1] * 1.4 / 100) * 100); $("rangeMax").textContent = fmt(maxV);
    $("band").style.left = S.range[0] / maxV * 100 + "%"; $("band").style.width = (S.range[1] - S.range[0]) / maxV * 100 + "%"; $("mark").style.left = Math.min(100, sim.lagDays / maxV * 100) + "%";
    $("sensNote").textContent = `Grey band: ${fmt(S.range[0])} to ${fmt(S.range[1])} days, across the four rule sets I tested. That is ${f1(S.range[0] / 30.44)} to ${f1(S.range[1] / 30.44)} months.`;
  }
  ["sEast", "sWest", "sThr"].forEach(id => $(id).addEventListener("input", () => renderSens(false)));
  $("resetBtn").addEventListener("click", () => renderSens(true));

  /* ---------- 06 under the hood ---------- */
  function renderPipeline() {
    const st = S.prep.stats, s = S.sum;
    const steps = [[fmt(st.rows), "rows in the export", `${st.canceled} canceled and ${st.future} future flights removed`], [fmt(s.flights), "flights flown", "booking codes, seats and notes dropped"], [fmt(s.airports), "airports and time zones", "offset checked on the day of travel"], [fmt(s.journeys), "journeys", "connections under a day apart joined"], [fmt(S.sim.daily.length), "days followed", "one body clock step per day"]];
    $("pipeline").innerHTML = `<div class="pipe">${steps.map(([n, l, sub], i) => `<div class="pstep${i === steps.length - 1 ? " last" : ""}"><div class="n">${n}</div><div class="l">${l}</div><div class="s">${sub}</div></div>`).join("")}</div>`;
  }
  function renderDecode() {
    const j = GH.trip, f = j.flights.reduce((a, b) => Math.abs(b.shift) > Math.abs(a.shift) ? b : a), A = AP[f.from], B = AP[f.to];
    const off = h => "UTC" + (h >= 0 ? "+" : "−") + String(Math.abs(h)).replace(".5", ":30"), x = d3.scaleLinear().domain([-12, 14]).range([10, 470]), xa = x(f.fromOff), xb = x(f.toOff), col = f.shift > 0 ? C.behind : C.ahead;
    let ticks = ""; for (let h = -12; h <= 14; h += 2) ticks += `<line x1="${x(h)}" x2="${x(h)}" y1="30" y2="36" stroke="${C.muted}"/><text x="${x(h)}" y="50" text-anchor="middle" font-size="10" font-family="var(--mono)" fill="${C.muted}">${h > 0 ? "+" : ""}${h}</text>`;
    $("decodeNote").textContent = `${f.from} to ${f.to}, ${monthYear(f.date)}. Each airport becomes a time zone. The rules give the real offset on that date, daylight saving included.`;
    $("decode").innerHTML = `<div class="leg"><span class="code">${f.from}</span><span class="tz">${A[3]}<br>${f.fromTz}</span><span class="off">${off(f.fromOff)}</span></div><div id="decScale" style="margin:6px 0"></div>
      <div class="leg"><span class="code">${f.to}</span><span class="tz">${B[3]}<br>${f.toTz}</span><span class="off">${off(f.toOff)}</span></div>
      <p style="font:13px var(--mono);color:${C.muted};margin:10px 0 0">${fmt(f.miles)} miles \u00b7 ${f1(f.hours)} h gate to gate</p>`;
    chart($("decScale"), (svg, W) => {
      svg.attr("height", 58); const xs = d3.scaleLinear().domain([-12, 14]).range([14, W - 14]), step = W < 420 ? 4 : 2;
      svg.append("line").attr("x1", 14).attr("x2", W - 14).attr("y1", 34).attr("y2", 34).attr("stroke", C.line).attr("stroke-width", 2);
      for (let h = -12; h <= 14; h += step) { svg.append("line").attr("x1", xs(h)).attr("x2", xs(h)).attr("y1", 31).attr("y2", 38).attr("stroke", C.muted); T(svg, xs(h), 54, (h > 0 ? "+" : "") + h, { mono: 1, size: 11, fill: C.muted, anchor: "middle" }); }
      svg.append("line").attr("x1", xs(f.fromOff)).attr("x2", xs(f.toOff)).attr("y1", 22).attr("y2", 22).attr("stroke", col).attr("stroke-width", 4).attr("stroke-linecap", "round");
      svg.append("circle").attr("cx", xs(f.fromOff)).attr("cy", 22).attr("r", 6).attr("fill", "#fff").attr("stroke", C.ink).attr("stroke-width", 2); svg.append("circle").attr("cx", xs(f.toOff)).attr("cy", 22).attr("r", 6).attr("fill", col);
      T(svg, (xs(f.fromOff) + xs(f.toOff)) / 2, 12, `${f.shift > 0 ? "+" : "\u2212"}${Math.abs(f.shift)} h ${f.shift > 0 ? "east" : "west"}`, { mono: 1, size: 12, weight: 600, anchor: "middle" });
    });
  }
  $("realRows").innerHTML = [["Flighty export", "My flights", "This page holds only the date, the two airports and the length of each past flight. No times of day, no flight numbers, no future flights."], ["Airport database", "Airport to place and time zone", "airportsdata, about 7,900 airports."], ["IANA time zone rules", "Offsets on each date", "Built into the browser. Handles daylight saving."],
    ["Retrosheet game logs", "Baseball replication", `${fmt(MLB.total_games)} games, ${MLB.seasons.join(" to ")}.`], ["NHTSA FARS", "US crash replication", `${fmt(DST.totals.us_fatal)} fatal crashes, ${DST.years.join(" to ")}.`], ["DfT STATS19", "UK crash check", `${fmt(DST.totals.uk_all)} injury crashes in Great Britain, ${fmt(DST.totals.uk_fatal)} fatal.`], ["Natural Earth, US Atlas", "Maps", "Public domain."]]
    .map(r => `<div class="rr"><span><b>${r[0]}</b></span><span>${r[1]}</span><span>${r[2]}</span></div>`).join("");
  function renderFooter() {
    const s = S.sum; $("rDate").textContent = longDate(TODAY).toUpperCase();
    $("rcpt").innerHTML = [["Flights replayed", fmt(s.flights)], ["Miles", fmt(s.miles)], ["Days out of sync", fmt(s.lagDays)], ["Published studies repeated", "2 of 3"], ["Crashes and games counted", fmt(DST.totals.us_fatal + DST.totals.uk_all + MLB.total_games)]].map(r => `<div class="row"><span>${r[0]}</span><span>${r[1]}</span></div>`).join("");
  }

  /* ---------- share card ---------- */
  function drawShare() {
    const cv = $("shareCv"), c = cv.getContext("2d"), W = 1080, H = 1350, s = S.sum, w = who(), D = "'Bricolage Grotesque','Arial Black',Arial,sans-serif", M = "'IBM Plex Mono',ui-monospace,Menlo,monospace", Bd = "'IBM Plex Sans','Helvetica Neue',Arial,sans-serif";
    const rr = (x, y, ww, hh, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + ww, y, x + ww, y + hh, r); c.arcTo(x + ww, y + hh, x, y + hh, r); c.arcTo(x, y + hh, x, y, r); c.arcTo(x, y, x + ww, y, r); c.closePath(); };
    const tx = (t, x, y, font, fill, al) => { c.font = font; c.fillStyle = fill; c.textAlign = al || "left"; c.fillText(t, x, y); };
    c.fillStyle = "#F3F0EA"; c.fillRect(0, 0, W, H); rr(36, 36, W - 72, H - 72, 44); c.fillStyle = "#fff"; c.fill(); c.lineWidth = 6; c.strokeStyle = C.ink; c.stroke();
    c.fillStyle = C.behind; c.beginPath(); c.arc(98, 112, 11, 0, 7); c.fill();
    tx("JET LAG LEDGER", 122, 122, `600 28px ${M}`, C.ink); tx(`${monthYear(s.first)} \u2013 ${monthYear(s.last)}`.toUpperCase(), W - 86, 122, `500 26px ${M}`, C.muted, "right");
    tx(`${fmt(s.lagDays)} days`, 80, 330, `800 190px ${D}`, C.ink); tx("out of sync.", 80, 480, `800 150px ${D}`, C.behind);
    tx(`${w.My} body clock was 2 hours or more from the wall clock.`, 86, 548, `400 31px ${Bd}`, C.muted);
    const cx = W / 2, by = 700, bh = 96, mx = Math.max(S.past, S.fut, 1), L = 400;
    const pl = Math.max(30, S.past / mx * L), fl = Math.max(30, S.fut / mx * L);
    rr(cx - pl, by, pl, bh, 18); c.fillStyle = C.behind; c.fill(); rr(cx, by, fl, bh, 18); c.fillStyle = C.ahead; c.fill();
    c.fillStyle = C.behind; c.beginPath(); c.moveTo(cx - pl - 44, by + bh / 2); c.lineTo(cx - pl + 4, by - 14); c.lineTo(cx - pl + 4, by + bh + 14); c.fill();
    c.fillStyle = C.ahead; c.beginPath(); c.moveTo(cx + fl + 44, by + bh / 2); c.lineTo(cx + fl - 4, by - 14); c.lineTo(cx + fl - 4, by + bh + 14); c.fill();
    c.fillStyle = C.ink; c.fillRect(cx - 3, by - 44, 6, bh + 88); tx("NOW", cx, by - 58, `600 24px ${M}`, C.ink, "center");
    tx("\u2190 LIVING IN THE PAST", 86, by - 58, `600 24px ${M}`, C.behindDeep); tx("LIVING IN THE FUTURE \u2192", W - 86, by - 58, `600 24px ${M}`, C.aheadDeep, "right");
    tx(`${fmt(S.past)} days`, 86, by + bh + 92, `800 68px ${D}`, C.behindDeep); tx(`${fmt(S.fut)} days`, W - 86, by + bh + 92, `800 68px ${D}`, C.aheadDeep, "right");
    tx("body behind, after flying east", 86, by + bh + 132, `400 25px ${Bd}`, C.muted); tx("body ahead, after flying west", W - 86, by + bh + 132, `400 25px ${Bd}`, C.muted, "right");
    const d = S.sim.daily, x0 = 86, x1 = W - 86, y0 = 1090, amp = 48, n = d.length;
    c.fillStyle = C.soft; c.fillRect(x0, y0 - 2 * amp / 12 * 2, x1 - x0, 2 * amp / 12 * 4);
    for (let i = 0; i < n; i++) { const g = d[i].gap; if (Math.abs(g) < 0.5) continue; const hh = Math.min(12, Math.abs(g)) / 12 * amp * 2; c.fillStyle = g > 0 ? C.behind : C.ahead; c.fillRect(x0 + i / n * (x1 - x0), g > 0 ? y0 : y0 - hh, Math.max(1, (x1 - x0) / n), hh); }
    c.fillStyle = C.ink; c.fillRect(x0, y0 - 1, x1 - x0, 2);
    tx(`EVERY DAY, ${s.first.slice(0, 4)} TO ${s.last.slice(0, 4)}`, x0, 990, `500 22px ${M}`, C.muted);
    tx(`${fmt(s.flights)} flights \u00b7 ${fmt(s.miles)} miles \u00b7 ${fmt(s.airports)} airports`, x0, 1228, `500 27px ${M}`, C.ink);
    tx("An estimate from a body clock model.", x0, 1272, `400 24px ${Bd}`, C.muted); tx("jetlag.ayushcchoudhary.com", x1, 1272, `600 24px ${M}`, C.ink, "right");
    try { $("shareImg").src = cv.toDataURL("image/png"); } catch (e) {}
  }
  function renderShare() {
    drawShare();
    if (document.fonts && document.fonts.load) Promise.all([document.fonts.load("800 100px 'Bricolage Grotesque'"), document.fonts.load("600 26px 'IBM Plex Mono'"), document.fonts.load("400 30px 'IBM Plex Sans'")]).then(drawShare).catch(() => {});
  }
  const cardBlob = () => new Promise(res => $("shareCv").toBlob(res, "image/png"));
  const HOLD = "Press and hold the card, or right-click it, and save the image.";
  $("shDl").addEventListener("click", async () => {
    const note = $("shNote");
    try {
      const b = await cardBlob();
      const dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null;
      if (dl) {
        try { await dl.save({ filename: "jet-lag-ledger.png", data: b }); note.textContent = "Saved."; }
        catch (e) { note.textContent = e && e.code === "declined" ? "" : HOLD; }
        return;
      }
      const u = URL.createObjectURL(b), l = document.createElement("a"); l.href = u; l.download = "jet-lag-ledger.png"; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
      note.textContent = "If no file appears: " + HOLD.charAt(0).toLowerCase() + HOLD.slice(1);
    } catch (e) { note.textContent = HOLD; }
  });
  (async () => { try { const f = new File([new Blob(["x"])], "a.png", { type: "image/png" }); if (navigator.canShare && navigator.canShare({ files: [f] })) $("shShare").hidden = false; } catch (e) {} })();
  $("shShare").addEventListener("click", async () => {
    try { const b = await cardBlob(); await navigator.share({ files: [new File([b], "jet-lag-ledger.png", { type: "image/png" })], title: "Jet Lag Ledger", text: `${fmt(S.sum.lagDays)} days out of sync.` }); } catch (e) {}
  });

  /* ---------- your file ---------- */
  const drop = $("drop"), mainEl = drop.querySelector(".pass-main"), err = $("err");
  function readFile(file) {
    err.textContent = ""; if (!file) return; const fr = new FileReader();
    fr.onload = () => { try { load(String(fr.result), "Your flights", false); window.scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" }); setTimeout(() => hero.restart(), 500); } catch (e) { err.textContent = e.message; } };
    fr.onerror = () => { err.textContent = "I could not read that file. Try exporting it again."; }; fr.readAsText(file);
  }
  $("file").addEventListener("change", e => readFile(e.target.files[0]));
  document.querySelector('label[for="file"]').addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("file").click(); } });
  ["dragenter", "dragover"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); mainEl.classList.add("over"); }));
  ["dragleave", "drop"].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); mainEl.classList.remove("over"); }));
  drop.addEventListener("drop", e => readFile(e.dataTransfer.files[0]));
  $("backBtn").addEventListener("click", () => { load(window.MY_CSV, "Ayush's flights", true); window.scrollTo({ top: 0 }); });

  /* ---------- the tour ---------- */
  const TOURS = () => { const w = who(), g0 = GH.win, n = g0.filter(d => Math.abs(d.gap) >= 2).length, xs = innerWidth < 900 ? ".xviz" : "#exp"; return [
    { sel: "#replayFrame", cap: `${w.I} flew <em>${fmt(Math.round(S.sum.miles / 1000) * 1000)} miles</em> in ten years.`, dur: 5500, act: () => hero.restart(5000) },
    { sel: "#ticket", cap: `${w.My} body spent <em>${fmt(S.sum.lagDays)} days</em> in the wrong time zone.`, dur: 4500 },
    { sel: "#ghostFrame", cap: `After one flight ${GH.trip.net > 0 ? "east" : "west"}, ${w.my} body needed <em>${n} days</em> to catch up.`, dur: 6500, act: () => ghostPlay(560) },
    { sel: xs, cap: `Baseball (Song and others, 2017): more home runs allowed after flying <em>east</em> than west.`, dur: 6000, act: () => setExp(0, 0) },
    { sel: xs, cap: `Clocks spring forward (Fritz and others, 2020): <em>${f1((DST.us.rr - 1) * 100)}% more</em> fatal crashes.`, dur: 6000, act: () => setExp(1, 0) },
    { sel: xs, cap: `A later sunset (Giuntella and Mazzonna, 2019): <em>19 minutes</em> less sleep, and <em>3%</em> less income, says the paper.`, dur: 6000, act: () => setExp(2, 0) },
    { sel: "#split", also: "#timeline", cap: `Ten years: <em>${fmt(S.past)} days</em> in the past, <em>${fmt(S.fut)}</em> in the future.`, dur: 5500 },
    { sel: "#share", cap: `One card for the whole ten years. <em>Save it or share it.</em>`, dur: 4000 },
    { sel: "#sureOut", cap: `It is an estimate: <em>${Math.round(S.range[0] / 30.44)} to ${Math.round(S.range[1] / 30.44)} months</em>.`, dur: 4000 },
    { sel: "#drop", cap: `Drop in your Flighty file. <em>Get yours.</em>`, dur: 4500 },
  ]; };
  const TR = { on: false, i: 0, steps: [], timer: null, focus: null };
  function tourGo(i) {
    clearTimeout(TR.timer); if (TR.focus) TR.focus.classList.remove("tourfocus");
    if (i >= TR.steps.length) return tourEnd();
    TR.i = i; const st = TR.steps[i]; if (st.act) st.act();
    const el = document.querySelector(st.sel), r = el.getBoundingClientRect(), lead = 190, avail = innerHeight - lead - 20;
    const hgt = st.also ? document.querySelector(st.also).getBoundingClientRect().bottom - r.top : r.height;
    window.scrollTo({ top: r.top + scrollY - lead - (hgt < avail ? (avail - hgt) / 2 : 0), behavior: REDUCED ? "auto" : "smooth" });
    el.classList.add("tourfocus"); TR.focus = el;
    $("capText").innerHTML = st.cap; $("capProg").textContent = `${i + 1}/${TR.steps.length}`; $("caption").classList.add("on");
    if (!REDUCED) TR.timer = setTimeout(() => tourGo(i + 1), st.dur);
  }
  function tourEnd() { clearTimeout(TR.timer); TR.on = false; if (TR.focus) TR.focus.classList.remove("tourfocus"); $("caption").classList.remove("on"); ghostStop(); }
  function tourStart() { TR.steps = TOURS(); TR.on = true; tourGo(0); }
  $("tourBtn").addEventListener("click", tourStart); $("againBtn").addEventListener("click", tourStart);
  $("capNext").addEventListener("click", () => tourGo(TR.i + 1)); $("capX").addEventListener("click", tourEnd);
  document.addEventListener("keydown", ev => { if (TR.on && ev.key === "Escape") tourEnd(); });

  /* ---------- nav highlight ---------- */
  if ("IntersectionObserver" in window) {
    const links = [...document.querySelectorAll(".steps-nav a")];
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) links.forEach(a => a.classList.toggle("on", a.dataset.s === e.target.id)); }), { rootMargin: "-40% 0px -55% 0px" });
    document.querySelectorAll("section.act").forEach(s => io.observe(s));
  }

  load(window.MY_CSV, "Ayush's flights", true);
  renderExp();
  if (!REDUCED) setTimeout(() => hero.restart(), 700);
})();
