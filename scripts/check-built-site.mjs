// Checks the BUILT site (_site/) after `jekyll build`. Run in CI before deploy:
//   node scripts/check-built-site.mjs
// Plan: foil-strategy/ORGS_RENAME_PLAN.md v2. Exits non-zero on any miss.
import { readFileSync, existsSync, readdirSync } from "node:fs";

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

// The public sales page and its header link (every page whose header lists links).
const sales = read("_site/orgs/index.html");
must(sales, "missing _site/orgs/index.html");
if (sales) {
  must(sales.includes('<link rel="canonical" href="https://meetnishi.com/orgs/">'), "sales page: canonical");
  must(!/\$\d/.test(sales.replace(/<script[\s\S]*?<\/script>/g, "")), "sales page: shows a price");
  must(!/nexus/i.test(sales.replace(/<script[\s\S]*?<\/script>|<!--[\s\S]*?-->|<style[\s\S]*?<\/style>/g, "")), "sales page: says Nexus");
}
if (sitemap) must(sitemap.includes("<loc>https://meetnishi.com/orgs/</loc>"), "sitemap: sales page missing");
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(d + "/" + e.name) : [d + "/" + e.name]);
let navPages = 0;
for (const f of walk("_site").filter((f) => f.endsWith(".html"))) {
  const html = readFileSync(f, "utf8");
  const nav = (html.match(/<ul class="nav-links">([\s\S]*?)<\/ul>/) || [])[1];
  if (!nav || !nav.includes("<li")) continue; // app-flow pages have an empty header on purpose
  navPages++;
  must(nav.includes('href="/orgs/"'), `${f}: header has no For organizations link`);
  // Story lives in the footer only (founder decision 2026-11-03); Labs takes its header slot.
  must(!/story\.html/.test(nav), `${f}: header lists Story (footer only)`);
  const drawer = (html.match(/<div class="nav-drawer"[^>]*>\s*<ul>([\s\S]*?)<\/ul>/) || [])[1] || "";
  must(!/story\.html/.test(drawer), `${f}: mobile menu lists Story (footer only)`);
  must(/story\.html/.test(html.slice(html.lastIndexOf("<footer"))), `${f}: footer lost its Story link`);
}
must(navPages >= 15, `only ${navPages} pages with a header menu; the scan went vacuous`);

// Founder photo removed from the site at the founder's request (2026-11-09).
must(!existsSync("_site/assets/founder.jpg"), "founder photo is published");
must(!/founder\.jpg|class="founder-photo"/.test(read("_site/story.html") || ""), "Story page shows the founder photo");

// [hidden] must beat class display rules, site-wide and on the sales page (form success state).
must(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/.test(read("_site/styles/main.css") || ""), "main.css lacks the [hidden] rule");
if (sales) must(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/.test(sales), "sales page lacks the [hidden] rule");

if (fails.length) {
  for (const f of fails) console.error("::error::" + f);
  process.exit(1);
}
console.log("built-site checks passed");
