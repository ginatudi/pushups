// Challenge widget for Scriptable. Loaded by the short loader script.
// Shows the team total, your own progress, and today's target.
const DB = "https://pushups-2a3c6-default-rtdb.firebaseio.com";
const SITE = "https://ginatudi.github.io/pushups/";
const GOALS = { pushups: 2000, situps: 2000 };
const EXS = ["pushups", "situps"];

const BG1 = new Color("#0B1226"), BG2 = new Color("#070A12");
const BLUE = new Color("#5B8CFF"), PURPLE = new Color("#8B6CFF"), GOOD = new Color("#4ADE9A");
const INK = new Color("#F1F5FF"), MUTED = new Color("#93A1BC"), TRACK = new Color("#222C42");

const fmt = (n) => Math.round(n).toLocaleString("en-US");

function monthInfo() {
  const d = new Date();
  const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const mk = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  return { d, mk, day: d.getDate(), dim, left: dim - d.getDate() + 1 };
}

async function getJSON(path) {
  try { const r = new Request(DB + path); r.timeoutInterval = 15; return await r.loadJSON(); }
  catch (e) { return null; }
}

async function loadData() {
  const M = monthInfo();
  const [counts, roster, log] = await Promise.all([
    getJSON("/counts/" + M.mk + ".json"),
    getJSON("/roster.json"),
    getJSON("/log/" + M.mk + ".json?orderBy=%22%24key%22&limitToLast=1000"),
  ]);
  if (!counts && !roster) return null;
  const c = counts || {}, r = roster || {}, l = log || {};
  const data = { M, counts: { pushups: c.pushups || {}, situps: c.situps || {} }, roster: { pushups: r.pushups || {}, situps: r.situps || {} }, log: [], cheers: [] };
  Object.keys(l).sort().forEach((k) => {
    const e = l[k];
    if (!e || typeof e.t !== "number" || typeof e.name !== "string") return;
    if (typeof e.msg === "string" && typeof e.to === "string") data.cheers.push({ from: e.name, to: e.to, msg: e.msg, t: e.t });
    else if (typeof e.n === "number" && EXS.indexOf(e.ex) > -1) data.log.push(e);
  });
  return data;
}

function build(data) {
  const names = {};
  EXS.forEach((e) => Object.keys(data.roster[e]).forEach((k) => (names[k] = 1)));
  const members = (k) => EXS.filter((e) => data.roster[e][k]);
  const isOut = (k) => { const m = members(k); return m.length > 0 && m.every((e) => data.roster[e][k].out === true); };
  const cnt = (k, e) => Number((data.counts[e] || {})[k]) || 0;
  const pGoal = (k) => members(k).reduce((s, e) => s + GOALS[e], 0);
  const pCounted = (k) => members(k).reduce((s, e) => s + Math.min(cnt(k, e), GOALS[e]), 0);
  const active = Object.keys(names).filter((k) => members(k).length && !isOut(k));
  let goal = 0, counted = 0;
  active.forEach((k) => { goal += pGoal(k); counted += pCounted(k); });
  const M = data.M;
  const expected = goal * M.day / M.dim;
  const diff = Math.round(counted - expected);
  const need = Math.ceil(Math.max(0, goal - counted) / M.left);
  const board = active.map((k) => ({ name: k, pct: pGoal(k) ? pCounted(k) / pGoal(k) : 0, counted: pCounted(k) }))
    .sort((a, b) => b.counted - a.counted || a.name.localeCompare(b.name));
  return { names, members, active, goal, counted, diff, need, board, pGoal, pCounted, M, data, isOut };
}

