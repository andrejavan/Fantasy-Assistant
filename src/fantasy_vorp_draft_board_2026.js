async function loadBaseData() {
  const response = await fetch("./fantasy_vorp_draft_board_2026_data.json");
  if (!response.ok) {
    throw new Error(`Could not load player data (${response.status}).`);
  }
  return response.json();
}

async function init() {
  const BASE = await loadBaseData();
  let DATA = JSON.parse(JSON.stringify(BASE)),
    POS = "RB",
    log = [],
    ctxP = null,
    cache = new Map();
  const LIMIT = { RB: 50, WR: 50, QB: 32, TE: 32, K: 32, DST: 32 },
    BENCH = { QB: 10, RB: 20, WR: 20, TE: 10, K: 10, DST: 10 };
  const $ = (id) => document.getElementById(id),
    num = (v) => {
      let x = parseFloat(v);
      return Number.isFinite(x) ? x : null;
    },
    esc = (s) =>
      String(s ?? "").replace(
        /[&<>"']/g,
        (m) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;",
          })[m],
      );
  function getLeagueSize() {
    return Math.max(4, Math.min(20, +$("n").value || 10));
  }
  function owner(p) {
    let n = getLeagueSize(),
      r = Math.floor((p - 1) / n) + 1,
      w = ((p - 1) % n) + 1;
    return r % 2 ? w : n + 1 - w;
  }
  function drafted() {
    return new Set(log.map((x) => x.name));
  }
  function getPlayer(name) {
    return DATA.find((x) => x.name === name);
  }
  function roster(t) {
    return log
      .filter((x) => x.owner === t)
      .map((x) => getPlayer(x.name))
      .filter(Boolean);
  }
  function rawPicks(cur, t, c = 10) {
    let a = [];
    for (let p = cur + 1; p < 1000 && a.length < c; p++)
      if (owner(p) === t) a.push(p);
    return a;
  }
  function draftDeltaPicks(cur, t, c = 3) {
    let r = rawPicks(cur, t, c * 3 + 4),
      a = [];
    for (let p of r) {
      if (p === cur + 1) continue;
      if (a.length && p === a[a.length - 1] + 1) continue;
      a.push(p);
      if (a.length === c) break;
    }
    return a;
  }
  function survives(p, target) {
    return p.market_rank == null || p.market_rank >= target;
  }
  function alt(p, target) {
    let d = drafted(),
      a = DATA.filter(
        (x) => x.pos === p.pos && !d.has(x.name) && x.name !== p.name,
      ).sort((a, b) => b.ppg - a.ppg),
      s = a.filter((x) => survives(x, target));
    return s[0] || a[0] || null;
  }
  function draftDelta(player, target) {
    if (!target) return { dd: null };
    if (survives(player, target)) return { dd: 0, s: true, alt: player };
    let a = alt(player, target);
    return { dd: a ? player.ppg - a.ppg : null, s: false, alt: a };
  }
  function tags(p) {
    return (p.tags || [])
      .map((t) => {
        let u = t.toUpperCase(),
          c = u === "BOOM" ? "boom" : u === "PRICE RISK" ? "price" : "risk";
        return `<span class="tag ${c}" title="${esc(p.tagReason || "")}">${esc(u)}</span>`;
      })
      .join("");
  }
  function rowClass(p) {
    let t = (p.tags || []).map((x) => x.toUpperCase());
    if (t.includes("PRICE RISK")) return "rowPrice";
    if (t.includes("BOOM")) return "rowBoom";
    if (t.includes("INJ") || t.includes("UNCERTAIN")) return "rowRisk";
    return "";
  }
  function lineup(r) {
    let a = [...r].sort((x, y) => y.ppg - x.ppg),
      out = [],
      take = (ps) => {
        let i = a.findIndex((p) => p.pos === ps);
        return i >= 0 ? a.splice(i, 1)[0] : null;
      };
    out.push(
      ["QB", take("QB")],
      ["RB1", take("RB")],
      ["RB2", take("RB")],
      ["WR1", take("WR")],
      ["WR2", take("WR")],
      ["TE", take("TE")],
    );
    let fi = -1,
      b = -1;
    a.forEach((p, i) => {
      if (["RB", "WR", "TE"].includes(p.pos) && p.ppg > b) {
        b = p.ppg;
        fi = i;
      }
    });
    out.push(
      ["FLEX", fi >= 0 ? a.splice(fi, 1)[0] : null],
      ["K", take("K")],
      ["D/ST", take("DST")],
    );
    return out;
  }
  function lineupScore(r) {
    return lineup(r)
      .reduce((s, x) => s + (x[1]?.ppg || 0), 0);
  }
  function needs(r) {
    let c = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
    r.forEach((p) => {
      if (c[p.pos] != null) c[p.pos]++;
    });
    let q = Math.max(0, 1 - c.QB),
      rb = Math.max(0, 2 - c.RB),
      wr = Math.max(0, 2 - c.WR),
      te = Math.max(0, 1 - c.TE),
      k = Math.max(0, 1 - c.K),
      dst = Math.max(0, 1 - c.DST),
      sur =
        Math.max(0, c.RB - 2) + Math.max(0, c.WR - 2) + Math.max(0, c.TE - 1);
    return { q, rb, wr, te, flex: sur ? 0 : 1, k, dst };
  }
  function nt(x) {
    return x.q + x.rb + x.wr + x.te + x.flex + x.k + x.dst;
  }
  function eligible(x) {
    let s = new Set();
    if (x.q) s.add("QB");
    if (x.rb || x.flex) s.add("RB");
    if (x.wr || x.flex) s.add("WR");
    if (x.te || x.flex) s.add("TE");
    if (s.size) return [...s];
    if (x.k) s.add("K");
    if (x.dst) s.add("DST");
    return [...s];
  }
  function apply(x, ps) {
    x = { ...x };
    if (ps === "QB" && x.q) x.q--;
    else if (ps === "RB") {
      if (x.rb) x.rb--;
      else if (x.flex) x.flex--;
    } else if (ps === "WR") {
      if (x.wr) x.wr--;
      else if (x.flex) x.flex--;
    } else if (ps === "TE") {
      if (x.te) x.te--;
      else if (x.flex) x.flex--;
    } else if (ps === "K" && x.k) x.k--;
    else if (ps === "DST" && x.dst) x.dst--;
    return x;
  }
  function bestAt(ps, target, blocked) {
    let d = drafted();
    return (
      DATA.filter(
        (p) =>
          p.pos === ps &&
          !d.has(p.name) &&
          !blocked.has(p.name) &&
          survives(p, target),
      ).sort((a, b) => b.ppg - a.ppg)[0] || null
    );
  }
  function complete(candidate) {
    let user = +$("slot").value || 1,
      cur = +$("pick").value || 1,
      sig =
        log.map((x) => x.pick + ":" + x.name).join("|") +
        "#" +
        cur +
        "#" +
        user +
        "#" +
        candidate.name +
        "#" +
        candidate.ppg +
        "#" +
        candidate.market_rank;
    if (cache.has(sig)) return cache.get(sig);
    let base = roster(user),
      forced = [...base, candidate],
      n0 = needs(forced),
      k = nt(n0);
    if (!k) {
      let z = { score: lineupScore(forced), path: [], states: 1 };
      cache.set(sig, z);
      return z;
    }
    let picks = rawPicks(cur, user, k + 2),
      memo = new Map(),
      states = 0;
    function solve(step, names, n) {
      states++;
      if (!nt(n)) {
        let rr = [...forced, ...names.map(getPlayer).filter(Boolean)];
        return { score: lineupScore(rr), path: [] };
      }
      if (step >= picks.length) return { score: -Infinity, path: [] };
      let key =
        step +
        "|" +
        [n.q, n.rb, n.wr, n.te, n.flex, n.k, n.dst].join(",") +
        "|" +
        [...names].sort().join(",");
      if (memo.has(key)) return memo.get(key);
      let best = { score: -Infinity, path: [] },
        blocked = new Set([candidate.name, ...names]),
        target = picks[step];
      for (let ps of eligible(n)) {
        let p = bestAt(ps, target, blocked);
        if (!p) continue;
        let ch = solve(step + 1, [...names, p.name], apply(n, ps));
        if (ch.score > best.score)
          best = {
            score: ch.score,
            path: [{ pick: target, name: p.name }, ...ch.path],
          };
      }
      memo.set(key, best);
      return best;
    }
    let s = solve(0, [], n0),
      res = { score: s.score, path: s.path, states };
    cache.set(sig, res);
    return res;
  }
  function counts(t) {
    let c = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 };
    roster(t).forEach((p) => c[p.pos]++);
    return c;
  }
  function needPos(t) {
    let c = counts(t),
      a = [];
    if (c.QB < 1) a.push("QB");
    if (c.RB < 2) a.push("RB");
    if (c.WR < 2) a.push("WR");
    if (c.TE < 1) a.push("TE");
    let core = Math.min(c.RB, 2) + Math.min(c.WR, 2) + Math.min(c.TE, 1),
      extra =
        Math.max(0, c.RB - 2) + Math.max(0, c.WR - 2) + Math.max(0, c.TE - 1);
    if (core >= 5 && !extra) a.push("RB", "WR", "TE");
    return [...new Set(a)];
  }
  function oppPos(t, pick) {
    let a = needPos(t);
    if (a.length) return a;
    let r = Math.floor((pick - 1) / getLeagueSize()) + 1,
      c = counts(t);
    if (r >= 12 && c.K < 1) return ["K"];
    if (r >= 13 && c.DST < 1) return ["DST"];
    let cap = { QB: 2, RB: 6, WR: 6, TE: 2, K: 1, DST: 1 };
    return Object.keys(cap).filter(
      (p) => c[p] < cap[p] && ((p !== "K" && p !== "DST") || r >= 9),
    );
  }
  function oppPick(t, pick) {
    let a = DATA.filter(
      (p) => !drafted().has(p.name) && oppPos(t, pick).includes(p.pos),
    );
    if (!a.length) a = DATA.filter((p) => !drafted().has(p.name));
    let target = draftDeltaPicks(pick, t, 1)[0];
    if ($("opp").value === "dd")
      a.sort(
        (x, y) =>
          (draftDelta(y, target).dd ?? -999) - (draftDelta(x, target).dd ?? -999) ||
          y.vorp - x.vorp ||
          (x.market_rank ?? 9999) - (y.market_rank ?? 9999),
      );
    else
      a.sort(
        (x, y) =>
          (x.market_rank ?? 9999) - (y.market_rank ?? 9999) || y.vorp - x.vorp,
      );
    return a[0];
  }
  function recalc() {
    for (let [ps, cut] of Object.entries(BENCH)) {
      let a = DATA.filter((p) => p.pos === ps).sort((x, y) => y.ppg - x.ppg);
      if (a.length < cut) continue;
      let base = a[cut - 1].ppg,
        t = 1;
      a.forEach((p, i) => {
        p.rank = i + 1;
        p.vorp = +(p.ppg - base).toFixed(2);
        p.von = +(p.ppg - (a[i + 1]?.ppg ?? p.ppg)).toFixed(2);
        p.tier = t;
        if (i + 1 < a.length && p.ppg - a[i + 1].ppg >= 0.75) t++;
      });
    }
  }
  function invalidate() {
    cache.clear();
  }
  function make(name) {
    let cur = +$("pick").value || 1,
      u = +$("slot").value || 1;
    if (drafted().has(name)) return;
    log.push({ name, pick: cur, owner: owner(cur), isMine: owner(cur) === u });
    $("pick").value = cur + 1;
    invalidate();
    render();
  }
  function auto() {
    let u = +$("slot").value || 1,
      cur = +$("pick").value || 1;
    if (owner(cur) === u) return;
    while (owner(cur) !== u) {
      let t = owner(cur),
        p = oppPick(t, cur);
      if (!p) break;
      log.push({ name: p.name, pick: cur, owner: t, isMine: false });
      cur++;
    }
    $("pick").value = cur;
    invalidate();
    render();
  }
  function renderLine() {
    let t = +$("team").value || 1,
      r = roster(t),
      l = lineup(r),
      used = new Set(),
      sp = 0;
    function preview(slot) {
      let elig = slot.startsWith("RB")
        ? ["RB"]
        : slot.startsWith("WR")
          ? ["WR"]
          : slot === "QB"
            ? ["QB"]
            : slot === "TE"
              ? ["TE"]
              : slot === "K"
                ? ["K"]
                : slot === "D/ST"
                  ? ["DST"]
                  : ["RB", "WR", "TE"];
      return DATA.filter(
        (p) =>
          elig.includes(p.pos) && !drafted().has(p.name) && !used.has(p.name),
      ).sort((a, b) => b.ppg - a.ppg)[0];
    }
    $("line").innerHTML = l
      .map(([s, p]) => {
        if (p) {
          sp += p.ppg;
          return `<tr><td>${s}</td><td class="actual">${esc(p.name)} ${tags(p)}</td><td>${p.ppg.toFixed(2)}</td></tr>`;
        }
        let x = preview(s);
        if (x) used.add(x.name);
        return `<tr><td>${s}</td><td class="preview">${x ? esc(x.name) : "—"}</td><td class="preview">${x ? x.ppg.toFixed(2) : "—"}</td></tr>`;
      })
      .join("");
    $("sppg").textContent = sp.toFixed(2);
    $("appg").textContent = r.reduce((s, p) => s + p.ppg, 0).toFixed(2);
  }
  function renderTicker(completionByPlayerName) {
    let evaluated = DATA.filter((p) => completionByPlayerName.has(p.name)).map(
        (p) => ({ p, c: completionByPlayerName.get(p.name) }),
      ),
      selected = evaluated
        .slice()
        .sort((x, y) => y.c.score - x.c.score || y.p.vorp - x.p.vorp)
        .slice(0, 12),
      selectedNames = new Set(selected.map((x) => x.p.name));
    for (let ps of ["QB", "RB", "WR", "TE", "K", "DST"]) {
      let best = evaluated
          .filter((x) => x.p.pos === ps)
        .sort((x, y) => y.c.score - x.c.score || y.p.vorp - x.p.vorp)[0];
      if (best && !selectedNames.has(best.p.name)) {
        selected.push(best);
        selectedNames.add(best.p.name);
      }
    }
    selected.sort((x, y) => y.c.score - x.c.score || y.p.vorp - x.p.vorp);
    $("ticker").innerHTML = selected
      .map(
        (x) =>
          `<span class="tick"><b>${x.p.pos}</b> ${esc(x.p.name)} <span class="small">${x.p.ppg.toFixed(2)}</span> <span class="good">COMP ${x.c.score.toFixed(2)}</span></span>`,
      )
      .join("");
  }
  function ddcell(d) {
    if (d.dd == null) return "—";
    if (d.s) return '<span class="small">0.00 survives</span>';
    return `${d.dd >= 0 ? "+" : ""}${d.dd.toFixed(2)}<br><span class="small">vs ${esc(d.alt?.name || "—")}</span>`;
  }
  function render() {
    recalc();
    let u = +$("slot").value || 1,
      cur = +$("pick").value || 1,
      t = owner(cur),
      mine = t === u,
      turns = draftDeltaPicks(cur, u, 3);
    $("clock").textContent = `${cur} • Team ${t}${mine ? " YOU" : ""}`;
    $("turns").textContent = turns.join(" / ");
    $("count").textContent = log.length;
    $("status").innerHTML = mine
      ? `<b>You are on the clock.</b> Completion Score is evaluated for the leading visible candidates.`
      : `Team ${t} is on the clock. Auto opponents are ${$("opp").value.toUpperCase()}-first.`;
    $("auto").disabled = mine;
    $("title").textContent = POS + " — available";
    let q = $("q").value.toLowerCase(),
      arr = DATA.filter((p) => p.pos === POS && !drafted().has(p.name))
        .sort((a, b) => b.ppg - a.ppg)
        .slice(0, LIMIT[POS]);
    if (q)
      arr = arr.filter((p) =>
        (p.name + " " + p.team).toLowerCase().includes(q),
      );
    let comps = new Map(),
      best = -Infinity;
    if (mine) {
      let draftedNames = drafted(),
        evaluationByName = new Map(
          arr.slice(0, 20).map((p) => [p.name, p]),
        );
      for (let ps of ["QB", "RB", "WR", "TE", "K", "DST"]) {
        DATA.filter((p) => p.pos === ps && !draftedNames.has(p.name))
          .sort((a, b) => b.ppg - a.ppg)
          .slice(0, 3)
          .forEach((p) => evaluationByName.set(p.name, p));
      }
      let evaluationPool = [...evaluationByName.values()];
      for (let p of evaluationPool) {
        let c = complete(p);
        comps.set(p.name, c);
      }
      for (let p of arr) {
        let c = comps.get(p.name);
        if (c && c.score > best) best = c.score;
      }
    }
    $("body").innerHTML = "";
    for (let p of arr) {
      let c = comps.get(p.name),
        tr = document.createElement("tr");
      tr.className = rowClass(p) + (c && c.score === best ? " best" : "");
      let ds = turns.map((x) => draftDelta(p, x)),
        path = c?.path?.length
          ? c.path.map((x) => x.pick + ":" + x.name).join(" → ")
          : "Lineup complete";
      tr.innerHTML = `<td>${p.rank}</td><td><b>${esc(p.name)}</b>${tags(p)} <span class="small">${esc(p.team)} • ${esc(p.source || "")}</span></td><td>${p.ppg.toFixed(2)}</td><td>${p.vorp >= 0 ? "+" : ""}${p.vorp.toFixed(2)}</td><td>${p.von >= 0 ? "+" : ""}${p.von.toFixed(2)}</td><td>${p.tier}</td><td>${p.market_rank ?? "—"}</td><td>${ddcell(ds[0])}</td><td>${ddcell(ds[1])}</td><td>${ddcell(ds[2])}</td><td class="comp">${c ? `<b class="good">${c.score.toFixed(2)}</b> <span class="small">${c.score === best ? "BEST" : (c.score - best).toFixed(2)}</span><span class="path" title="${esc(path)}">${esc(path)}</span>` : "—"}</td><td><button data-n="${esc(p.name)}">Draft</button></td>`;
      tr.oncontextmenu = (e) => {
        e.preventDefault();
        ctxP = p;
        $("ctx").style.display = "block";
        $("ctx").style.left = Math.min(e.clientX, innerWidth - 200) + "px";
        $("ctx").style.top = Math.min(e.clientY, innerHeight - 210) + "px";
      };
      $("body").appendChild(tr);
    }
    document
      .querySelectorAll("[data-n]")
      .forEach((b) => (b.onclick = () => make(b.dataset.n)));
    $("log").innerHTML = log
      .slice()
      .reverse()
      .slice(0, 35)
      .map(
        (x) =>
          `<div><span>${x.pick}. ${esc(x.name)}</span><span class="small">T${x.owner}</span></div>`,
      )
      .join("");
    renderLine();
    renderTicker(comps);
  }
  function teams() {
    let s = $("team"),
      u = +$("slot").value || 1;
    s.innerHTML = "";
    for (let i = 1; i <= getLeagueSize(); i++) {
      let o = document.createElement("option");
      o.value = i;
      o.textContent = "Team " + i + (i === u ? " (You)" : "");
      s.appendChild(o);
    }
    s.value = Math.min(u, getLeagueSize());
  }
  function csvEsc(v) {
    let s = String(v ?? "");
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function exportCSV() {
    let pm = new Map(log.map((x) => [x.name, x])),
      h = [
        "Name",
        "Pos",
        "Team",
        "PPG",
        "SeasonPoints",
        "ADP",
        "Tags",
        "TagReason",
        "ProjectionSource",
        "AdjustmentNote",
        "DraftPick",
        "DraftTeam",
        "LeagueSize",
        "UserSlot",
        "OpponentStrategy",
      ],
      rows = [h.join(",")];
    for (let p of DATA) {
      let d = pm.get(p.name);
      rows.push(
        [
          p.name,
          p.pos,
          p.team,
          p.ppg,
          p.season,
          p.market_rank ?? "",
          (p.tags || []).join(";"),
          p.tagReason || "",
          p.source || "",
          p.adjustmentNote || "",
          d?.pick ?? "",
          d?.owner ?? "",
          getLeagueSize(),
          +$("slot").value || 1,
          $("opp").value,
        ]
          .map(csvEsc)
          .join(","),
      );
    }
    let blob = new Blob([rows.join("\n")], { type: "text/csv" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "fantasy_vorp_state.csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  function parseCSV(t) {
    let R = [],
      r = [],
      f = "",
      q = false;
    for (let i = 0; i < t.length; i++) {
      let c = t[i],
        n = t[i + 1];
      if (c === '"' && q && n === '"') {
        f += '"';
        i++;
      } else if (c === '"') q = !q;
      else if (c === "," && !q) {
        r.push(f);
        f = "";
      } else if ((c === "\n" || c === "\r") && !q) {
        if (c === "\r" && n === "\n") i++;
        r.push(f);
        if (r.some((x) => x.trim())) R.push(r);
        r = [];
        f = "";
      } else f += c;
    }
    r.push(f);
    if (r.some((x) => x.trim())) R.push(r);
    return R;
  }
  function importCSV(t) {
    let R = parseCSV(t),
      H = R[0].map((x) => x.trim().toLowerCase()),
      get = (r, k) => {
        let i = H.indexOf(k.toLowerCase());
        return i < 0 ? "" : r[i];
      },
      rest = [];
    for (let r of R.slice(1)) {
      let name = get(r, "Name").trim(),
        ps = get(r, "Pos").trim().toUpperCase();
      if (ps === "D/ST" || ps === "DEF") ps = "DST";
      if (!name || !ps) continue;
      let p = DATA.find(
        (x) => x.name.toLowerCase() === name.toLowerCase() && x.pos === ps,
      );
      if (!p) {
        p = {
          name,
          pos: ps,
          team: "",
          ppg: 0,
          season: 0,
          market_rank: null,
          tags: [],
          tagReason: "",
          source: "CSV",
          adjustmentNote: "",
        };
        DATA.push(p);
      }
      let x = num(get(r, "PPG")),
        s = num(get(r, "SeasonPoints")),
        a = num(get(r, "ADP"));
      if (x == null && s == null && ps !== "K" && ps !== "DST") {
        let g = num(get(r, "Games")) || 17,
          py = num(get(r, "PassYds")) || 0,
          pt = num(get(r, "PassTD")) || 0,
          ii = num(get(r, "INT")) || 0,
          ry = num(get(r, "RushYds")) || 0,
          rt = num(get(r, "RushTD")) || 0,
          rc = num(get(r, "Rec")) || 0,
          rey = num(get(r, "RecYds")) || 0,
          ret = num(get(r, "RecTD")) || 0,
          fu = num(get(r, "Fumbles")) || 0;
        s =
          0.04 * py +
          4 * pt -
          2 * ii +
          0.1 * ry +
          6 * rt +
          rc +
          0.1 * rey +
          6 * ret -
          2 * fu;
        x = s / g;
      }
      if (x != null) {
        p.ppg = x;
        p.season = s ?? x * 17;
      } else if (s != null) {
        p.season = s;
        p.ppg = s / 17;
      }
      if (a != null) p.market_rank = a;
      if (get(r, "Team")) p.team = get(r, "Team");
      if (get(r, "Tags"))
        p.tags = get(r, "Tags")
          .split(";")
          .map((x) => x.trim().toUpperCase())
          .filter(Boolean);
      p.tagReason = get(r, "TagReason") || p.tagReason;
      p.source = get(r, "ProjectionSource") || p.source;
      p.adjustmentNote = get(r, "AdjustmentNote") || p.adjustmentNote;
      let dp = num(get(r, "DraftPick")),
        dt = num(get(r, "DraftTeam"));
      if (dp != null && dt != null)
        rest.push({ name: p.name, pick: dp, owner: dt });
    }
    if (R[1]) {
      let ls = num(get(R[1], "LeagueSize")),
        us = num(get(R[1], "UserSlot")),
        op = get(R[1], "OpponentStrategy");
      if (ls) $("n").value = ls;
      if (us) $("slot").value = us;
      if (op === "adp" || op === "dd") $("opp").value = op;
    }
    if (rest.length) {
      let u = +$("slot").value || 1;
      log = rest
        .sort((a, b) => a.pick - b.pick)
        .map((x) => ({ ...x, isMine: x.owner === u }));
      $("pick").value = Math.max(...log.map((x) => x.pick)) + 1;
    }
    recalc();
    invalidate();
    teams();
    render();
  }
  $("ctx").onclick = (e) => {
    let a = e.target.dataset.a;
    if (!a || !ctxP) return;
    let p = ctxP;
    if (a === "ppg") {
      let v = num(prompt("Projected PPG", p.ppg));
      if (v != null) {
        p.ppg = v;
        p.season = v * 17;
        p.source = "Custom edit";
        p.adjustmentNote = "Manual PPG edit";
      }
    }
    if (a === "adp") {
      let v = num(prompt("ADP", p.market_rank ?? ""));
      if (v != null) p.market_rank = v;
    }
    if (a === "tags") {
      let v = prompt("Tags separated by semicolons", (p.tags || []).join(";"));
      if (v != null)
        p.tags = v
          .split(";")
          .map((x) => x.trim().toUpperCase())
          .filter(Boolean);
    }
    if (a === "note") {
      let v = prompt(
        "Tag reason / note",
        p.tagReason || p.adjustmentNote || "",
      );
      if (v != null) {
        p.tagReason = v;
        p.adjustmentNote = v;
      }
    }
    if (a === "restore") {
      let b = BASE.find((x) => x.name === p.name && x.pos === p.pos);
      if (b) Object.assign(p, JSON.parse(JSON.stringify(b)));
    }
    $("ctx").style.display = "none";
    recalc();
    invalidate();
    render();
  };
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#ctx")) $("ctx").style.display = "none";
  });
  for (let p of ["RB", "WR", "QB", "TE", "K", "DST"]) {
    let b = document.createElement("button");
    b.textContent = p === "DST" ? "D/ST" : p;
    b.onclick = () => {
      POS = p;
      document
        .querySelectorAll("#tabs button")
        .forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      render();
    };
    if (p === POS) b.classList.add("active");
    $("tabs").appendChild(b);
  }
  $("n").onchange = () => {
    let n = getLeagueSize();
    $("slot").max = n;
    if (+$("slot").value > n) $("slot").value = n;
    log = [];
    $("pick").value = 1;
    invalidate();
    teams();
    render();
  };
  $("slot").onchange = () => {
    log = [];
    $("pick").value = 1;
    invalidate();
    teams();
    render();
  };
  $("opp").onchange = render;
  $("pick").oninput = () => {
    invalidate();
    render();
  };
  $("q").oninput = render;
  $("team").onchange = render;
  $("auto").onclick = auto;
  $("undo").onclick = () => {
    if (!log.length) return;
    let x = log.pop();
    $("pick").value = x.pick;
    invalidate();
    render();
  };
  $("reset").onclick = () => {
    log = [];
    $("pick").value = 1;
    invalidate();
    render();
  };
  $("exp").onclick = exportCSV;
  $("base").onclick = () => {
    DATA = JSON.parse(JSON.stringify(BASE));
    invalidate();
    render();
  };
  $("csv").onchange = async (e) => {
    let f = e.target.files?.[0];
    if (f) importCSV(await f.text());
    e.target.value = "";
  };
  teams();
  render();
}

init().catch((error) => {
  console.error(error);
  const status = document.getElementById("status");
  if (status) {
    status.textContent = `Could not start the draft board: ${error.message}`;
  }
});
