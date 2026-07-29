/**
 * Grimaldi Lines cabin watcher (v2).
 *
 * Replays the booking flow for one sailing and reports which "sistemazioni"
 * (accommodations) are offered. Alerts via Telegram when a cabin appears.
 *
 * v2 changes:
 *  - Waits for each page to actually arrive instead of assuming clicks worked,
 *    so it fails at the real point of breakage with a useful message.
 *  - Saves a screenshot + page text at every stage into ./debug for diagnosis.
 *  - Failure alerts are off by default (GitHub emails you about failed runs),
 *    so a broken watcher can't spam your phone every 30 minutes.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROUTE = process.env.ROUTE || 'ITCAG-ITNAP';
const DATE = process.env.DATE || '06092026';
const DAY_LABEL = process.env.DAY_LABEL || '6 SET';
const ADULTS = process.env.ADULTS || '2';
const HEADLESS = process.env.HEADLESS !== 'false';
// One run keeps checking for LOOP_MINUTES, pausing INTERVAL_MINUTES between
// passes. GitHub often drops scheduled triggers, so we lean on the trigger as
// little as possible: one trigger that survives still buys several checks.
const LOOP_MINUTES = Number(process.env.LOOP_MINUTES || 0);
const INTERVAL_MINUTES = Number(process.env.INTERVAL_MINUTES || 60);
// Hour (UTC) at which the daily "still watching" message is sent, so that
// silence becomes meaningful: no heartbeat by mid-morning means something is
// wrong. Set to -1 to switch the heartbeat off.
const HEARTBEAT_HOUR = Number(process.env.HEARTBEAT_HOUR ?? -1);
const ALERT_ON_FAILURE = process.env.ALERT_ON_FAILURE === 'true';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const URL = `https://booking.grimaldi-lines.com/?l=it&c=GRI&l1=${ROUTE}&d1=${DATE}`;
const DEBUG_DIR = path.join(process.cwd(), 'debug');

const log = (...a) => console.log(new Date().toISOString(), ...a);

async function notify(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    log('WARN: Telegram not configured. Message would have been:\n' + text);
    return;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
    });
    log(res.ok ? 'Telegram alert sent.' : `Telegram failed: ${res.status} ${await res.text()}`);
  } catch (e) {
    log('Telegram error:', e.message);
  }
}

/** Screenshot + page text for one stage, so failures are diagnosable. */
async function snap(page, name) {
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    await page.screenshot({ path: path.join(DEBUG_DIR, `${name}.png`), fullPage: true });
    const txt = await page.evaluate(() => document.body.innerText);
    fs.writeFileSync(path.join(DEBUG_DIR, `${name}.txt`), txt);
  } catch (e) {
    log(`(could not save debug snapshot ${name}: ${e.message})`);
  }
}

/**
 * Wait until the page text matches `re`. Returns true/false, never throws.
 *
 * Polls with a fresh evaluate each time rather than page.waitForFunction:
 * when the site navigates (which is exactly what we are waiting for), the
 * injected function's execution context is destroyed and waitForFunction
 * rejects — which previously looked like a failure even though the target
 * page had in fact loaded. Errors mid-poll are ignored and retried.
 */
async function waitForText(page, re, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const txt = await page.evaluate(() => document.body.innerText);
      if (re.test(txt)) return true;
    } catch {
      // Navigation in flight — the context vanished. Wait and look again.
    }
    await page.waitForTimeout(750).catch(() => {});
  }
  return false;
}

/** Close cookie banners, the Grimaldi Club promo, and "Attention" dialogs. */
async function dismissOverlays(page) {
  const patterns = [
    /continua come ospite/i,
    /^\s*(close|chiudi)\s*$/i,
    /(accetta|rifiuta|accept|reject)/i,
  ];
  for (const re of patterns) {
    const el = page.locator('a, button, input[type=button]').filter({ hasText: re }).first();
    if (await el.count().catch(() => 0)) {
      if (await el.isVisible().catch(() => false)) {
        await el.click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(1200);
      }
    }
  }
}

