// Checks the BUILT site (_site/) after `jekyll build`. Run in CI before deploy:
//   node scripts/check-built-site.mjs
// Plan: foil-strategy/ORGS_RENAME_PLAN.md v2. Exits non-zero on any miss.
import { readFileSync, existsSync } from "node:fs";

const fails = [];
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);
const must = (cond, msg) => { if (!cond) fails.push(msg); };

const demo = read("_site/orgs/example-health/index.html");
must(demo, "missing _site/orgs/example-health/index.html");
if (demo) {
  must(demo.includes('data-demo-allowed="1"'), "demo page: data-demo-allowed is not 1");
  must(demo.includes('data-code="NISHINEXUSDEMO"'), "demo page: seat code missing");
  must(/\/scripts\/nexus-join-dom\.js\?v=[0-9a-f]{8}"/.test(demo), "demo page: module URL not versioned");
}

const fwd = read("_site/nexus/example-health/index.html");
must(fwd, "missing forwarder _site/nexus/example-health/index.html");
if (fwd) {
  must(fwd.includes('content="0; url=/orgs/example-health/"'), "forwarder: meta refresh target wrong");
  must(fwd.includes('var target = "/orgs/example-health/";'), "forwarder: script target wrong");
  must(fwd.includes("noindex"), "forwarder: not noindex");
  must(!fwd.includes("data-code") && !fwd.includes("nj-root"), "forwarder: renders a sign-up page");
}

const sitemap = read("_site/sitemap.xml");
must(sitemap, "missing _site/sitemap.xml");
if (sitemap) {
  must(!sitemap.includes("/nexus/"), "sitemap lists /nexus/");
  must(!sitemap.includes("/orgs/example-health/"), "sitemap lists a sponsor page");
}

if (fails.length) {
  for (const f of fails) console.error("::error::" + f);
  process.exit(1);
}
console.log("built-site checks passed");
