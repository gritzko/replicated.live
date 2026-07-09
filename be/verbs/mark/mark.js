//  mark — the publication verb: render a StrictMark page to standalone HTML.
//
//    jab mark //journal/wiki/StrictMark.mkd     (from html/) -> wiki/StrictMark.html
//    :mark wiki/StrictMark.mkd                  (in the pager)  same, in $PWD
//
//  Mirrors the input's tree-relative path into $PWD (cwd), rewriting .mkd->.html.
//  The <head>/<body>/footer injects are $PWD's `head.html` / `banner.html` /
//  `footer.html` — the published site's chrome, read from where we write.  Asset
//  links (stylesheet, images) are probed under $PWD and any missing one is WARNED
//  (never fatal).  Pure JS: the render lives in ./render.js.  See [MARK], BE-029.
"use strict";

const render = require("./render.js");

function readFile(p) { return utf8.Decode(io.mmap(p, "r").data()); }
function tryRead(p) { try { return readFile(p); } catch (e) { return ""; } }
function baseName(s) { const i = s.lastIndexOf("/"); return i < 0 ? s : s.slice(i + 1); }
function dirName(s) { const i = s.lastIndexOf("/"); return i <= 0 ? "" : s.slice(0, i); }
function stemOf(s) { const m = /^(.*)\.(mkd|md)$/.exec(s); return m ? m[1] : s; }

function writeFile(p, text) {
  const dir = dirName(p);
  if (dir) io.mkdir(dir);                       // FILEMakeDirP: parents, idempotent
  const bytes = utf8.Encode(text);
  const fd = io.open(p, "c");
  try { const b = io.buf(bytes.length + 8); b.feed(bytes); io.writeAll(fd, b); }
  finally { io.close(fd); }
}

//  Warn (never fail) on a referenced site-absolute asset (`/assets/...`) that is
//  absent under $PWD — the published site root.  Covers the stylesheet + images.
function checkAssets(html, base) {
  const seen = {};
  const re = /(?:href|src)="(\/[^"]*)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const rel = m[1];
    if (rel in seen) continue; seen[rel] = 1;
    if (/^\/\//.test(rel)) continue;            // //host — external, skip
    try { io.stat(base + rel); }
    catch (e) { io.log("mark: warning: asset not found: " + rel + "\n"); }
  }
}

function renderOne(arg) {
  const u = uri._parse(String(arg));
  const authority = u.host || "";               // `//journal` -> "journal"
  const rel = (u.path || String(arg)).replace(/^\/+/, "");   // wiki/StrictMark.mkd
  if (!rel || !/\.(mkd|md)$/.test(rel)) {
    io.log("mark: needs a .mkd/.md path\n  try: mark //name/dir/page.mkd\n");
    throw "MARKARG";
  }
  //  Source tree root: the //authority-scoped repo (be.repo), else SRC_ROOT/name,
  //  else the context wt.  head/body injects + `/...` link probing anchor here.
  const be_ = (typeof be !== "undefined") ? be : null;
  const root = (be_ && be_.repo && be_.repo.wt) ? be_.repo.wt
             : (authority && be_) ? (be_.srcRoot() + "/" + authority)
             : (be_ ? be_.cwd() : io.cwd());
  const srcPath = root + "/" + rel;
  let src;
  try { src = readFile(srcPath); }
  catch (e) { io.log("mark: cannot read " + srcPath + "\n"); throw "MARKARG"; }

  //  head/banner/footer chrome is read from $PWD (the site root we write into),
  //  not the source tree; link .mkd->.html resolution still anchors to `root`.
  const base = io.cwd();
  const opts = {
    head: tryRead(base + "/head.html"),
    body: tryRead(base + "/banner.html"),
    foot: tryRead(base + "/footer.html"),
    root: root,
    exists: function (r) { try { return !!io.stat(root + "/" + r); } catch (e) { return false; } },
  };
  const html = render.renderDoc(src, stemOf(baseName(rel)), opts);

  const outRel = rel.replace(/\.(mkd|md)$/, ".html");
  writeFile(base + "/" + outRel, html);
  io.log("mark: wrote " + outRel + "\n");
  checkAssets(html, base);
}

function mark() {
  const args = Array.prototype.slice.call(arguments).filter(function (a) {
    return a != null && String(a).length && String(a)[0] !== "-";
  });
  if (args.length === 0) { io.log("usage: mark //name/dir/page.mkd ...\n"); throw "MARKARG"; }
  for (let i = 0; i < args.length; i++) renderOne(args[i]);
}

mark.jab = "args";
module.exports = mark;
