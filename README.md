# Grimaldi cabin watch — complete setup guide

**What this does:** every 30 minutes, a robot checks the Grimaldi Lines website
for your Cagliari → Napoli sailing on **6 September 2026**. The moment a *cabina*
becomes bookable, it sends a message to your phone so you can call Grimaldi and
have it added to your booking.

**Where it runs:** on GitHub's computers, not yours. Your laptop can be closed.
Your phone just receives the message.

**No programming needed.** You will copy and paste text into a website. That's it.
Nothing here requires you to understand the code.

**Time needed:** about 20–30 minutes, once. Then it runs by itself.

**Is it safe?** The robot only *looks* at the page. It never books anything, never
pays, never logs into your Grimaldi account, and never types your personal details.

---

## Before you start

You need three things:

1. **Telegram on your Android phone.** This is the free messaging app the alert
   comes through. If you don't have it, install "Telegram" from the Play Store.
   (Why Telegram and not email or SMS? It's free, instant, and reliable.)
2. **A GitHub account** — free. We'll create it in Part 2.
3. **Your laptop**, for Parts 2–5. Copying long text is painful on a phone.

A quick word on the two "robots" in this guide, so the names don't confuse you:

- **BotFather** — an official Telegram robot that *creates* other robots. You
  talk to him once.
- **Your bot** — the robot BotFather creates for you. This is the one that will
  message you when a cabin appears.

---

# PART 1 — Set up Telegram (do this on your Android phone)

Do this part **on your phone**, because that's where you want the alerts to
arrive and because you'll tap a link that opens the Telegram app.

> **Which account?** Your normal, personal Telegram account — the one already on
> your phone, tied to your own phone number. Do **not** create a new account. The
> "bot" is not an account you log into; it's an automated contact that belongs to
> you and shows up in your chat list like any other contact.

### Step 1.1 — Find BotFather

1. Open **Telegram** on your phone.
2. Tap the **search icon** (magnifying glass, top right).
3. Type: `BotFather`
4. Tap the result named **BotFather** — it must have a **blue verified checkmark**
   next to the name. There are fake copies; the blue check is how you spot the
   real one.
5. Tap **START** at the bottom of the screen.

He'll reply with a long list of commands. You only need one.

### Step 1.2 — Create your bot

1. In that chat, type `/newbot` and send it.
2. He asks for a **name**. This is just a label you'll see in your chat list.
   Type something like: `Grimaldi Cabin Watch`
3. He asks for a **username**. This has stricter rules: it must be unique across
   all of Telegram and **must end in `bot`**. Try something like:
   `gio_grimaldi_cabin_bot`
   If he says it's taken, add numbers until one is accepted:
   `gio_grimaldi_cabin_2026_bot`
4. He replies with a success message containing a line that looks like this:

   ```
   8123456789:AAHk9x-Kd7fQm2LpXyZ3vN8sT1wRbCdEfGh
   ```

   **That long string is your bot token.** Treat it like a password — anyone who
   has it can send messages as your bot.

### Step 1.3 — Save the token somewhere you can reach from your laptop

You'll need to paste it into GitHub later. Easiest safe options:

- Telegram's **Saved Messages** (your own private notes) — tap the token to copy
  it, then send it to Saved Messages. It syncs to Telegram on your laptop.
- Or your password manager.

Don't post it in a public place, don't email it around, and don't paste it into a
chat with me — you'll enter it directly into GitHub yourself.

> If you ever leak it by accident: go back to BotFather, send `/revoke`, pick your
> bot, and he'll issue a new token. The old one stops working.

### Step 1.4 — Say hello to your bot (this step is mandatory)

Telegram bots are **not allowed to message you first**. You have to talk to yours
once, or it can never reach you.

1. In BotFather's success message there's a link like `t.me/gio_grimaldi_cabin_bot`.
   Tap it.
2. Your bot's chat opens. Tap **START**.
3. Type anything — `hi` — and send it.

The bot won't answer. That's normal and expected. It has no brain yet; you've
just opened the door so it can message you later.

### Step 1.5 — Find your chat ID

The bot needs to know *who* to message. That's a number called your chat ID.

1. Open **Chrome on your phone** (or your laptop — either works).
2. Type this address, replacing `<YOUR_TOKEN>` with the token from Step 1.2:

   ```
   https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
   ```

   Note there's no space and no brackets. The word `bot` stays right before your
   token, so it reads like `https://api.telegram.org/bot8123456789:AAHk.../getUpdates`

3. You'll see a wall of text. Look for a part that reads:

   ```
   "chat":{"id":123456789,"first_name":"Gio"
   ```

4. **That number after `"id":` is your chat ID.** Write it down. It's usually 9–10
   digits. It may have a minus sign in front — if so, keep the minus sign.

**If you instead see `{"ok":true,"result":[]}`** — an empty result — it means
Step 1.4 didn't register. Go back, send your bot another message, then reload this
page.

You now have the two things you need: a **bot token** and a **chat ID**.

---

# PART 2 — Create your GitHub account and repository

Switch to your **laptop** now.

**What is GitHub?** Think of it as Google Drive for code — a place to store files.
The useful part for us: it can also *run* those files on a timer, on its own
computers, for free.

**What is a repository?** Just a folder. People shorten it to "repo".

### Step 2.1 — Create the account

1. Go to **https://github.com** and click **Sign up**.
2. Use your personal email, pick a username and password, verify your email.
3. When it asks which plan, choose **Free**.

### Step 2.2 — Create the repository

1. Once logged in, click the **+** in the top-right corner → **New repository**.
2. **Repository name:** `grimaldi-cabin-watch`
3. **Description:** leave blank or write "Ferry cabin watcher".
4. **Public or Private:** choose **Public**. ⚠️ This matters — see the box below.
5. Tick **Add a README file**.
6. Click **Create repository**.

> ### Why Public, and is that safe?
>
> GitHub gives **unlimited free running time to public repositories**, but only
> 2,000 minutes per month to private ones. Checking every 30 minutes uses roughly
> 1,500–3,000 minutes a month, which would exceed the private allowance and could
> start costing money.
>
> **Public is safe here.** Your bot token and chat ID are *not* stored in the
> files — they go in GitHub's separate "Secrets" vault (Part 4), which stays
> private even in a public repo. The code itself contains nothing personal: no
> name, no booking reference, no payment details. Anyone reading it just sees a
> script that checks a ferry timetable.

---

# PART 3 — Add the four files

Your repo currently has one file (the README GitHub made). You'll now add the
real ones by copying and pasting.

**Where do you get the text?** From the four files I gave you in our chat. Open
each one, select all the text, and copy it.

### The four files and their exact names

| # | File name to type | What it is |
|---|---|---|
| 1 | `check.js` | the robot's instructions |
| 2 | `package.json` | list of tools the robot needs |
| 3 | `.github/workflows/cabin-watch.yml` | the timer |
| 4 | `README.md` | this guide (already exists — you'll replace it) |

### Step 3.1 — Add `check.js`

1. On your repo's main page, click **Add file** (near the green Code button) →
   **Create new file**.
2. In the filename box at the top, type exactly: `check.js`
3. Click into the large text area below and **paste the entire contents** of the
   `check.js` file from our chat.
4. Scroll down, click the green **Commit changes** button, then **Commit changes**
   again in the popup.

("Commit" just means "save".)

### Step 3.2 — Add `package.json`

Same process: **Add file → Create new file**, filename `package.json`, paste the
contents, **Commit changes**.

### Step 3.3 — Add the timer file (this one has a trick)

1. **Add file → Create new file**.
2. In the filename box, type this **exactly**, slashes included:

   ```
   .github/workflows/cabin-watch.yml
   ```

   👉 **Watch what happens as you type each `/`** — GitHub automatically turns it
   into a folder. That's intended. You don't create folders separately; typing the
   slashes does it. Note the leading dot on `.github`.

3. Paste the contents of `cabin-watch.yml`.
4. **Commit changes**.

### Step 3.4 — Replace the README

1. Click on `README.md` in your file list.
2. Click the **pencil icon** (Edit) at the top right of the file.
3. Select everything that's there and delete it, then paste this guide in.
4. **Commit changes**.

### Check your work

Your repo's main page should now list:

```
.github/          (folder)
README.md
check.js
package.json
```

If `.github` is missing, redo Step 3.3 — the filename must include the slashes.

---

# PART 4 — Store your Telegram details safely

Now you give GitHub your token and chat ID, in the private vault.

1. In your repo, click **Settings** (top row of tabs, on the right).
2. In the left sidebar, click **Secrets and variables** → **Actions**.
3. Click the green **New repository secret** button.
4. **Name:** `TELEGRAM_BOT_TOKEN` (type it exactly — capitals and underscores matter)
   **Secret:** paste your bot token from Step 1.2
   Click **Add secret**.
5. Click **New repository secret** again.
6. **Name:** `TELEGRAM_CHAT_ID`
   **Secret:** paste your chat ID number from Step 1.5
   Click **Add secret**.

You'll now see both listed. GitHub hides the values permanently — even you can't
read them back, only replace them. That's normal.

> Enter these yourself here. Never paste your token into a chat window, an email,
> or one of the code files.

---

# PART 5 — Switch it on and test it

### Step 5.1 — Enable Actions

1. Click the **Actions** tab at the top of your repo.
2. If you see a green button saying **I understand my workflows, go ahead and
   enable them**, click it. (If you don't see it, it's already on.)

### Step 5.2 — Run it by hand, right now

Don't wait 30 minutes to find out whether it works.

1. Still in the **Actions** tab, click **Grimaldi cabin watch** in the left sidebar.
2. On the right, click **Run workflow** → then the green **Run workflow** button.
3. Wait about 10 seconds and refresh the page. A run appears with a yellow dot
   (running). It takes 1–3 minutes.

### Step 5.3 — Read the result

Click the run, then click the **check** job, then click the step named
**Check cabin availability** to expand its log.

**✅ Green check mark** — it worked. Look for a line like:

```
Offered accommodations: ["Poltrona"]
```

That means the robot successfully reached the accommodations page and found only
a reclining seat — no cabin yet. **This is the expected result today.** The
watcher is now live and will keep checking.

If it says `["Poltrona","Cabina Esterna Superior (2 letti)"]` — a cabin is
available *right now*. Call Grimaldi immediately.

**❌ Red X** — something broke. Don't worry, and don't try to fix the code
yourself. Do this:

1. Click the failed step to see the error message.
2. Scroll to the bottom of the run page — there's a **failure-screenshot** file
   you can download. It's a picture of exactly where the robot got stuck.
3. Send me the error message and that screenshot, and I'll correct it.

Websites change their layout, so a fix or two early on is normal, not a sign
you did something wrong.

### Step 5.4 — Test that the alert actually reaches your phone

A watcher that can't reach you is useless, so let's prove it works. We'll
temporarily tell it to alert on the *seat* instead of the cabin.

1. In your repo, click `check.js`, then the **pencil icon**.
2. Press **Ctrl+F**, search for: `/cabina/i`
   You want the line that reads:
   `const cabins = offered.filter(o => /cabina/i.test(o));`
3. Change that one word: `/cabina/i` → `/poltrona/i`
4. **Commit changes**.
5. Go to **Actions → Grimaldi cabin watch → Run workflow**.
6. Within a couple of minutes, **your phone should buzz** with a Telegram message
   from your bot.

🎉 That's the whole system proven end to end.

7. **Now change it back**: edit `check.js` again, change `/poltrona/i` back to
   `/cabina/i`, and **Commit changes**.

⚠️ Don't skip step 7, or you'll get an alert every 30 minutes for the seat you
already have.

---

# What happens next

The robot now checks roughly every 30 minutes, day and night, on its own.

- **No cabin?** One short "still watching" message each morning, and silence
  otherwise. If that morning message does not arrive, treat it as a warning
  sign and open the Actions tab.
- **Cabin appears?** Your phone buzzes with the cabin name and a reminder to call.
  Call Grimaldi straight away — as you saw on 3 September, these get taken fast.
- **Robot breaks?** It messages you about that too. This is deliberate: a watcher
  that fails silently for three weeks is worse than no watcher at all.

GitHub sometimes delays scheduled runs when it's busy, so the real gap may stretch
to 40–60 minutes occasionally. That's normal and nothing to fix.

---

# Turning it off (do this after you book the cabin)

1. Repo → **Actions** tab → **Grimaldi cabin watch** in the sidebar.
2. Click the **⋯** button (top right) → **Disable workflow**.

Please do turn it off once you're sorted. It's polite to Grimaldi's website, and
it stops pointless alerts.

---

# Changing things later

Everything adjustable lives in `.github/workflows/cabin-watch.yml`. Edit it with
the pencil icon and commit.

| To change | Find this line | Change it to |
|---|---|---|
| Check more often | `INTERVAL_MINUTES: '60'` | e.g. `'30'` or `'15'` |
| Move the heartbeat | `HEARTBEAT_HOUR: '5'` | UTC hour; `'5'` = ~07:00 Dutch time |
| Turn the heartbeat off | `HEARTBEAT_HOUR: '5'` | `HEARTBEAT_HOUR: '-1'` |
| A different date | `DATE: '06092026'` | e.g. `DATE: '10092026'` (ddmmyyyy) |
| ...and its card label | `DAY_LABEL: '6 SET'` | e.g. `DAY_LABEL: '10 SET'` |
| Number of people | `ADULTS: '2'` | e.g. `ADULTS: '3'` |

If you change the date, you must change **both** `DATE` and `DAY_LABEL`, or the
robot will look for the wrong sailing.

Please don't set it below 15 minutes. It gains you very little and risks Grimaldi
blocking the automated visits.

---

# Troubleshooting

**"I never got the test alert in Step 5.4."**
The run was green but nothing arrived → almost always a wrong chat ID, or you
skipped Step 1.4. Redo Step 1.5 and check the number, then update the
`TELEGRAM_CHAT_ID` secret (Settings → Secrets → click the secret → Update).

**"The log says Telegram not configured."**
The secret names don't match exactly. They must be `TELEGRAM_BOT_TOKEN` and
`TELEGRAM_CHAT_ID` — all capitals, underscores, no spaces.

**"I get an alert saying the watcher failed."**
The website layout probably shifted. Send me the error and the failure screenshot.

**"Nothing has run in weeks."**
GitHub pauses scheduled jobs in repos with no activity for 60 days. Over your
six-week window this shouldn't bite, but if it does, any commit wakes it up.

**"I don't understand a step."**
Ask me. Genuinely — tell me which step number and what you're seeing, and I'll
walk you through it. Nothing here is obvious the first time.

---

# One thing worth doing anyway

Next time you call Grimaldi, ask whether they keep a **cabin waitlist** or a
notify-me option for a sold-out sailing. If they do, it beats this entire setup —
they'd call you. This robot is the fallback for when they don't.
