import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await (await b.newContext({ viewport:{width:1440,height:900}, colorScheme:"dark" })).newPage();
await p.goto("http://localhost:5414/settings", { waitUntil: "networkidle" });
console.log(await p.evaluate(() => {
  const el = document.querySelector('input[type=text], input:not([type])');
  return el.outerHTML.slice(0, 200) + " || parentChain: " +
    [el.parentElement?.className, el.parentElement?.parentElement?.className].join(" < ");
}));
await b.close();
