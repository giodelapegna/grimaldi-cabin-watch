/**
 * Grimaldi Lines cabin watcher.
 *
 * Replays the booking flow for a single sailing and reports which
 * "sistemazioni" (accommodations) are currently offered. Alerts via
 * Telegram when a cabin appears.
 *
 * Config comes from environment variables (see .github/workflows/).
 */

const { chromium } = require('playwright');

const ROUTE = process.env.ROUTE || 'ITCAG-ITNAP';        // Cagliari -> Napoli
const DATE = process.env.DATE || '06092026';             // ddmmyyyy, used in the URL
const DAY_LABEL = process.env.DAY_LABEL || '6 SET';      // how the card is labelled in results
const ADULTS = process.env.ADULTS || '2';
const HEADLESS = process.env.HEADLESS !== 'false';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const URL = `https://booking.grimaldi-lines.com/?l=it&c=GRI&l1=${ROUTE}&d1=${DATE}`;

const log = (...a) => console.log(new Date().toISOString(), ...a);

async function notify(text) {
  if (!BOT_TOKEN || !CHAT_ID) {
    log('WARN: Telegram not configured, printing instead:\n' + text);
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: 'HTML' }),
  });
  if (!res.ok) log('Telegram send failed:', res.status, await res.text());
  else log('Telegram alert sent.');
}

/** Click the first visible element whose text matches `re`. */
async function clickByText(page, selector, re, { timeout = 20000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const handles = await page.$$(selector);
    for (const h of handles) {
      const txt = ((await h.evaluate(e => e.value || e.textContent || '')) || '').trim();
      if (re.test(txt) && (await h.isVisible().catch(() => false))) {
        await h.click({ timeout: 5000 }).catch(() => {});
        return true;
      }
    }
    await page.waitForTimeout(500);
  }
  return false;
}

/** Close cookie banners / promo modals that block the flow. */
async function dismissOverlays(page) {
  await clickByText(page, 'button, a', /continua come ospite/i, { timeout: 3000 });
  await clickByText(page, 'button', /^(close|chiudi|rifiuta|accetta)/i, { timeout: 3000 });
}

async function run() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const ctx = await browser.newContext({
    locale: 'it-IT',
    viewport: { width: 1440, height: 1000 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  try {
    log('Opening', URL);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(4000);
    await dismissOverlays(page);

    // --- Step 1: passengers -------------------------------------------------
    // The form silently drops the passenger count if the modal is confirmed too
    // early, so we verify it stuck and retry before moving on.
    let passengersSet = false;
    for (let attempt = 1; attempt <= 3 && !passengersSet; attempt++) {
      log(`Setting passengers (attempt ${attempt})`);
      await clickByText(page, 'a', /seleziona passeggeri/i);
      await page.waitForTimeout(2500);

      await page.selectOption('#adult', ADULTS).catch(() => {});
      await page.waitForTimeout(800);

      await clickByText(page, 'input, button', /conferma selezione/i);
      await page.waitForTimeout(3000);

      passengersSet = await page.evaluate(() => {
        const t = document.body.innerText;
        return /Adulto/.test(t) && !/Nessuna sistemazione selezionata/.test(t);
      });
      if (!passengersSet) await dismissOverlays(page);
    }
    if (!passengersSet) log('WARN: passenger count may not have registered; continuing anyway.');

    // --- Step 2: run the search --------------------------------------------
    log('Running search');
    await clickByText(page, 'input, button', /^ricerca$/i);
    await page.waitForTimeout(7000);
    await dismissOverlays(page);

    // --- Step 3: pick our sailing ------------------------------------------
    log('Selecting sailing', DAY_LABEL);
    const picked = await page.evaluate((label) => {
      const norm = s => s.replace(/\s+/g, ' ').trim().toUpperCase();
      const target = norm(label);
      const nodes = [...document.querySelectorAll('a, div, li')];
      const card = nodes.find(n => norm(n.textContent).startsWith(target) ||
                                   norm(n.textContent).includes(' ' + target + ' '));
      if (!card) return false;
      const clickable = card.closest('a') || card.querySelector('a') || card;
      clickable.click();
      return true;
    }, DAY_LABEL);
    if (!picked) throw new Error(`Could not find a result card for "${DAY_LABEL}"`);
    await page.waitForTimeout(2500);

    await clickByText(page, 'input, button', /^prosegui$/i);
    await page.waitForTimeout(6000);
    await dismissOverlays(page);

    // --- Step 4: open the accommodations page ------------------------------
    log('Opening accommodations');
    await clickByText(page, 'a, input, button', /scegli sistemazioni/i, { timeout: 25000 });
    await page.waitForTimeout(7000);

    // --- Step 5: read what is on offer -------------------------------------
    const offered = await page.evaluate(() => {
      const heading = [...document.querySelectorAll('a, h1, h2, h3, div')]
        .find(e => /SISTEMAZIONI DISPONIBILI/i.test(e.textContent) && e.textContent.length < 120);
      const scope = heading ? (heading.closest('form') || document.body) : document.body;
      const known = /(poltrona|passaggio ponte|cabina|poltrona vip)/i;
      const names = [...scope.querySelectorAll('a, span, div, label')]
        .filter(e => e.children.length === 0)
        .map(e => e.textContent.replace(/\s+/g, ' ').trim())
        .filter(t => t.length > 2 && t.length < 80 && known.test(t));
      return [...new Set(names)];
    });

    log('Offered accommodations:', JSON.stringify(offered));

    if (!offered.length) {
      throw new Error('Reached the accommodations step but read no options — selectors may need updating.');
    }

    const cabins = offered.filter(o => /cabina/i.test(o));
    if (cabins.length) {
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
    await page.screenshot({ path: 'failure.png', fullPage: true }).catch(() => {});
    // Alert on breakage too — a silently broken watcher is worse than none.
    await notify(
      `⚠️ Grimaldi cabin watcher failed for ${DAY_LABEL}.\n\n` +
      `${err.message}\n\nWorth checking the page manually:\n${URL}`
    );
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();
