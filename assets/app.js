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
  function getJSON(path) { return fetch(path, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(path); return r.json(); }); }
  function fail(container, what) {
    container.appendChild(el("p", { "class": "error", text: "The " + what + " couldn't load. Refresh the page to try again." }));
  }

  var today = nzToday();
  // Same random party order for polls and policies during one visit.
  var partyOrder = null;

  /* ---------- Dates ---------- */
  function renderDates(data) {
    var days = Math.round((toDate("2026-11-07") - toDate(today)) / DAY);
    var count = document.getElementById("countdown");
    if (days > 1) count.textContent = days + " days to go";
    else if (days === 1) count.textContent = "That's tomorrow";
    else if (days === 0) count.textContent = "That's today. Voting places are open 9am to 7pm.";
    else count.textContent = "Voting has closed. Results are at electionresults.govt.nz.";

    var list = document.getElementById("timeline");
    var next = null, markerPlaced = false;
    data.dates.forEach(function (d) {
      var state = d.date < today ? "past" : (d.date === today ? "next" : "future");
      if (!markerPlaced && d.date > today) {
        list.appendChild(el("li", { "class": "today-marker", text: "Today, " + fmtDate(today, { weekday: undefined }) }));
        markerPlaced = true;
      }
      if (!next && d.date >= today) { next = d; state = "next"; }
      var when = el("span", { "class": "when", text: fmtDate(d.date) });
      if (state === "next") when.appendChild(el("span", { "class": "badge", text: d.date === today ? "Today" : "Next" }));
      list.appendChild(el("li", { "class": state }, [when, el("span", { text: d.label })]));
    });
    var ns = document.getElementById("next-step");
    if (today <= "2026-10-25") {
      ns.innerHTML = "<strong>Check you're enrolled by Sunday 25 October.</strong> You can't enrol once voting starts. Enrol, check your details and find where to vote at <a href=\"https://vote.nz/\">vote.nz</a>, the Electoral Commission's official site.";
    } else if (today <= "2026-11-06") {
      ns.innerHTML = "<strong>Voting is open.</strong> You can vote early at any voting place until election day. Find one at <a href=\"https://vote.nz/\">vote.nz</a>.";
    } else if (today === "2026-11-07") {
      ns.innerHTML = "<strong>Voting places are open 9am to 7pm today.</strong> Find one at <a href=\"https://vote.nz/\">vote.nz</a>.";
    } else {
      ns.innerHTML = "Preliminary results are on <a href=\"https://www.electionresults.govt.nz/\">electionresults.govt.nz</a>. Official results are declared on 27 November.";
    }
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
    // Data order: highest current average first.
    var order = codes.slice().sort(function (a, b) { return latest[b].v - latest[a].v; });

    var summary = document.getElementById("poll-summary");
    var sMax = 40;
    order.forEach(function (c) {
      var v = latest[c].v;
      summary.appendChild(el("div", { "class": "bar-row", role: "img", "aria-label": POLL_NAMES[c] + ": " + v.toFixed(1) + " percent" }, [
        el("span", { "class": "bar-name", text: POLL_NAMES[c] }),
        el("span", { "class": "bar-track" }, [
          el("span", { "class": "bar-fill", style: "width:" + (v / sMax * 100).toFixed(2) + "%" }),
          el("span", { "class": "bar-thr", style: "left:" + (5 / sMax * 100) + "%" })
        ]),
        el("span", { "class": "bar-val", text: v.toFixed(1) + "%" })
      ]));
    });
    var newest = polls[polls.length - 1];
    summary.appendChild(el("p", { "class": "bar-foot" }, [
      el("span", { text: "Dashed line: 5% threshold" }),
      el("span", null, ["Latest poll: ", el("a", { href: newest.source, text: newest.pollster }), ", ends " + fmtDate(newest.end, { weekday: undefined })])
    ]));

    order.forEach(function (code) {
      var pts = polls.filter(function (p) { return p[code] !== null && p[code] !== undefined; });
      var avg = trailing(code); // 14-day average at each poll's end date
      var last = avg[avg.length - 1];

      var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": POLL_NAMES[code] + " party vote in polls since August. Latest 14-day average " + last.v.toFixed(1) + " percent." });
      svg.appendChild(svgEl("line", { "class": "base", x1: L, x2: W - R, y1: sy(0), y2: sy(0) }));
      svg.appendChild(svgEl("line", { "class": "thr", x1: L, x2: W - R, y1: sy(5), y2: sy(5) }));
      var tl = svgEl("text", { "class": "thr-label", x: 0, y: sy(5) + 4 }); tl.textContent = "5%"; svg.appendChild(tl);
      svg.appendChild(svgEl("line", { "class": "base", x1: L, x2: W - R, y1: sy(30), y2: sy(30) }));
      var g30 = svgEl("text", { "class": "axis", x: 0, y: sy(30) + 4 }); g30.textContent = "30%"; svg.appendChild(g30);
      [["2026-08-01", "Aug"], ["2026-09-01", "Sep"], ["2026-10-01", "Oct"], ["2026-11-01", "Nov"]].forEach(function (m) {
        var t = toDate(m[0]); if (t > x1) return;
        var a = svgEl("text", { "class": "axis", x: sx(t), y: H - 2 }); a.textContent = m[1]; svg.appendChild(a);
      });
      var d = avg.map(function (a, i) { return (i ? "L" : "M") + sx(a.t).toFixed(1) + "," + sy(a.v).toFixed(1); }).join("");
      svg.appendChild(svgEl("path", { "class": "avg", d: d }));
      var note = el("p", { "class": "mult-note", "aria-live": "polite", hidden: "" });
      pts.forEach(function (p) {
        var cx = sx(toDate(p.end)), cy = sy(p[code]);
        var hit = svgEl("circle", { "class": "hit", cx: cx, cy: cy, r: 10, tabindex: 0, role: "button",
          "aria-label": p.pollster + ", " + p.fieldwork + ": " + POLL_NAMES[code] + " " + p[code] + "%" });
        var dot = svgEl("circle", { "class": "dot", cx: cx, cy: cy, r: 4 });
        function show() {
          wrap.querySelectorAll(".dot.on").forEach(function (n) { n.classList.remove("on"); });
          dot.classList.add("on");
          wrap.querySelectorAll(".mult-note").forEach(function (n) { n.hidden = true; n.innerHTML = ""; });
          note.hidden = false;
          note.appendChild(el("span", null, [
            el("strong", { text: POLL_NAMES[code] + " " + p[code] + "%" }),
            " in the " + p.pollster + " poll, " + p.fieldwork + (p.sample ? " (" + p.sample.toLocaleString("en-NZ") + " people). " : ". ") + (p.commissioned_by ? p.commissioned_by + ". " : ""),
            el("a", { href: p.source, text: "Source" })
          ]));
        }
        hit.addEventListener("click", show);
        hit.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); show(); } });
        svg.appendChild(hit); svg.appendChild(dot);
      });

      wrap.appendChild(el("div", { "class": "mult" }, [
        el("div", { "class": "mult-head" }, [
          el("span", { "class": "mult-name", text: POLL_NAMES[code] }),
          el("span", { "class": "mult-value", text: last.v.toFixed(1) + "%" })
        ]),
        svg,
        note
      ]));
    });
    detail.textContent = "Tap any dot to see that poll and its source just below the chart. The dashed line is the 5% party-vote threshold; a party also gets list seats if it wins an electorate.";
    wrap.insertAdjacentElement("afterend", el("p", { "class": "lede", text: "Te Tai Tokerau Party isn't reported separately in most polls, so it has no chart." }));

    var table = document.getElementById("poll-table");
    var head = el("tr", null, [el("th", { text: "Poll" }), el("th", { text: "Fieldwork" }), el("th", { text: "Commissioned by" })].concat(order.map(function (c) { return el("th", { text: POLL_NAMES[c] }); })));
    table.appendChild(el("thead", null, [head]));
    var body = el("tbody");
    polls.slice().reverse().forEach(function (p) {
      body.appendChild(el("tr", null, [el("td", null, [el("a", { href: p.source, text: p.pollster })]), el("td", { text: p.fieldwork }), el("td", { "class": "who", text: p.commissioned_by || "" })]
        .concat(order.map(function (c) { return el("td", { text: p[c] === null || p[c] === undefined ? "–" : String(p[c]) }); }))));
    });
    table.appendChild(body);
    table.appendChild(el("caption", { "class": "lede", text: "Figures as reported by each pollster. – means not reported separately." }));
    var tbl = table.parentNode;
    if (data.average_method) tbl.insertAdjacentElement("afterend", el("p", { "class": "lede", text: data.average_method + " Roy Morgan's fieldwork runs over about four weeks, so it is placed at the date fieldwork ended." }));
    if (data.not_included) tbl.insertAdjacentElement("afterend", el("p", { "class": "lede", text: data.not_included }));
  }

  /* ---------- Policies ---------- */
  function renderPolicies(data) {
    var picker = document.getElementById("issue-picker");
    var list = document.getElementById("policy-list");
    var how = document.getElementById("how-list");
    var modeTopic = document.getElementById("mode-topic"), modeParty = document.getElementById("mode-party");
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
          " (checked " + fmtDate(data.checked, { weekday: undefined }) + ")."
        ]));
      }
      items.forEach(function (it) {
        var quotes = el("div");
        [it.quote].concat(it.more || []).forEach(function (q, n) {
          var bq = el("blockquote", n ? { "class": "also" } : null, [el("span", { "class": "say", text: n ? "Also:" : "In their words:" }), "“"]);
          bq.appendChild(annotate(q)); bq.appendChild(document.createTextNode("”"));
          quotes.appendChild(bq);
        });
        box.appendChild(el("div", { "class": "pol" }, [
          el("a", { "class": "pol-name", href: it.url, text: "“" + it.name + "”" }),
          el("span", { "class": "tag", text: it.source_type }),
          quotes
        ]));
      });
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
        list.appendChild(fillBox(el("article", { "class": "party" }, [el("h3", { text: party })]), issue, party));
      });
    }
    function showParty(party, btn) {
      select(btn);
      data.issues.forEach(function (issue) {
        list.appendChild(fillBox(el("article", { "class": "party" }, [el("h3", { text: issue.name })]), issue, party));
      });
    }
    function buildPicker(mode) {
      picker.innerHTML = "";
      modeTopic.setAttribute("aria-pressed", mode === "topic" ? "true" : "false");
      modeParty.setAttribute("aria-pressed", mode === "party" ? "true" : "false");
      picker.setAttribute("aria-label", mode === "topic" ? "Topics" : "Parties");
      var items = mode === "topic" ? data.issues : partyOrder;
      items.forEach(function (x, i) {
        var label = mode === "topic" ? x.name : x;
        var b = el("button", { type: "button", role: "tab", "aria-selected": "false", text: label });
        b.addEventListener("click", function () { mode === "topic" ? showTopic(x, b) : showParty(x, b); });
        picker.appendChild(b);
        if (i === 0) { mode === "topic" ? showTopic(x, b) : showParty(x, b); }
      });
    }
    modeTopic.addEventListener("click", function () { buildPicker("topic"); });
    modeParty.addEventListener("click", function () { buildPicker("party"); });
    buildPicker("topic");
  }

  /* ---------- Debates ---------- */
  function renderDebates(data) {
    var list = document.getElementById("debate-list");
    var upcoming = data.debates.filter(function (d) { return d.date >= today; });
    var held = data.debates.filter(function (d) { return d.date < today; }).reverse();
    function item(d, isHeld) {
      var dt = new Date(toDate(d.date));
      var mon = new Intl.DateTimeFormat("en-NZ", { timeZone: "UTC", month: "short" }).format(dt);
      return el("li", { "class": isHeld ? "held" : "" }, [
        el("span", { "class": "cal", "aria-hidden": "true" }, [el("span", { "class": "cal-m", text: mon }), el("span", { "class": "cal-d", text: String(dt.getUTCDate()) })]),
        el("div", null, [
          el("span", { "class": "d-meta", text: fmtDate(d.date) + (d.time ? ", " + d.time : "") }),
          el("a", { "class": "d-name", href: d.link, text: d.name }),
          isHeld ? el("span", { "class": "held-note", text: " (already held)" }) : null,
          el("span", { "class": "d-meta", text: d.host + ", on " + d.where }),
          el("span", { "class": "d-meta", text: "Taking part: " + d.who }),
          d.watch ? el("a", { "class": "d-video", href: d.watch.url }, [playIcon(), d.watch.label]) : null
        ])
      ]);
    }
    upcoming.forEach(function (d) { list.appendChild(item(d, false)); });
    held.forEach(function (d) { list.appendChild(item(d, true)); });
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
      policies: document.getElementById("policies"), compare: document.getElementById("compare"), debates: document.getElementById("debates"), parties: document.getElementById("parties") };
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
        el("p", { "class": "src-for", text: "Checked " + fmtDate(data.checked, { weekday: undefined }) + "." })
      ]));
    });
  }

  Promise.all([
    getJSON("data/dates.json"), getJSON("data/polls.json"), getJSON("data/policies.json"),
    getJSON("data/debates.json"), getJSON("data/parties.json"), getJSON("data/site.json"), getJSON("data/sources.json"), getJSON("data/glossary.json").catch(function () { return null; })
  ]).then(function (r) {
    if (r[7]) {
      setGlossary(r[7]);
    }
    partyOrder = shuffle(r[2].parties);
    renderDates(r[0]);
    try { renderPolls(r[1]); } catch (e) { fail(document.getElementById("poll-charts"), "polls"); }
    renderPolicies(r[2]);
    renderDebates(r[3]);
    renderParties(r[4]);
    renderSources(r[6]);
    var u = new Date(r[5].updated);
    document.getElementById("updated").textContent = "Last updated " + new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", dateStyle: "long", timeStyle: "short" }).format(u) + " (NZ time). Every poll figure and policy quote links to its source.";
  }).catch(function () {
    fail(document.getElementById("main"), "election information");
  });
})();