function mine(T, me) {
  if (!me) return null;
  const key = Object.keys(T.names).find((k) => k.toLowerCase() === me.toLowerCase());
  if (!key || !T.members(key).length) return null;
  const M = T.M;
  const today = M.d.toDateString();
  let todayReps = 0;
  const days = {};
  T.data.log.forEach((e) => {
    if (e.name !== key || !T.data.roster[e.ex][key]) return;
    const dt = new Date(e.t);
    days[dt.getDate()] = 1;
    if (dt.toDateString() === today) todayReps += e.n;
  });
  const g = T.pGoal(key), c = T.pCounted(key);
  const d = Math.min(c, todayReps);
  const r0 = Math.max(0, g - (c - d));
  const need = r0 > 0 ? Math.ceil(r0 / M.left) : 0;
  const toGo = Math.max(0, need - d);
  let day = M.day, streak = 0;
  if (!days[day]) day--;
  while (day >= 1 && days[day]) { streak++; day--; }
  const cheer = T.data.cheers.filter((x) => x.to.toLowerCase() === key.toLowerCase()).pop() || null;
  return { name: key, g, c, pct: g ? c / g : 0, need, toGo, done: g > 0 && c >= g, out: T.isOut(key), streak, cheer };
}

function barImage(w, h, frac, paceFrac, color) {
  const dc = new DrawContext();
  dc.size = new Size(w, h);
  dc.opaque = false;
  dc.respectScreenScale = true;
  const p1 = new Path(); p1.addRoundedRect(new Rect(0, 0, w, h), h / 2, h / 2);
  dc.addPath(p1); dc.setFillColor(TRACK); dc.fillPath();
  const fw = Math.max(h, Math.min(1, frac) * w);
  if (frac > 0) {
    const p2 = new Path(); p2.addRoundedRect(new Rect(0, 0, fw, h), h / 2, h / 2);
    dc.addPath(p2); dc.setFillColor(color); dc.fillPath();
  }
  if (paceFrac != null) {
    dc.setFillColor(INK);
    dc.fillRect(new Rect(Math.max(0, Math.min(w - 2, paceFrac * w - 1)), 0, 2, h));
  }
  return dc.getImage();
}

function txt(stack, s, size, color, weight) {
  const t = stack.addText(String(s));
  t.font = weight === "heavy" ? Font.heavyRoundedSystemFont(size) : weight === "bold" ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.6;
  return t;
}

function teamBlock(parent, T, w) {
  const col = parent.addStack(); col.layoutVertically();
  txt(col, "TEAM", 11, MUTED, "bold");
  col.addSpacer(2);
  txt(col, fmt(T.counted), w < 150 ? 34 : 40, INK, "heavy");
  txt(col, "of " + fmt(T.goal) + " · " + T.active.length + (T.active.length === 1 ? " person" : " people"), 11, MUTED);
  col.addSpacer(6);
  const im = col.addImage(barImage(300, 14, T.goal ? T.counted / T.goal : 0, T.goal ? T.M.day / T.M.dim : null, BLUE));
  im.imageSize = new Size(w, Math.round(w * 14 / 300));
  col.addSpacer(6);
  if (T.counted >= T.goal && T.goal > 0) txt(col, "Team goal reached", 12, GOOD, "bold");
  else if (T.diff >= 0) txt(col, fmt(T.diff) + " ahead of pace", 12, GOOD, "bold");
  else txt(col, fmt(-T.diff) + " behind pace", 12, PURPLE, "bold");
  return col;
}

function meBlock(parent, m, w) {
  const col = parent.addStack(); col.layoutVertically();
  txt(col, "YOU", 11, MUTED, "bold");
  col.addSpacer(2);
  if (!m) { txt(col, "Pick your name", 15, INK, "bold"); txt(col, "Open Scriptable and run the script once.", 11, MUTED).lineLimit = 3; return col; }
  txt(col, Math.floor(m.pct * 100) + "%", 40, INK, "heavy");
  txt(col, fmt(m.c) + " of " + fmt(m.g), 11, MUTED);
  col.addSpacer(6);
  const im = col.addImage(barImage(300, 14, m.pct, null, PURPLE));
  im.imageSize = new Size(w, Math.round(w * 14 / 300));
  col.addSpacer(6);
  if (m.out) txt(col, "Marked out", 12, MUTED, "bold");
  else if (m.done) txt(col, "Goal complete", 12, GOOD, "bold");
  else if (m.toGo > 0) txt(col, fmt(m.toGo) + " to go today", 12, INK, "bold");
  else txt(col, "Done for today", 12, GOOD, "bold");
  return col;
}