/** Click the first visible match, using real mouse events. */
async function clickText(page, selector, re, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const items = page.locator(selector).filter({ hasText: re });
    const n = await items.count().catch(() => 0);
    for (let i = 0; i < n; i++) {
      const el = items.nth(i);
      if (await el.isVisible().catch(() => false)) {
        await el.scrollIntoViewIfNeeded().catch(() => {});
        if (await el.click({ timeout: 5000 }).then(() => true).catch(() => false)) return true;
      }
    }
    await page.waitForTimeout(600);
  }
  return false;
}

/** Same, but for <input type=submit/button> whose label lives in `value`. */
async function clickInput(page, re, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const handles = await page.$$('input[type=submit], input[type=button], button');
    for (const h of handles) {
      const label = ((await h.evaluate(e => e.value || e.textContent || '')) || '').trim();
      if (re.test(label) && (await h.isVisible().catch(() => false))) {
        await h.scrollIntoViewIfNeeded().catch(() => {});
        if (await h.click({ timeout: 5000 }).then(() => true).catch(() => false)) return true;
      }
    }
    await page.waitForTimeout(600);
  }
  return false;
}

async function checkOnce() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const ctx = await browser.newContext({
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    viewport: { width: 1440, height: 1000 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  let found = false;
  let failed = false;
  let lastOffered = [];

  try {
    // --- Stage 1: load ------------------------------------------------------
    log('Opening', URL);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    await dismissOverlays(page);
    await snap(page, '01-loaded');

    // --- Stage 2: passengers ------------------------------------------------
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      log(`Setting passengers (attempt ${attempt})`);
      await clickText(page, 'a', /seleziona passeggeri/i, 10000);
      await page.waitForTimeout(2500);
      await page.selectOption('#adult', ADULTS).catch(() => {});
      await page.waitForTimeout(1000);
      await clickInput(page, /conferma selezione/i, 10000);
      await page.waitForTimeout(3000);
      await dismissOverlays(page);
      ok = await page.evaluate(() =>
        /Adulto/.test(document.body.innerText) &&
        !/Nessuna sistemazione selezionata/.test(document.body.innerText));
    }
    await snap(page, '02-passengers');
    if (!ok) throw new Error('Passenger count would not stick after 3 attempts (stage 2).');

    // --- Stage 3: search ----------------------------------------------------
    log('Running search');
    if (!await clickInput(page, /^ricerca$/i, 15000)) {
      throw new Error('Could not find the "Ricerca" search button (stage 3).');
    }
    await page.waitForTimeout(3000);
    await dismissOverlays(page);

    // The results only exist once this heading appears. Do not proceed blindly.
    if (!await waitForText(page, /Risultati della ricerca|Risultati/i, 35000)) {
      await snap(page, '03-search-FAILED');
      throw new Error(
        'Search ran but no results appeared (stage 3). ' +
        'Check debug/03-search-FAILED.txt — the site may have shown a validation ' +
        'popup, or there may be no sailing on this date.'
      );
    }
    await dismissOverlays(page);
    await snap(page, '03-results');

    // --- Stage 4: pick our sailing -----------------------------------------
    log('Selecting sailing', DAY_LABEL);
    const dayRe = new RegExp(DAY_LABEL.replace(/\s+/g, '\\s*'), 'i');
    let selected = await clickText(page, 'a', dayRe, 15000);
    if (!selected) selected = await clickText(page, 'div, li', dayRe, 8000);
    if (!selected) {
      await snap(page, '04-sailing-FAILED');
      throw new Error(`No result card matching "${DAY_LABEL}" (stage 4). See debug/04-sailing-FAILED.txt.`);
    }
    await page.waitForTimeout(2500);
    await dismissOverlays(page);
    await snap(page, '04-sailing-selected');

    // --- Stage 5: continue to the quote page --------------------------------
    log('Continuing to quote');
    if (!await clickInput(page, /^prosegui$/i, 20000)) {
      await snap(page, '05-prosegui-FAILED');
      throw new Error('Could not find the "Prosegui" button (stage 5). See debug/05-prosegui-FAILED.png.');
    }
    if (!await waitForText(page, /SELEZIONE PREVENTIVO|sistemazioni e servizi/i, 35000)) {
      await snap(page, '05-quote-FAILED');
      throw new Error('Clicked Prosegui but the quote page never loaded (stage 5).');
    }
    await snap(page, '05-quote');

    // --- Stage 6: open accommodations ---------------------------------------
    log('Opening accommodations');
    if (!await clickText(page, 'a, button, input', /scegli sistemazioni/i, 25000)) {
      await snap(page, '06-open-FAILED');
      throw new Error('Could not find "Scegli sistemazioni e servizi di bordo" (stage 6).');
    }
    if (!await waitForText(page, /SISTEMAZIONI DISPONIBILI/i, 40000)) {
      await snap(page, '06-accommodations-FAILED');
      throw new Error('Accommodations page never rendered (stage 6).');
    }
    await page.waitForTimeout(2500);
    await snap(page, '06-accommodations');

    // --- Stage 7: read what is offered --------------------------------------
    const offered = await page.evaluate(() => {
      const known = /(poltrona|passaggio ponte|cabina|suite)/i;
      return [...new Set(
        [...document.querySelectorAll('a, span, div, label, li')]
          .filter(e => e.children.length === 0)
          .map(e => e.textContent.replace(/\s+/g, ' ').trim())
          .filter(t => t.length > 2 && t.length < 80 && known.test(t))
      )];
    });

    log('Offered accommodations:', JSON.stringify(offered));
    lastOffered = offered;
    if (!offered.length) throw new Error('Reached accommodations but read no options (stage 7).');

    const cabins = offered.filter(o => /cabina|suite/i.test(o));
    if (cabins.length) {
      found = true;
      await notify(
        `🚢 <b>CABIN AVAILABLE</b>\n\n` +
        `Cagliari → Napoli, ${DAY_LABEL} (${ADULTS} adults)\n\n` +
        cabins.map(c => `• ${c}`).join('\n') +
        `\n\n📞 Call Grimaldi now to add it to your booking.\n${URL}`
      );
    } else {
      log('No cabin yet. Currently offered:', offered.join(', '));
    }
  } catch (err) {
    log('ERROR:', err.message);
    await snap(page, '99-failure');
    if (ALERT_ON_FAILURE) {
      await notify(`⚠️ Grimaldi cabin watcher failed for ${DAY_LABEL}.\n\n${err.message}`);
    } else {
      log('(failure alert suppressed — GitHub emails you about failed runs)');
    }
    failed = true;
  } finally {
    await browser.close();
  }
  return { found, failed, offered: lastOffered };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  const deadline = Date.now() + LOOP_MINUTES * 60000;
  let pass = 0;
  let lastFailed = false;

  while (true) {
    pass++;
    if (LOOP_MINUTES > 0) log(`--- pass ${pass} ---`);

    const { found, failed, offered } = await checkOnce();
    lastFailed = failed;

    // Daily heartbeat, on the first pass of whichever run starts in the
    // heartbeat window. Only one run per day begins in that window, so this
    // fires once. The +2h tolerance covers a trigger that GitHub delayed.
    if (pass === 1 && HEARTBEAT_HOUR >= 0) {
      const h = new Date().getUTCHours();
      if (h >= HEARTBEAT_HOUR && h <= HEARTBEAT_HOUR + 2) {
        const status = failed
          ? `⚠️ last check did not complete — see the GitHub run log`
          : `Latest check: ${offered.length ? offered.join(', ') : 'nothing read'}`;
        await notify(
          `☕ <b>Still watching</b>\n\n` +
          `Cagliari → Napoli, ${DAY_LABEL} (${ADULTS} adults)\n` +
          `${status}\n\n` +
          `No cabin yet — you will be messaged the moment one appears.`
        );
      }
    }

    // Stop as soon as a cabin turns up: you have been told, and repeating the
    // same alert every 15 minutes would be noise.
    if (found) {
      log('Cabin found — stopping this run.');
      break;
    }
    if (Date.now() + INTERVAL_MINUTES * 60000 >= deadline) break;

    log(`Sleeping ${INTERVAL_MINUTES} min before the next pass.`);
    await sleep(INTERVAL_MINUTES * 60000);
  }

  log(`Finished after ${pass} pass(es).`);
  if (lastFailed) process.exitCode = 1;   // surface only a trailing failure
}

main();
