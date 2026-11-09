/* Jet Lag Ledger engine. Runs in the browser and in Node (for tests).
   Input: Flighty CSV text + an airport table. Output: totals, daily body-clock gap,
   journeys, routes. Model: body clock moves toward local time each day, 1 h/day
   after flying east and 1.5 h/day after flying west. A day is "jet-lagged" when the
   gap is 2 h or more. These are rules of thumb, so the page shows a range. */
(function (root) {
  "use strict";

  function parseCSV(text) {
    const rows = []; let row = [], f = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { f += '"'; i++; }
        else if (c === '"') q = false; else f += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(f); f = ""; if (row.some(x => x !== "")) rows.push(row); row = [];
      } else f += c;
    }
    if (f !== "" || row.length) { row.push(f); if (row.some(x => x !== "")) rows.push(row); }
    if (!rows.length) return [];
    const head = rows[0].map(h => h.trim());
    return rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
  }

  const offCache = new Map();
  function offsetHours(tz, ymd) {
    const k = tz + ymd; if (offCache.has(k)) return offCache.get(k);
    const [y, m, d] = ymd.split("-").map(Number);
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" });
    const name = fmt.formatToParts(new Date(Date.UTC(y, m - 1, d, 12))).find(p => p.type === "timeZoneName").value;
    const mm = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    const v = mm ? (mm[1] === "-" ? -1 : 1) * (Number(mm[2]) + Number(mm[3] || 0) / 60) : 0;
    offCache.set(k, v); return v;
  }

  const toRad = x => x * Math.PI / 180;
  function miles(a, b) {
    const h = Math.sin(toRad(b[0] - a[0]) / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(toRad(b[1] - a[1]) / 2) ** 2;
    return 2 * 3958.8 * Math.asin(Math.sqrt(h));
  }
  const wrap = x => ((x + 12) % 24 + 24) % 24 - 12;
  const dayNum = ymd => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 864e5;
  const ymdOf = n => new Date(n * 864e5).toISOString().slice(0, 10);

  function localToUtcMs(s, tz) {
    if (!s) return null;
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/); if (!m) return null;
    const off = offsetHours(tz, `${m[1]}-${m[2]}-${m[3]}`);
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - off * 36e5;
  }

  function prepare(rows, AP, today) {
    const stats = { rows: rows.length, canceled: 0, future: 0, unknown: 0, unknownCodes: new Set(), estimatedHours: 0 };
    const keep = [];
    for (const r of rows) {
      if (!r.Date || !r.From || !r.To) { stats.unknown++; continue; }
      if (String(r.Canceled).toLowerCase() === "true") { stats.canceled++; continue; }
      if (r.Date.slice(0, 10) > today) { stats.future++; continue; }
      if (!AP[r.From] || !AP[r.To]) { stats.unknown++; [r.From, r.To].forEach(c => { if (!AP[c]) stats.unknownCodes.add(c); }); continue; }
      keep.push(r);
    }
    keep.sort((a, b) => (a.Date + (a["Gate Departure (Scheduled)"] || "")).localeCompare(b.Date + (b["Gate Departure (Scheduled)"] || "")));
    const flights = keep.map(r => {
      const d = r.Date.slice(0, 10), A = AP[r.From], B = AP[r.To];
      const mi = miles(A, B);
      const dep = localToUtcMs(r["Gate Departure (Actual)"] || r["Gate Departure (Scheduled)"], A[2]);
      const arr = localToUtcMs(r["Gate Arrival (Actual)"] || r["Gate Arrival (Scheduled)"], B[2]);
      const est = mi / 500 + 0.5; let hrs = est, estimated = true;
      if (dep !== null && arr !== null) {
        const h = (arr - dep) / 36e5;
        if (h > 0.4 && h < 22 && Math.abs(h - est) < Math.max(3, est * 0.6)) { hrs = h; estimated = false; }
      }
      const given = parseFloat(r.Hours); if (given > 0.2 && given < 24) { hrs = given; estimated = false; }   // a file that carries only the flight length
      if (estimated) stats.estimatedHours++;
      const shift = wrap(offsetHours(B[2], d) - offsetHours(A[2], d));
      return { date: d, day: dayNum(d), from: r.From, to: r.To, miles: mi, hours: hrs, shift,
               fromTz: A[2], toTz: B[2], fromOff: offsetHours(A[2], d), toOff: offsetHours(B[2], d),
               airline: r.Airline, flight: r.Flight, raw: r };
    });
    // journeys: flights at most one day apart
    const journeys = [];
    flights.forEach(f => {
      const j = journeys[journeys.length - 1];
      if (j && f.day - j.flights[j.flights.length - 1].day <= 1) j.flights.push(f);
      else journeys.push({ flights: [f] });
    });
    journeys.forEach((j, i) => {
      const a = j.flights[0], b = j.flights[j.flights.length - 1];
      j.id = i; j.start = a.day; j.end = b.day;
      j.net = wrap(offsetHours(AP[b.to][2], b.date) - offsetHours(AP[a.from][2], a.date));
      j.fromCity = AP[a.from][3]; j.toCity = AP[b.to][3];
      j.route = [a.from, ...j.flights.map(f => f.to)].join("-");
      j.pair = [j.fromCity, j.toCity].sort().join(" ↔ ");
      j.miles = j.flights.reduce((s, f) => s + f.miles, 0);
    });
    stats.flights = flights.length;
    stats.airports = new Set(flights.flatMap(f => [f.from, f.to])).size;
    stats.journeys = journeys.length;
    return { flights, journeys, stats };
  }

  const OFFC = new Map();
  function offCached(tz, ymd) { const k = tz + "|" + ymd; let v = OFFC.get(k); if (v === undefined) { v = offsetHours(tz, ymd); OFFC.set(k, v); } return v; }
  // Day-by-day body clock. Pure in the rates, so sliders can re-run it fast.
  function simulate(prep, today, opt) {
    const { flights, journeys } = prep; if (!flights.length) return null;
    const east = opt.east, west = opt.west, thr = opt.threshold;
    const byDay = new Map(); flights.forEach(f => { if (!byDay.has(f.day)) byDay.set(f.day, []); byDay.get(f.day).push(f); });
    const jOf = new Map(); journeys.forEach(j => j.flights.forEach(f => jOf.set(f, j)));
    const start = flights[0].day, end = dayNum(today);
    // The local offset is read again every day, so a daylight saving change at the place I am in is counted too.
    let tz = flights[0].fromTz, local = flights[0].fromOff, body = local, cause = null;
    const daily = []; let lagDays = 0, hourDays = 0;
    const routeDays = new Map(), yearDays = new Map();
    for (let d = start; d <= end; d++) {
      const ymd = ymdOf(d);
      for (const f of byDay.get(d) || []) { tz = f.toTz; cause = jOf.get(f); }
      local = offCached(tz, ymd);
      const gap = wrap(local - body), mag = Math.abs(gap);
      daily.push({ day: d, ymd, gap, local, body, cause: cause ? cause.pair : null });
      hourDays += mag;
      const y = ymd.slice(0, 4);
      if (!yearDays.has(y)) yearDays.set(y, 0);
      if (mag >= thr) {
        lagDays++; yearDays.set(y, yearDays.get(y) + 1);
        if (cause) routeDays.set(cause.pair, (routeDays.get(cause.pair) || 0) + 1);
      }
      const step = gap > 0 ? east : west;
      body += Math.max(-step, Math.min(step, gap));
    }
    return { daily, lagDays, hourDays, routeDays, yearDays };
  }

  function summarize(prep, sim) {
    const f = prep.flights;
    return {
      flights: f.length, miles: f.reduce((s, x) => s + x.miles, 0), hours: f.reduce((s, x) => s + x.hours, 0),
      east: f.reduce((s, x) => s + Math.max(0, x.shift), 0), west: f.reduce((s, x) => s + Math.max(0, -x.shift), 0),
      airports: prep.stats.airports, journeys: prep.journeys.length,
      bigJourneys: prep.journeys.filter(j => Math.abs(j.net) >= 3).length,
      first: f[0].date, last: f[f.length - 1].date,
      lagDays: sim.lagDays, hourDays: sim.hourDays,
    };
  }

  const api = { parseCSV, offsetHours, prepare, simulate, summarize, wrap, dayNum, ymdOf };
  if (typeof module !== "undefined") module.exports = api; else root.JLL = api;
})(typeof window !== "undefined" ? window : globalThis);