function boardBlock(parent, T, w, rows) {
  const col = parent.addStack(); col.layoutVertically();
  txt(col, "LEADERBOARD", 11, MUTED, "bold");
  col.addSpacer(4);
  T.board.slice(0, rows).forEach((p, i) => {
    const row = col.addStack(); row.centerAlignContent();
    const nm = txt(row, (i + 1) + "  " + p.name, 13, INK, "bold");
    row.addSpacer();
    txt(row, Math.floor(p.pct * 100) + "%", 13, p.pct >= 1 ? GOOD : MUTED, "bold");
    const im = col.addImage(barImage(300, 8, p.pct, T.M.day / T.M.dim, BLUE));
    im.imageSize = new Size(w, Math.round(w * 8 / 300));
    col.addSpacer(5);
  });
}

async function makeWidget(family, me) {
  const w = new ListWidget();
  const g = new LinearGradient();
  g.colors = [BG1, BG2]; g.locations = [0, 1];
  w.backgroundGradient = g;
  w.url = SITE;
  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  const data = await loadData();
  if (!data) {
    w.addSpacer();
    txt(w, "Can't reach the counter", 14, INK, "bold");
    txt(w, "Will try again soon.", 11, MUTED);
    w.addSpacer();
    return w;
  }
  const T = build(data);
  const m = mine(T, me);
  w.setPadding(14, 16, 14, 16);
  if (family === "small") {
    teamBlock(w, T, 120);
    if (m) { w.addSpacer(4); txt(w, "You " + Math.floor(m.pct * 100) + "%", 12, INK, "bold"); }
  } else {
    const top = w.addStack(); top.topAlignContent();
    const inner = family === "large" ? 140 : 135;
    teamBlock(top, T, inner);
    top.addSpacer();
    const div = top.addStack(); div.size = new Size(1, family === "large" ? 100 : 100); div.backgroundColor = TRACK;
    top.addSpacer();
    meBlock(top, m, inner);
    if (family === "large") {
      w.addSpacer(14);
      boardBlock(w, T, 300, 6);
      if (m && m.cheer && Date.now() - m.cheer.t < 36 * 3600 * 1000) {
        w.addSpacer(4);
        txt(w, m.cheer.from + ": " + m.cheer.msg, 12, PURPLE, "bold");
      }
    } else if (m && m.streak >= 2) {
      w.addSpacer(6);
      txt(w, m.streak + "-day streak", 11, GOOD, "bold");
    }
  }
  return w;
}

async function pickName() {
  const data = await loadData();
  const names = data ? Object.keys(build(data).names).sort() : [];
  const a = new Alert();
  a.title = "Who are you?";
  a.message = names.length ? "Pick your name for your widget." : "Type your name.";
  names.forEach((n) => a.addAction(n));
  if (!names.length) { a.addTextField("Your name"); a.addAction("Save"); }
  a.addCancelAction("Cancel");
  const i = await a.presentSheet();
  if (i < 0) return null;
  const name = names.length ? names[i] : a.textFieldValue(0);
  if (name) Keychain.set("pushups_name", name);
  return name || null;
}

let me = (args.widgetParameter || "").trim();
if (!me && Keychain.contains("pushups_name")) me = Keychain.get("pushups_name");
if (!me && !config.runsInWidget) me = await pickName();

const family = config.widgetFamily || "medium";
const widget = await makeWidget(family, me);
if (config.runsInWidget) Script.setWidget(widget);
else {
  if (family === "small") await widget.presentSmall();
  else if (family === "large") await widget.presentLarge();
  else await widget.presentMedium();
}
Script.complete();
