/* Informed Vote NZ — renders everything from the JSON files in /data.
   No tracking, no cookies, no storage of personal data. */
(function () {
  "use strict";

  var POLL_NAMES = { NAT: "National", LAB: "Labour", GRN: "Green", ACT: "ACT", NZF: "NZ First", TPM: "Te Pāti Māori", OPP: "Opportunity" };
  var DAY = 86400000;

  function el(tag, attrs, children) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") n.textContent = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function playIcon() {
    var svg = svgEl("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", "class": "play" });
    svg.appendChild(svgEl("circle", { cx: 12, cy: 12, r: 11 }));
    svg.appendChild(svgEl("path", { d: "M10 8l6 4-6 4z" }));
    return svg;
  }
  function svgEl(tag, attrs) {
    var n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  // Today's date in New Zealand, as YYYY-MM-DD, whatever the visitor's time zone.
  function nzToday() {
    var parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    return parts; // en-CA formats as YYYY-MM-DD
  }
  function toDate(iso) { var p = iso.split("-"); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function fmtDate(iso, opts) {
    return new Intl.DateTimeFormat("en-NZ", Object.assign({ timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }, opts || {})).format(new Date(toDate(iso)));
  }
  // "Checked" dates always show day, short month and year, e.g. "16 Oct 2026".
  function fmtChecked(iso) { return new Intl.DateTimeFormat("en-NZ", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }).format(new Date(toDate(iso))); }
  var GLOSS_RE = null, GLOSS_MAP = {};
  function setGlossary(g) {
    var keys = [];
    g.terms.forEach(function (t) {
      [t.term].concat(t.aliases || []).forEach(function (k) { GLOSS_MAP[k.toLowerCase()] = t; keys.push(k); });
    });
    keys.sort(function (a, b) { return b.length - a.length; });
    var esc = keys.map(function (k) { return k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); });
    GLOSS_RE = new RegExp("(^|[^\\p{L}])(" + esc.join("|") + ")(?![\\p{L}])", "giu");
  }
  // One shared pop-up for glossary words: shows on hover or focus, and on tap for phones.
  var tip = null, tipFor = null, hideTimer = null;
  function hideTip() {
    clearTimeout(hideTimer);
    if (!tip) return;
    tip.hidden = true;
    if (tipFor) { tipFor.setAttribute("aria-expanded", "false"); tipFor.removeAttribute("aria-describedby"); tipFor = null; }
  }
  function laterHide() { clearTimeout(hideTimer); hideTimer = setTimeout(hideTip, 250); }
  function showTip(b, t) {
    clearTimeout(hideTimer);
    if (!tip) {
      tip = el("div", { "class": "tip", id: "term-tip", role: "tooltip", hidden: "" });
      document.body.appendChild(tip);
      tip.addEventListener("mouseenter", function () { clearTimeout(hideTimer); });
      tip.addEventListener("mouseleave", laterHide);
      document.addEventListener("click", function (e) { if (!e.target.closest(".term, .tip")) hideTip(); });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") hideTip(); });
      window.addEventListener("resize", hideTip);
    }
    if (tipFor && tipFor !== b) { tipFor.setAttribute("aria-expanded", "false"); tipFor.removeAttribute("aria-describedby"); }
    tip.innerHTML = "";
    tip.appendChild(el("strong", { text: t.term + ": " }));
    tip.appendChild(document.createTextNode(t.def + " "));
    tip.appendChild(el("a", { href: t.src, text: "Learn more" }));
    tip.hidden = false;
    tipFor = b; b.setAttribute("aria-expanded", "true"); b.setAttribute("aria-describedby", "term-tip");
    var r = b.getBoundingClientRect(), vw = document.documentElement.clientWidth;
    var left = Math.max(8, Math.min(r.left, vw - tip.offsetWidth - 8));
    tip.style.left = (left + window.scrollX) + "px";
    tip.style.top = (r.bottom + window.scrollY + 6) + "px";
  }
  // Wrap glossary words in a quote (same rule for every party).
  function annotate(text) {
    var frag = document.createDocumentFragment();
    if (!GLOSS_RE) { frag.appendChild(document.createTextNode(text)); return frag; }
    var last = 0, seen = {}, m;
    GLOSS_RE.lastIndex = 0;
    while ((m = GLOSS_RE.exec(text))) {
      var word = m[2], start = m.index + m[1].length, t = GLOSS_MAP[word.toLowerCase()];
      if (!t || seen[t.term]) continue;
      seen[t.term] = true;
      frag.appendChild(document.createTextNode(text.slice(last, start)));
      (function (t, word) {
        var b = el("button", { type: "button", "class": "term", "aria-expanded": "false", text: word });
        b.addEventListener("mouseenter", function () { showTip(b, t); });
        b.addEventListener("mouseleave", laterHide);
        b.addEventListener("focus", function () { showTip(b, t); });
        b.addEventListener("blur", function (e) { if (!(e.relatedTarget && tip && tip.contains(e.relatedTarget))) laterHide(); });
        b.addEventListener("click", function () { showTip(b, t); });
        frag.appendChild(b);
      })(t, word);
      last = start + word.length;
    }
    frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }
  // Mark te reo Māori words and names so screen readers pronounce them correctly.
  var MI_WORDS = ["Te Pāti Māori", "Te Tai Tokerau", "Te Tai Tonga", "Te Tai Hauāuru", "Ikaroa-Rāwhiti", "Tāmaki Makaurau", "Hauraki-Waikato", "Waiariki",
    "Whakaata Māori", "MĀORI+", "Whakatau", "Anamata", "Te Ao Mārama", "Te Ao Māori", "Te Ao", "Kāinga Ora", "Te Tiriti o Waitangi", "Te Tiriti", "te reo Māori", "te reo",
    "Aotearoa", "Māori", "whānau", "kaumātua", "mātauranga", "rangatahi", "kaupapa", "tikanga", "tangata whenua", "mana whenua", "mana motuhake", "whenua",
    "marae", "iwi", "hapū", "kai", "kaitiaki", "moana", "mokopuna", "Waitangi", "Pōneke", "Wheako"];
  var MI_RE = new RegExp("(^|[^\\p{L}])(" + MI_WORDS.slice().sort(function (a, b) { return b.length - a.length; }).map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join("|") + ")(?![\\p{L}])", "gu");
  function markTeReo(root) {
    if (!root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: function (n) {
      var p = n.parentElement;
      if (!p || p.closest("script, style, svg, [lang=mi]")) return NodeFilter.FILTER_REJECT;
      MI_RE.lastIndex = 0;
      return MI_RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    } });
    var nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (n) {
      var text = n.nodeValue, frag = document.createDocumentFragment(), last = 0, m;
      MI_RE.lastIndex = 0;
      while ((m = MI_RE.exec(text))) {
        var start = m.index + m[1].length;
        frag.appendChild(document.createTextNode(text.slice(last, start)));
        frag.appendChild(el("span", { lang: "mi", text: m[2] }));
        last = start + m[2].length;
      }
      frag.appendChild(document.createTextNode(text.slice(last)));
      // In flex or grid boxes, keep the text together as one item.
      var disp = getComputedStyle(n.parentNode).display;
      if (/flex|grid/.test(disp)) { var w = el("span"); w.appendChild(frag); frag = w; }
      n.parentNode.replaceChild(frag, n);
    });
  }
  // Show the first item and fold the rest behind a "Show more" button (same rule for every party).
  function foldExtras(box, extras, noun, count) {
    if (!extras.length) return;
    count = count || extras.length;
    extras.forEach(function (x) { x.hidden = true; });
    var btn = el("button", { type: "button", "class": "show-more", "aria-expanded": "false" });
    function label(open) { btn.textContent = open ? "Show less" : "Show " + count + " more " + noun + (count > 1 ? "s" : ""); }
    label(false);
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") !== "true";
      extras.forEach(function (x) { x.hidden = !open; });
      btn.setAttribute("aria-expanded", String(open)); label(open);
      if (!open) box.scrollIntoView({ block: "nearest" });
    });
    box.appendChild(btn);
  }
  function getJSON(path) { return fetch(path, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(path); return r.json(); }); }
  function fail(container, what) {
    container.appendChild(el("p", { "class": "error", text: "The " + what + " couldn't load. Refresh the page to try again." }));
  }

  var today = nzToday();
  // Same random party order for polls and policies during one visit.
  var partyOrder = null;
  var pollAverage = null;
  var PARTY_CODE = { "ACT": "ACT", "Green": "GRN", "Labour": "LAB", "National": "NAT", "NZ First": "NZF", "Opportunity": "OPP", "Te Pāti Māori": "TPM", "Te Tai Tokerau Party": "TTT" };

  /* ---------- Dates ---------- */
  function renderDates(data) {
    // Countdowns: full days left before each date (today and the date itself not counted).
    var cds = document.getElementById("countdowns");
    [["Advance voting opens", "2026-10-26", "2026-11-06", "Advance voting is open"],
     ["Election day", "2026-11-07", null, "Today is election day"],
     ["Official results", "2026-11-27", null, "Official results today"]].forEach(function (c, i) {
      var d = Math.round((toDate(c[1]) - toDate(today)) / DAY), big, small;
      if (d > 1) { big = String(d - 1); small = (d - 1 === 1 ? "day" : "days") + " to go"; }
      else if (d === 1) { big = "Tomorrow"; small = ""; }
      else if (d === 0) { big = "Today"; small = ""; }
      else if (c[2] && today <= c[2]) { big = "Open now"; small = "until " + fmtDate(c[2], { weekday: undefined }); }
      else { big = "Done"; small = ""; }
      cds.appendChild(el("li", { "class": i === 1 ? "main" : "" }, [
        el("span", { "class": "cd-label", text: c[0] }),
        el("span", { "class": "cd-num" }, [el("span", { "class": "cd-big", text: big }), small ? el("span", { "class": "cd-small", text: small }) : null]),
        el("span", { "class": "cd-date", text: fmtDate(c[1], { weekday: undefined }) })
      ]));
    });

    var list = document.getElementById("timeline");
    var next = null, markerPlaced = false;
    data.dates.forEach(function (d) {
      var state = d.date < today ? "past" : (d.date === today ? "next" : "future");
      if (!markerPlaced && d.date > today) {
        list.appendChild(el("li", { "class": "today-marker", text: "Today, " + fmtDate(today, { weekday: undefined }) }));
        markerPlaced = true;
      }
      if (!next && d.date >= today) { next = d; state = "next"; }
      var when = el("span", { "class": "when" }, [el("span", { "class": "w-long", text: fmtDate(d.date) }), el("span", { "class": "w-short", text: fmtDate(d.date, { weekday: "short", month: "short" }) })]);
      if (state === "next") when.appendChild(el("span", { "class": "badge", text: d.date === today ? "Today" : "Next" }));
      list.appendChild(el("li", { "class": state }, [when, el("span", { text: d.label })]));
    });
    var ns = document.getElementById("next-step");
    if (today <= "2026-10-25") {
      ns.innerHTML = "<strong>Check you're enrolled by Sunday 25 October.</strong> You can't enrol once voting starts. Enrol, check your details and find where to vote at <a href=\"https://vote.nz/\">vote.nz</a>, the Electoral Commission's site.";
    } else if (today <= "2026-11-06") {
      ns.innerHTML = "<strong>Voting is open.</strong> You can vote early at any voting place until election day. Find one at <a href=\"https://vote.nz/\">vote.nz</a>.";
    } else if (today === "2026-11-07") {
      ns.innerHTML = "<strong>Voting places are open 9am to 7pm today.</strong> Find one at <a href=\"https://vote.nz/\">vote.nz</a>, the Electoral Commission's official site.";
    } else {
      ns.innerHTML = "Preliminary results are on <a href=\"https://www.electionresults.govt.nz/\">electionresults.govt.nz</a>. Official results are declared on 27 November.";
    }
  }

  /* ---------- Enrolment (official Electoral Commission figures) ---------- */
  function renderEnrolment(e) {
    var box = document.getElementById("enrolment");
    if (!box || !e) return;
    if (today > "2026-10-25") { box.remove(); return; }
    var pct = e.percent;
    box.appendChild(el("p", { "class": "enrol-head" }, [el("strong", { text: pct.toFixed(2) + "% of eligible people are enrolled." }),
      " That leaves an estimated " + e.not_enrolled.toLocaleString("en-NZ") + " people not yet enrolled."]));
    box.appendChild(el("div", { "class": "enrol-bar", role: "img", "aria-label": pct.toFixed(2) + " percent enrolled" }, [el("span", { style: "width:" + pct + "%" })]));
    box.appendChild(el("p", { "class": "enrol-src" }, [e.enrolled.toLocaleString("en-NZ") + " enrolled of about " + e.eligible.toLocaleString("en-NZ") + " eligible, as at " + fmtChecked(e.as_at) + ". ",
      el("a", { href: e.source, text: "Electoral Commission figures" }), ". Checked " + fmtChecked(e.checked) + "."]));
  }

  /* ---------- Polls ---------- */
  function renderPolls(data) {
    var wrap = document.getElementById("poll-charts");
    var detail = document.getElementById("poll-detail");
    var polls = data.polls.slice().sort(function (a, b) { return a.end < b.end ? -1 : 1; });
    var x0 = toDate("2026-08-01"), x1 = Math.max(toDate(today), toDate(polls[polls.length - 1].end));
    var yMax = 35;
    var W = 320, H = 96, L = 24, R = 6, T = 6, B = 18;
    function sx(t) { return L + (t - x0) / (x1 - x0) * (W - L - R); }
    function sy(v) { return T + (1 - v / yMax) * (H - T - B); }

    var codes = Object.keys(POLL_NAMES);
    function trailing(code) {
      var pts = polls.filter(function (p) { return p[code] !== null && p[code] !== undefined; });
      return pts.map(function (p) {
        var t = toDate(p.end);
        var win = pts.filter(function (q) { var u = toDate(q.end); return u <= t && u > t - 14 * DAY; });
        // Weighted by sample size (1,000 assumed if a poll doesn't report one).
        var w = win.reduce(function (s, q) { return s + (q.sample || 1000); }, 0);
        return { t: t, v: win.reduce(function (s, q) { return s + q[code] * (q.sample || 1000); }, 0) / w, n: win.length };
      });
    }
    var latest = {};
    codes.forEach(function (c) { var a = trailing(c); latest[c] = a[a.length - 1]; });
    pollAverage = {}; codes.forEach(function (c) { pollAverage[c] = Math.round(latest[c].v * 10) / 10; });
    // Data order: highest current average first.
    var order = codes.slice().sort(function (a, b) { return latest[b].v - latest[a].v; });

    var summary = document.getElementById("poll-summary");
    var sMax = 40;
    order.forEach(function (c) {
      var v = latest[c].v;
      summary.appendChild(el("div", { "class": "bar-row", role: "img", "aria-label": POLL_NAMES[c] + ": " + v.toFixed(1) + " percent" }, [
        el("span", { "class": "bar-name", text: POLL_NAMES[c] }),
        el("span", { "class": "bar-track" }, [
          el("span", { "class": "bar-fill p", style: "--pc:var(--p-" + c + ");width:" + (v / sMax * 100).toFixed(2) + "%" }),
          el("span", { "class": "bar-thr", style: "left:" + (5 / sMax * 100) + "%" })
        ]),
        el("span", { "class": "bar-val", text: v.toFixed(1) + "%" })
      ]));
    });
    var newest = polls[polls.length - 1];
    summary.appendChild(el("p", { "class": "bar-foot" }, [
      el("span", { text: "Dashed line: 5% threshold" }),
      el("span", null, ["Most recent poll in this average: ", el("a", { href: newest.source, text: newest.pollster }), ", ends " + fmtDate(newest.end, { weekday: undefined }) + (data.checked ? ". Checked " + fmtChecked(data.checked) : "")])
    ]));

    // One chart, every party: dots are single polls, lines are 14-day averages.
    // Size the drawing to the box, so text stays readable on phones.
    var CW = Math.round(Math.max(300, Math.min(760, (wrap.clientWidth || 640) - 28))), CH = CW < 520 ? 300 : 340, CL = 34, CR = 12, CT = 10, CB = 26, cMax = 35;
    function cx(t) { return CL + (t - x0) / (x1 - x0) * (CW - CL - CR); }
    function cy(v) { return CT + (1 - v / cMax) * (CH - CT - CB); }
    var avgs = {}; order.forEach(function (c) { avgs[c] = trailing(c); });
    function avgAt(c, t) { var a = avgs[c].filter(function (x) { return x.t <= t; }); return a.length ? a[a.length - 1].v : null; }
    var chart = svgEl("svg", { viewBox: "0 0 " + CW + " " + CH, role: "img",
      "aria-label": "Party vote in nationwide polls since August, with each party's 14-day average. Latest averages: " + order.map(function (c) { return POLL_NAMES[c] + " " + latest[c].v.toFixed(1) + "%"; }).join(", ") + ". Every figure is in the table below." });
    [0, 10, 20, 30].forEach(function (g) {
      chart.appendChild(svgEl("line", { "class": "grid", x1: CL, x2: CW - CR, y1: cy(g), y2: cy(g) }));
      var t = svgEl("text", { "class": "axis", x: CL - 6, y: cy(g) + 4, "text-anchor": "end" }); t.textContent = g + "%"; chart.appendChild(t);
    });
    chart.appendChild(svgEl("line", { "class": "thr", x1: CL, x2: CW - CR, y1: cy(5), y2: cy(5) }));
    var t5 = svgEl("text", { "class": "axis", x: CL - 6, y: cy(5) + 4, "text-anchor": "end" }); t5.textContent = "5%"; chart.appendChild(t5);
    [["2026-08-01", "Aug"], ["2026-09-01", "Sep"], ["2026-10-01", "Oct"], ["2026-11-01", "Nov"]].forEach(function (m) {
      var t = toDate(m[0]); if (t > x1) return;
      var a = svgEl("text", { "class": "axis", x: cx(t), y: CH - 6, "text-anchor": t === x0 ? "start" : "middle" }); a.textContent = m[1]; chart.appendChild(a);
    });
    var groups = {};
    order.slice().reverse().forEach(function (c) {
      var g = svgEl("g", { style: "--pc:var(--p-" + c + ")" });
      polls.forEach(function (p) { if (p[c] !== null && p[c] !== undefined) g.appendChild(svgEl("circle", { "class": "pdot", cx: cx(toDate(p.end)), cy: cy(p[c]), r: 3.5 })); });
      g.appendChild(svgEl("path", { "class": "line", d: avgs[c].map(function (a, i) { return (i ? "L" : "M") + cx(a.t).toFixed(1) + "," + cy(a.v).toFixed(1); }).join("") }));
      groups[c] = g; chart.appendChild(g);
    });
    var cross = svgEl("line", { "class": "cross", y1: CT, y2: CH - CB, hidden: "" });
    chart.appendChild(cross);

    var legend = el("ul", { "class": "trend-legend", "aria-label": "Highlight a party" });
    var focused = null;
    order.forEach(function (c) {
      var b = el("button", { type: "button", "aria-pressed": "false", style: "--pc:var(--p-" + c + ")" }, [el("span", { "class": "sw" }), POLL_NAMES[c]]);
      b.addEventListener("click", function () {
        focused = focused === c ? null : c;
        legend.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        Object.keys(groups).forEach(function (k) { groups[k].classList.toggle("on", k === focused); });
        wrap.classList.toggle("focus", !!focused);
        if (focused) b.setAttribute("aria-pressed", "true");
      });
      legend.appendChild(el("li", null, [b]));
    });
    var tip = el("div", { "class": "trend-tip", hidden: "" });
    var ends = polls.map(function (p) { return toDate(p.end); }).filter(function (t, i, a) { return a.indexOf(t) === i; });
    function showAt(clientX) {
      var r = chart.getBoundingClientRect();
      var vx = (clientX - r.left) / r.width * CW;
      var t = ends.reduce(function (best, e) { return Math.abs(cx(e) - vx) < Math.abs(cx(best) - vx) ? e : best; }, ends[0]);
      var x = cx(t);
      cross.setAttribute("x1", x); cross.setAttribute("x2", x); cross.removeAttribute("hidden");
      var iso = new Date(t).toISOString().slice(0, 10);
      var rows = order.map(function (c) { return [c, avgAt(c, t)]; }).filter(function (r) { return r[1] !== null; }).sort(function (a, b) { return b[1] - a[1]; });
      tip.innerHTML = "";
      tip.appendChild(el("strong", { text: "14-day average, " + fmtDate(iso, { weekday: undefined }) }));
      var ol = el("ol");
      rows.forEach(function (r) { ol.appendChild(el("li", { style: "--pc:var(--p-" + r[0] + ")" }, [el("span", null, [el("span", { "class": "sw" }), POLL_NAMES[r[0]]]), el("b", { text: r[1].toFixed(1) + "%" })])); });
      tip.appendChild(ol);
      tip.hidden = false;
      var px = x / CW * r.width, wr = wrap.getBoundingClientRect();
      var left = px + (r.left - wr.left) + 12;
      if (left + tip.offsetWidth > wr.width - 8) left = px + (r.left - wr.left) - tip.offsetWidth - 12;
      tip.style.left = Math.max(8, left) + "px";
      var ended = polls.filter(function (p) { return p.end === iso; });
      detail.innerHTML = "";
      detail.appendChild(el("span", null, [el("strong", { text: "Polls ending " + fmtDate(iso, { weekday: undefined }) + ": " })].concat(
        ended.reduce(function (acc, p, i) { if (i) acc.push("; "); acc.push(el("a", { href: p.source, text: p.pollster }), " (" + p.fieldwork + (p.commissioned_by ? ". " + p.commissioned_by : "") + ")"); return acc; }, []))));
    }
    function hide() { tip.hidden = true; cross.setAttribute("hidden", ""); }
    // Keyboard: focus the chart, then use the left and right arrow keys to step through poll dates.
    chart.setAttribute("tabindex", "0");
    chart.setAttribute("aria-describedby", "poll-detail");
    var kIdx = ends.length - 1;
    function showIdx(i) { kIdx = Math.max(0, Math.min(ends.length - 1, i)); var r = chart.getBoundingClientRect(); showAt(r.left + cx(ends[kIdx]) / CW * r.width); }
    chart.addEventListener("focus", function () { showIdx(kIdx); });
    chart.addEventListener("blur", hide);
    chart.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { e.preventDefault(); showIdx(kIdx - 1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); showIdx(kIdx + 1); }
      else if (e.key === "Home") { e.preventDefault(); showIdx(0); }
      else if (e.key === "End") { e.preventDefault(); showIdx(ends.length - 1); }
      else if (e.key === "Escape") hide();
    });
    chart.addEventListener("pointermove", function (e) { showAt(e.clientX); });
    chart.addEventListener("pointerdown", function (e) { showAt(e.clientX); });
    chart.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") hide(); });
    document.addEventListener("pointerdown", function (e) { if (!wrap.contains(e.target)) hide(); });
    wrap.appendChild(legend); wrap.appendChild(chart); wrap.appendChild(tip);
    detail.textContent = "Point to or tap the chart (or use the arrow keys) to see the figures for a date and the polls that ended that day.";
    wrap.insertAdjacentElement("afterend", el("p", { "class": "lede", text: "Te Tai Tokerau Party isn't reported separately in most polls, so it isn't in these charts." }));

    var table = document.getElementById("poll-table");
    var head = el("tr", null, [el("th", { text: "Poll" }), el("th", { text: "Fieldwork" }), el("th", { text: "Commissioned by" })].concat(order.map(function (c) { return el("th", { text: POLL_NAMES[c] }); })));
    table.appendChild(el("thead", null, [head]));
    var body = el("tbody");
    polls.slice().reverse().forEach(function (p) {
      body.appendChild(el("tr", null, [el("td", null, [el("a", { href: p.source, text: p.pollster })]), el("td", { text: p.fieldwork }), el("td", { "class": "who", text: p.commissioned_by || "" })]
        .concat(order.map(function (c) { return el("td", { text: p[c] === null || p[c] === undefined ? "–" : String(p[c]) }); }))));
    });
    table.appendChild(body);
    table.appendChild(el("caption", { "class": "lede", text: "Figures as reported by each pollster. – means not reported separately." + (data.checked ? " Checked for new polls on " + fmtChecked(data.checked) + "." : "") }));
    var tbl = table.parentNode;
    if (data.average_method) tbl.insertAdjacentElement("afterend", el("p", { "class": "lede", text: data.average_method }));
    if (data.not_included) tbl.insertAdjacentElement("afterend", el("p", { "class": "lede", text: data.not_included + (data.checked ? " (Checked " + fmtChecked(data.checked) + ".)" : "") }));
  }

  /* ---------- Policies ---------- */
  function renderPolicies(data) {
    var picker = document.getElementById("issue-picker");
    var list = document.getElementById("policy-list");
    var how = document.getElementById("how-list");
    var modeTopic = document.getElementById("mode-topic"), modeParty = document.getElementById("mode-party");
    var showing = document.getElementById("policy-showing");
    var sel = el("select", { id: "picker-select" });
    var selLabel = el("label", { "class": "picker-select", "for": "picker-select" }, [el("span", { text: "Topic" }), sel]);
    picker.insertAdjacentElement("beforebegin", selLabel);
    data.how_we_chose.forEach(function (t) { how.appendChild(el("li", { text: t })); });
    how.appendChild(el("li", { text: data.verification }));

    // One party's entries for one topic: identical for every party.
    function fillBox(box, issue, party) {
      var items = issue.parties[party] || [];
      var xref = issue.notes && issue.notes[party] && issue.notes[party].crossref ? issue.notes[party] : null;
      if (!items.length && xref) {
        box.appendChild(el("p", { "class": "not-covered" }, [xref.text + " ", el("a", { href: xref.url, text: "Read it on the party's site" }), "."]));
      } else if (!items.length) {
        box.appendChild(el("p", { "class": "not-covered" }, [
          "Not covered on ", el("a", { href: data.policy_pages[party], text: party + "'s 2026 policy pages" }),
          " (checked " + fmtChecked((data.checked_pages && data.checked_pages[party]) || data.checked) + ")."
        ]));
      }
      var extras = [];
      items.forEach(function (it, i) {
        var quotes = el("div");
        [it.quote].concat(it.more || []).forEach(function (q, n) {
          var bq = el("blockquote", n ? { "class": "also" } : null, ["“"]);
          bq.appendChild(annotate(q)); bq.appendChild(document.createTextNode("”"));
          quotes.appendChild(bq);
          if (i === 0 && n > 0) extras.push(bq);
          if (i > 0) extras.push(bq);
        });
        var pol = el("div", { "class": "pol" }, [
          el("a", { "class": "pol-name", href: it.url, text: "“" + it.name + "”" }),
          el("span", { "class": "tag", text: it.source_type }),
          quotes
        ]);
        if (i > 0) { extras = extras.filter(function (x) { return !pol.contains(x); }); extras.push(pol); }
        box.appendChild(pol);
      });
      var nq = items.reduce(function (n, it) { return n + 1 + (it.more || []).length; }, 0);
      foldExtras(box, extras, "quote", nq - 1);
      return box;
    }
    function select(btn) {
      picker.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-selected", "false"); });
      btn.setAttribute("aria-selected", "true");
      list.innerHTML = "";
    }
    function showTopic(issue, btn) {
      select(btn);
      partyOrder.forEach(function (party) {
        list.appendChild(fillBox(el("article", { "class": "party", style: "--pc:var(--p-" + PARTY_CODE[party] + ")" }, [el("h3", null, [el("span", { "class": "pdot", "aria-hidden": "true" }), el("span", { text: party })])]), issue, party));
      });
      showing.textContent = "Showing " + issue.name + ": " + partyOrder.length + " parties, in random order.";
      markTeReo(list);
    }
    function showParty(party, btn) {
      select(btn);
      data.issues.forEach(function (issue) {
        list.appendChild(fillBox(el("article", { "class": "party", style: "--pc:var(--p-" + PARTY_CODE[party] + ")" }, [el("h3", null, [el("span", { "class": "pdot", "aria-hidden": "true" }), el("span", { text: issue.name })])]), issue, party));
      });
      showing.innerHTML = ""; showing.appendChild(el("span", { "class": "pdot", "aria-hidden": "true", style: "--pc:var(--p-" + PARTY_CODE[party] + ")" })); showing.appendChild(document.createTextNode(" Showing everything " + party + " says, across " + data.issues.length + " topics."));
      markTeReo(list);
    }
    function buildPicker(mode) {
      picker.innerHTML = "";
      modeTopic.setAttribute("aria-pressed", mode === "topic" ? "true" : "false");
      modeParty.setAttribute("aria-pressed", mode === "party" ? "true" : "false");
      picker.setAttribute("aria-label", mode === "topic" ? "Topics" : "Parties");
      var items = mode === "topic" ? data.issues : partyOrder;
      // On phones a drop-down replaces the rows of buttons (same choices, same order).
      selLabel.firstChild.textContent = mode === "topic" ? "Topic" : "Party";
      sel.innerHTML = "";
      var btns = [];
      items.forEach(function (x, i) {
        var label = mode === "topic" ? x.name : x;
        var b = el("button", { type: "button", role: "tab", "aria-selected": "false" }, mode === "party" ? [el("span", { "class": "pdot", "aria-hidden": "true", style: "--pc:var(--p-" + PARTY_CODE[x] + ")" }), label] : [label]);
        b.addEventListener("click", function () { sel.value = String(i); mode === "topic" ? showTopic(x, b) : showParty(x, b); });
        picker.appendChild(b); btns.push(b);
        sel.appendChild(el("option", { value: String(i), text: label }));
        if (i === 0) { mode === "topic" ? showTopic(x, b) : showParty(x, b); }
      });
      sel.onchange = function () { btns[+sel.value].click(); };
      sel.value = "0";
    }
    modeTopic.addEventListener("click", function () { buildPicker("topic"); });
    modeParty.addEventListener("click", function () { buildPicker("party"); });
    buildPicker("topic");
  }

  /* ---------- Debates ---------- */
  function renderDebates(data) {
    var list = document.getElementById("debate-list");
    // A series (e.g. the Māori electorate debates) is shown as one entry per debate, like every other debate.
    var debates = [];
    data.debates.forEach(function (d) {
      if (!d.series) { debates.push(d); return; }
      d.series.forEach(function (x) {
        var past = x.date < today;
        debates.push({ date: x.date, time: x.time, name: d.name.split(":")[0] + ": " + x.label + " electorate debate", host: d.host, where: d.where,
          who: "Candidates in " + x.label, link: d.link,
          watch: { url: x.url, label: past ? "Watch again on MĀORI+" : "Watch live on MĀORI+" } });
      });
    });
    var upcoming = debates.filter(function (d) { return d.date >= today; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var held = debates.filter(function (d) { return d.date < today; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    function item(d, isHeld) {
      var dt = new Date(toDate(d.date));
      var mon = new Intl.DateTimeFormat("en-NZ", { timeZone: "UTC", month: "short" }).format(dt);
      var parts = [
        el("span", { "class": "d-meta", text: fmtDate(d.date) + (d.time ? ", " + d.time : "") }),
        el("a", { "class": "d-name", href: d.link, text: d.name }),
        el("span", { "class": "d-meta", text: d.host + ", on " + d.where }),
        el("span", { "class": "d-meta", text: "Taking part: " + d.who })
      ];
      if (d.watch) parts.push(el("a", { "class": "d-video", href: d.watch.url }, [playIcon(), el("span", { text: d.watch.label })]));
      return el("li", { "class": isHeld ? "held" : "" }, [
        el("span", { "class": "cal", "aria-hidden": "true" }, [el("span", { "class": "cal-m", text: mon }), el("span", { "class": "cal-d", text: String(dt.getUTCDate()) })]),
        el("div", null, parts)
      ]);
    }
    upcoming.forEach(function (d) { list.appendChild(item(d, false)); });
    if (held.length) {
      var pastList = el("ul", { "class": "debate-list" });
      held.forEach(function (d) { pastList.appendChild(item(d, true)); });
      list.insertAdjacentElement("afterend", el("details", { "class": "more past-debates" }, [el("summary", { text: "Past debates: watch again (" + held.length + ")" }), pastList]));
    }
  }

  /* ---------- Video: load YouTube only when someone presses play ---------- */
  document.querySelectorAll(".video-facade").forEach(function (b) {
    b.addEventListener("click", function () {
      var f = el("iframe", { src: "https://www.youtube-nocookie.com/embed/" + b.getAttribute("data-id") + "?autoplay=1&rel=0&cc_load_policy=1",
        title: "MMP (Mixed Member Proportional), from the Electoral Commission", allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowfullscreen: "", referrerpolicy: "strict-origin-when-cross-origin" });
      b.replaceWith(f); f.focus();
    });
  });

  // Key dates: folded on phones (the countdowns already show the main dates).
  (function () { var tb = document.querySelector(".timeline-box"); if (tb && window.matchMedia("(max-width: 719px)").matches) tb.removeAttribute("open"); })();

  /* ---------- Header: compact on phones after scrolling, and show where you are ---------- */
  (function () {
    var top = document.querySelector(".top"), nav = document.getElementById("site-nav"), btn = top && top.querySelector(".menu-btn");
    if (!top || !nav || !btn) return;
    var links = [].slice.call(nav.querySelectorAll("a"));
    var now = btn.querySelector(".menu-now");
    // Keep the page from jumping when the header shrinks: reserve the full header height once.
    function reserve() { if (!top.classList.contains("compact")) document.body.style.paddingTop = top.offsetHeight + "px"; }
    reserve(); window.addEventListener("resize", reserve);
    var phone = window.matchMedia("(max-width: 719px)");
    function onScroll() {
      var c = phone.matches && window.scrollY > 260;
      if (c !== top.classList.contains("compact")) {
        top.classList.toggle("compact", c);
        if (!c) { top.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
    btn.addEventListener("click", function () {
      var open = !top.classList.contains("open");
      top.classList.toggle("open", open); btn.setAttribute("aria-expanded", String(open));
    });
    links.forEach(function (a) { a.addEventListener("click", function () { top.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && top.classList.contains("open")) { top.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); btn.focus(); } });
    // Highlight the section on screen.
    var targets = links.map(function (a) { return document.querySelector(a.getAttribute("href")); });
    function mark() {
      var line = Math.max(top.offsetHeight + 40, 180), current = null;
      targets.forEach(function (t, i) { if (t && t.getBoundingClientRect().top <= line) current = i; });
      links.forEach(function (a, i) { if (i === current) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current"); });
      now.textContent = current === null ? "Sections" : links[current].textContent;
    }
    window.addEventListener("scroll", mark, { passive: true }); mark();
  })();

  /* ---------- Back to top ---------- */
  (function () {
    var b = el("a", { href: "#main", "class": "to-top", "aria-label": "Back to top", hidden: "" }, [el("span", { "aria-hidden": "true", text: "\u2191" }), " Top"]);
    document.body.appendChild(b);
    var shown = false;
    window.addEventListener("scroll", function () { var s2 = window.scrollY > window.innerHeight * 1.5; if (s2 !== shown) { shown = s2; b.hidden = !s2; } }, { passive: true });
  })();

  /* ---------- What's new ---------- */
  function renderUpdates(data) {
    var ul = document.getElementById("updates-list");
    if (!ul || !data) return;
    data.updates.slice(0, 12).forEach(function (u) {
      ul.appendChild(el("li", null, [el("strong", { text: fmtDate(u.date, { weekday: undefined }) + ": " }), u.text]));
    });
  }

  /* ---------- Seat calculator (what-if, Sainte-Laguë) ---------- */
  function sainteLague(votes, seats) {
    var q = [];
    Object.keys(votes).forEach(function (c) { for (var k = 0; k < seats; k++) q.push([votes[c] / (2 * k + 1), c]); });
    q.sort(function (a, b) { return b[0] - a[0]; });
    var won = {}; Object.keys(votes).forEach(function (c) { won[c] = 0; });
    q.slice(0, seats).forEach(function (x) { won[x[1]]++; });
    return won;
  }
  function renderSeats() {
    var box = document.getElementById("seat-calc");
    if (!box || !pollAverage) return;
    var NAMES = Object.assign({}, POLL_NAMES, { TTT: "Te Tai Tokerau Party" });
    var codes = Object.keys(pollAverage).sort(function (a, b) { return pollAverage[b] - pollAverage[a]; }).concat(["TTT"]);
    var state = {};
    function reset() { codes.forEach(function (c) { state[c] = { v: pollAverage[c] || 0, e: 0 }; }); }
    reset();
    var rows = {}, form = el("div", { "class": "seat-inputs" });
    codes.forEach(function (c) {
      var id = "sv-" + c;
      var range = el("input", { type: "range", min: "0", max: "50", step: "0.1", id: id, "aria-describedby": id + "-n" });
      var num = el("input", { type: "number", min: "0", max: "100", step: "0.1", inputmode: "decimal", "aria-label": NAMES[c] + " party vote, percent" });
      var tick = el("input", { type: "checkbox", id: "se-" + c });
      var count = el("input", { type: "number", min: "1", max: "71", step: "1", inputmode: "numeric", "aria-label": NAMES[c] + ": number of electorates won", hidden: "" });
      range.addEventListener("input", function () { state[c].v = +range.value; update(); });
      num.addEventListener("input", function () { var v = parseFloat(num.value); if (!isNaN(v)) { state[c].v = Math.max(0, Math.min(100, v)); update(true); } });
      tick.addEventListener("change", function () { state[c].e = tick.checked ? Math.max(1, +count.value || 1) : 0; update(); });
      count.addEventListener("input", function () { var v = parseInt(count.value, 10); if (v >= 1) { state[c].e = Math.min(71, v); update(true); } });
      count.addEventListener("change", function () { count.value = state[c].e || 1; });
      rows[c] = { range: range, num: num, tick: tick, count: count };
      form.appendChild(el("div", { "class": "seat-row", style: "--pc:var(--p-" + c + ")" }, [
        el("label", { "for": id, "class": "seat-name" }, [el("span", { "class": "sw" }), el("span", { text: NAMES[c] })]),
        el("div", { "class": "seat-vote" }, [range, el("span", { "class": "seat-num", id: id + "-n" }, [num, "%"])]),
        el("div", { "class": "seat-elec" }, [el("label", null, [tick, " Wins electorate"]), count])
      ]));
    });
    var resetBtn = el("button", { type: "button", "class": "seat-reset", text: "Reset to the poll average" });
    resetBtn.addEventListener("click", function () { reset(); update(); });
    var out = el("div", { "class": "seat-out" });
    var live = el("p", { "class": "visually-hidden", "aria-live": "polite" });
    box.appendChild(form); box.appendChild(resetBtn); box.appendChild(out); box.appendChild(live);
    var picked = {};
    var liveTimer;
    function update(fromNumber) {
      codes.forEach(function (c) {
        var r = rows[c];
        r.range.value = Math.min(50, state[c].v);
        r.range.style.setProperty("--fill", (Math.min(50, state[c].v) / 50 * 100) + "%");
        if (!fromNumber || document.activeElement !== r.num) r.num.value = state[c].v.toFixed(1);
        r.tick.checked = state[c].e > 0;
        r.count.hidden = !(state[c].e > 0);
        if (state[c].e > 0 && document.activeElement !== r.count) r.count.value = state[c].e;
      });
      var total = codes.reduce(function (s, c) { return s + state[c].v; }, 0);
      var qual = {}; codes.forEach(function (c) { if (state[c].v >= 5 || state[c].e > 0) qual[c] = state[c].v; });
      var ent = Object.keys(qual).length ? sainteLague(qual, 120) : {};
      var seats = {}, overhang = 0;
      codes.forEach(function (c) {
        var e = ent[c] || 0, el_ = state[c].e;
        seats[c] = qual[c] !== undefined ? Math.max(e, el_) : 0;
        if (qual[c] !== undefined && el_ > e) overhang += el_ - e;
      });
      var house = 120 + overhang, need = Math.floor(house / 2) + 1;
      out.innerHTML = "";
      if (total > 100.05) out.appendChild(el("p", { "class": "seat-warn", text: "The party votes add up to " + total.toFixed(1) + "%, which is more than 100%. Lower some parties to make the result realistic." }));
      var elecTotal = codes.reduce(function (s, c) { return s + state[c].e; }, 0);
      if (elecTotal > 71) out.appendChild(el("p", { "class": "seat-warn", text: "The electorates won add up to " + elecTotal + ", but there are only 71 electorates. Lower some parties to make the result realistic." }));
      var bar = el("div", { "class": "seat-bar", role: "img", "aria-label": codes.filter(function (c) { return seats[c]; }).map(function (c) { return NAMES[c] + " " + seats[c]; }).join(", ") + " seats" });
      codes.forEach(function (c) { if (seats[c]) bar.appendChild(el("span", { style: "--pc:var(--p-" + c + ");flex:" + seats[c] })); });
      bar.appendChild(el("span", { "class": "seat-mid", style: "left:" + (need - 0.5) / house * 100 + "%" }));
      out.appendChild(el("p", { "class": "seat-total" }, [el("strong", { text: house + " seats" }), overhang ? " (including " + overhang + " overhang " + (overhang === 1 ? "seat" : "seats") + ")" : "", ". A government needs " + need + " (the dashed line)."]));
      out.appendChild(bar);
      var list = el("ul", { "class": "seat-list", "aria-label": "Tick parties to add up their seats" });
      codes.forEach(function (c) {
        var cb = el("input", { type: "checkbox" }); cb.checked = !!picked[c]; cb.disabled = !seats[c];
        cb.addEventListener("change", function () { picked[c] = cb.checked; update(); });
        list.appendChild(el("li", { style: "--pc:var(--p-" + c + ")", "class": seats[c] ? "" : "none" }, [
          el("label", null, [cb, el("span", { "class": "sw" }), el("span", { "class": "sl-name", text: NAMES[c] }), el("b", { text: String(seats[c]) })])
        ]));
      });
      out.appendChild(el("p", { "class": "seat-hint", text: "Tick parties to add up their seats:" }));
      out.appendChild(list);
      var sum = codes.reduce(function (s, c) { return s + (picked[c] && seats[c] ? seats[c] : 0); }, 0);
      var names = codes.filter(function (c) { return picked[c] && seats[c]; }).map(function (c) { return NAMES[c]; });
      var verdict = !names.length ? "" : sum >= need ? "Together: " + sum + " seats, enough to govern (" + need + " needed)." : "Together: " + sum + " seats, " + (need - sum) + " short of the " + need + " needed.";
      if (verdict) out.appendChild(el("p", { "class": "seat-verdict" + (sum >= need ? " yes" : ""), text: verdict }));
      out.appendChild(el("p", { "class": "seat-note", text: "Adding up seats is arithmetic only. It doesn't show which parties are willing to work together." }));
      clearTimeout(liveTimer);
      liveTimer = setTimeout(function () { live.textContent = codes.filter(function (c) { return seats[c]; }).map(function (c) { return NAMES[c] + " " + seats[c]; }).join(", ") + ". " + house + " seats in total. " + verdict; }, 600);
    }
    update();
  }

  /* ---------- All parties ---------- */
  function renderParties(data) {
    var list = document.getElementById("party-list");
    data.parties.forEach(function (p) {
      var inTable = p.short && data.in_policy_table.indexOf(p.short) > -1;
      var a = el("a", { href: p.url, text: p.name });
      if (inTable) a.className = "in-table";
      list.appendChild(el("li", null, [a]));
    });
    list.insertAdjacentElement("afterend", el("p", { "class": "party-key", html: "<span></span>Outlined parties are in the policy table above." }));
  }

  /* ---------- Sources for each section ---------- */
  function renderSources(data) {
    var where = { dates: document.querySelector(".dates-body"), votes: document.getElementById("two-votes"), polls: document.getElementById("polls"),
      policies: document.getElementById("policies"), compare: document.getElementById("compare"), debates: document.getElementById("debates"), parties: document.getElementById("parties"),
      seats: document.getElementById("seats") };
    Object.keys(data.sections).forEach(function (key) {
      if (!where[key]) return;
      var ol = el("ol");
      data.sections[key].forEach(function (s) {
        ol.appendChild(el("li", null, [
          el("a", { href: s.url, text: s.title }), ", " + s.publisher + ".",
          s.supports ? el("span", { "class": "src-for", text: " Used for: " + s.supports.charAt(0).toLowerCase() + s.supports.slice(1).replace(/\.$/, "") + "." }) : null
        ]));
      });
      where[key].appendChild(el("details", { "class": "sources" }, [
        el("summary", { text: "Sources (" + data.sections[key].length + ")" }), ol,
        data.methods && data.methods[key] ? el("p", { text: data.methods[key] }) : null,
        el("p", { "class": "src-for", text: "Checked " + fmtChecked((data.checked_sections && data.checked_sections[key]) || data.checked) + "." })
      ]));
    });
  }

  Promise.all([
    getJSON("data/dates.json"), getJSON("data/polls.json"), getJSON("data/policies.json"),
    getJSON("data/debates.json"), getJSON("data/parties.json"), getJSON("data/site.json"), getJSON("data/sources.json"), getJSON("data/glossary.json").catch(function () { return null; }), getJSON("data/enrolment.json").catch(function () { return null; }), getJSON("data/updates.json").catch(function () { return null; })
  ]).then(function (r) {
    if (r[7]) {
      setGlossary(r[7]);
    }
    partyOrder = shuffle(r[2].parties);
    renderDates(r[0]);
    renderEnrolment(r[8]);
    try { renderPolls(r[1]); } catch (e) { fail(document.getElementById("poll-charts"), "polls"); }
    try { renderSeats(); } catch (e) { fail(document.getElementById("seat-calc"), "seat calculator"); }
    renderUpdates(r[9]);
    renderPolicies(r[2]);
    renderDebates(r[3]);
    renderParties(r[4]);
    renderSources(r[6]);
    markTeReo(document.getElementById("main"));

    var u = new Date(r[5].updated);
    document.getElementById("updated").textContent = "Last updated " + new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", dateStyle: "long", timeStyle: "short" }).format(u) + " (NZ time). Every poll figure and policy quote links to its source.";
  }).catch(function () {
    fail(document.getElementById("main"), "election information");
  });
})();
