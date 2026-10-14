/* NZ Election 2026 Guide — renders everything from the JSON files in /data.
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
      ns.innerHTML = "<strong>Check you're enrolled by Sunday 25 October.</strong> You can't enrol once voting starts. Check or update your details at <a href=\"https://vote.nz/\">vote.nz</a>.";
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
    var order = partyOrder.map(function (name) { return codes.filter(function (c) { return POLL_NAMES[c] === name; })[0]; }).filter(Boolean);

    order.forEach(function (code) {
      var pts = polls.filter(function (p) { return p[code] !== null && p[code] !== undefined; });
      // Trailing 14-day average at each poll's end date.
      var avg = pts.map(function (p) {
        var t = toDate(p.end);
        var win = pts.filter(function (q) { var u = toDate(q.end); return u <= t && u > t - 14 * DAY; });
        var m = win.reduce(function (s, q) { return s + q[code]; }, 0) / win.length;
        return { t: t, v: m, n: win.length };
      });
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
      pts.forEach(function (p) {
        var cx = sx(toDate(p.end)), cy = sy(p[code]);
        var hit = svgEl("circle", { "class": "hit", cx: cx, cy: cy, r: 10, tabindex: 0, role: "button",
          "aria-label": p.pollster + ", " + p.fieldwork + ": " + POLL_NAMES[code] + " " + p[code] + "%" });
        var dot = svgEl("circle", { "class": "dot", cx: cx, cy: cy, r: 4 });
        function show() {
          wrap.querySelectorAll(".dot.on").forEach(function (n) { n.classList.remove("on"); });
          dot.classList.add("on");
          detail.innerHTML = "";
          detail.appendChild(el("span", null, [
            el("strong", { text: POLL_NAMES[code] + " " + p[code] + "%" }),
            " in the " + p.pollster + " poll, " + p.fieldwork + (p.sample ? " (" + p.sample.toLocaleString("en-NZ") + " people). " : ". "),
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
          el("span", { "class": "mult-value", html: last.v.toFixed(1) + "% <small>14-day average</small>" })
        ]),
        svg
      ]));
    });
    detail.textContent = "Tap a dot to see that poll and its source. The dashed line is the 5% party-vote threshold: a party also gets list seats if it wins an electorate.";
    wrap.insertAdjacentElement("afterend", el("p", { "class": "lede", text: "Te Tai Tokerau Party isn't reported separately in most polls, so it has no chart." }));

    var table = document.getElementById("poll-table");
    var head = el("tr", null, [el("th", { text: "Poll" }), el("th", { text: "Fieldwork" })].concat(order.map(function (c) { return el("th", { text: POLL_NAMES[c] }); })));
    table.appendChild(el("thead", null, [head]));
    var body = el("tbody");
    polls.slice().reverse().forEach(function (p) {
      body.appendChild(el("tr", null, [el("td", null, [el("a", { href: p.source, text: p.pollster })]), el("td", { text: p.fieldwork })]
        .concat(order.map(function (c) { return el("td", { text: p[c] === null || p[c] === undefined ? "–" : String(p[c]) }); }))));
    });
    table.appendChild(body);
    table.appendChild(el("caption", { "class": "lede", text: "Figures as reported by each pollster. – means not reported separately." }));
  }

  /* ---------- Policies ---------- */
  function renderPolicies(data) {
    var picker = document.getElementById("issue-picker");
    var list = document.getElementById("policy-list");
    var how = document.getElementById("how-list");
    data.how_we_chose.forEach(function (t) { how.appendChild(el("li", { text: t })); });
    how.appendChild(el("li", { text: data.verification }));

    function show(issue, btn) {
      picker.querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-selected", "false"); });
      btn.setAttribute("aria-selected", "true");
      list.innerHTML = "";
      partyOrder.forEach(function (party) {
        var items = issue.parties[party] || [];
        var box = el("article", { "class": "party" }, [el("h3", { text: party })]);
        if (!items.length) {
          box.appendChild(el("p", { "class": "not-covered" }, [
            "Not covered on ", el("a", { href: data.policy_pages[party], text: party + "'s 2026 policy pages" }),
            " (checked " + fmtDate(data.checked, { weekday: undefined }) + ")."
          ]));
        }
        items.forEach(function (it) {
          box.appendChild(el("div", { "class": "pol" }, [
            el("a", { "class": "pol-name", href: it.url, text: "“" + it.name + "”" }),
            el("span", { "class": "tag", text: it.source_type }),
            el("blockquote", null, [el("span", { "class": "say", text: "In their words:" }), "“" + it.quote + "”"])
          ]));
        });
        list.appendChild(box);
      });
    }
    data.issues.forEach(function (issue, i) {
      var b = el("button", { type: "button", role: "tab", "aria-selected": "false", text: issue.name });
      b.addEventListener("click", function () { show(issue, b); });
      picker.appendChild(b);
      if (i === 0) show(issue, b);
    });
  }

  /* ---------- Debates ---------- */
  function renderDebates(data) {
    var list = document.getElementById("debate-list");
    var upcoming = data.debates.filter(function (d) { return d.date >= today; });
    var held = data.debates.filter(function (d) { return d.date < today; }).reverse();
    function item(d, isHeld) {
      return el("li", { "class": isHeld ? "held" : "" }, [
        el("span", { "class": "d-when", text: fmtDate(d.date) + (d.time ? ", " + d.time : "") + (isHeld ? " (held)" : "") }),
        el("a", { href: d.link, text: d.name }),
        el("span", { "class": "d-meta", text: d.host + ", on " + d.where }),
        el("span", { "class": "d-meta", text: "Taking part: " + d.who })
      ]);
    }
    upcoming.forEach(function (d) { list.appendChild(item(d, false)); });
    held.forEach(function (d) { list.appendChild(item(d, true)); });
  }

  /* ---------- All parties ---------- */
  function renderParties(data) {
    var list = document.getElementById("party-list");
    data.parties.forEach(function (p) {
      var li = el("li", null, [el("a", { href: p.url, text: p.name })]);
      if (p.short && data.in_policy_table.indexOf(p.short) > -1) li.appendChild(el("span", { "class": "in-table", text: " (in the policy table)" }));
      list.appendChild(li);
    });
  }

  Promise.all([
    getJSON("data/dates.json"), getJSON("data/polls.json"), getJSON("data/policies.json"),
    getJSON("data/debates.json"), getJSON("data/parties.json"), getJSON("data/site.json")
  ]).then(function (r) {
    partyOrder = shuffle(r[2].parties);
    renderDates(r[0]);
    try { renderPolls(r[1]); } catch (e) { fail(document.getElementById("poll-charts"), "polls"); }
    renderPolicies(r[2]);
    renderDebates(r[3]);
    renderParties(r[4]);
    var u = new Date(r[5].updated);
    document.getElementById("updated").textContent = "Last updated " + new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", dateStyle: "long", timeStyle: "short" }).format(u) + " (NZ time). Every poll figure and policy quote links to its source.";
  }).catch(function () {
    fail(document.getElementById("main"), "election information");
  });
})();
