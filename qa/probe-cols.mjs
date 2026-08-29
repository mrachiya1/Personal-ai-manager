import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await (await b.newContext({ viewport:{width:1440,height:1000} })).newPage();
await p.goto("http://localhost:5414/projects", { waitUntil: "networkidle" });
console.log(await p.evaluate(() => {
  const t = document.querySelector("table.pt-table");
  const w = t.closest(".pt-scroll");
  const cells = [...t.querySelectorAll("thead th")].map((th) => ({
    h: th.textContent.trim().slice(0,10), w: Math.round(th.getBoundingClientRect().width),
    min: Math.round(th.scrollWidth),
  }));
  return JSON.stringify({ table: Math.round(t.getBoundingClientRect().width), wrap: w.clientWidth,
    tableStyle: getComputedStyle(t).width, cells }, null, 1);
}));
await b.close();
