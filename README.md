# Goals Game

A mobile-first couples accountability game built around one simple loop:

**GOALS → POINTS → WEEKLY COMPETITION → PROGRESS → WINNER → REWARD → NEXT WEEK**

Goals Game is intentionally meant to feel more like a game between two partners than a traditional task manager.

## Current status

### Production — `main`
The current production build includes:

- Carlo / Lindsey player switching
- Separate **My Goals** and **Partner Challenges**
- One-time goals worth **50 points**
- Daily goals worth **10 points per completed day**
- Monday–Sunday daily checkoffs
- Automatic score totals and weekly progress
- Goal create, edit, and delete controls
- Vacation envelope display
- Dark / light appearance modes
- Custom accent colors
- Full-screen hamburger navigation
- Browser `localStorage` persistence
- PWA metadata / manifest
- Sunday closeout experience
  - first app load on Sunday automatically opens the final result
  - the automatic celebration only runs once per week in that browser
  - the final result can still be replayed manually on Sunday
  - full-screen winner screen with slow multicolor confetti

Production URL:

https://goals-game.vercel.app

### In development — `feature/responsive-game-background`
The active experimental branch adds custom background themes:

- Upload custom background images from Settings
- Keep multiple backgrounds and switch between them like themes
- Default / no-background option
- Remove selected backgrounds
- Images are resized/compressed in the browser before storage
- Up to 4 custom backgrounds in the current prototype
- Responsive `background-size: cover` treatment for mobile and desktop
- Glass/translucent game surfaces only while a custom background is active
- Lighter screen overlay so more of the picture remains visible
- Background choice persists locally

This feature has **not been merged to production yet**.

## Weekly game rules

Each player can have goals with two independent properties.

### Who chose the goal

- **My Goal** — self-selected
- **Partner Challenge** — assigned by the other player

### How it scores

- **One-time** — 50 points once completed
- **Daily** — 10 points for each completed day, Monday through Sunday

The game does not enforce exactly four goals, but the core mental model is:

| | One-time | Daily |
| --- | --- | --- |
| My Goal | 50 pts | 10/day |
| Partner Challenge | 50 pts | 10/day |

With one goal in each slot, a player has **240 possible points per week**.

## Weekly lifecycle

The intended product cadence is:

1. **Sunday / Weekly Setup**
   - choose the coming week's goals
   - assign partner challenges
   - eventually choose the week's wager/reward
2. **Monday–Sunday**
   - complete goals
   - check off daily goals
   - watch the score race
3. **Sunday closeout**
   - determine the winner
   - show the full-screen result celebration
   - eventually resolve the wager/reward
4. **Next week**
   - archive/reset the previous game
   - begin a fresh week

The app currently has the Sunday **result celebration**, but automatic week archival, wager settlement, and creation of the next week are still future work.

## Current example goals

### Carlo

- My Goal / One-time — Monday morning gym
- My Goal / Daily — Wake up at 6:15
- Partner Challenge / One-time — Monday working in the office
- Partner Challenge / Daily — Do something for Nico before work

### Lindsey

- My Goal / One-time — Call Advent
- My Goal / Daily — Nurse once and pump four times
- Partner Challenge / One-time — Monday morning gym
- Partner Challenge / Daily — Pick dinner every night + night routine

These are prototype seed goals. New installs start with no completion state.

## Architecture

### Front end

- Next.js 16
- React 19
- TypeScript
- CSS in `app/globals.css`
- Main game UI in `components/GameBoard.tsx`

### Current persistence

The MVP is still browser-local.

Primary game data is stored under:

`goals-game:v1`

The saved object currently includes:

- goals
- active player
- dark/light mode
- accent color
- Vacation envelope balance

Sunday celebration state is stored separately so the automatic Sunday winner screen only appears once per week in a given browser.

The background-theme branch additionally stores uploaded/compressed image data and the selected background in localStorage.

### Important localStorage limitation

Nothing is synchronized between Carlo and Lindsey yet.

A different:

- browser
- phone
- computer
- private browsing session
- cleared browser storage

can have different game data.

Uploaded backgrounds are also local to that browser. The current implementation is useful for prototyping, but image storage especially should eventually move out of localStorage.

## Supabase status

A starter schema exists at:

`supabase/schema.sql`

It currently defines:

- `couples`
- `profiles`
- `weeks`
- `goals`
- Row Level Security policies scoped around the current user's couple

### Important: review the schema before wiring the app

The schema was created earlier than several current product mechanics and should be treated as a **starter**, not the final production model.

In particular, the current app now needs a database representation for daily completion history. The existing `goals` table only has a single `completed_at` field and does not yet model Monday–Sunday repeat completions.

A likely Supabase model will need either:

- a separate `goal_completions` table keyed by goal + calendar date, or
- another normalized completion model that preserves actual dates

Using actual dates is preferable to storing only labels such as `Mon`, `Tue`, etc., because it prevents completion state from leaking into the next week.

The current project also does **not** yet include Supabase client packages in `package.json`.

## Supabase next phase

When development resumes, the recommended sequence is:

1. Review and update `supabase/schema.sql`
2. Add a date-based daily-completion model
3. Add Supabase dependencies
   - `@supabase/supabase-js`
   - `@supabase/ssr`
4. Configure Supabase environment variables
5. Add authentication
6. Create/join a couple
7. Replace localStorage goal state with Supabase reads/mutations
8. Share the same active week between both partners
9. Move weekly score calculation onto persisted week/completion data
10. Implement real week close/archive/reset behavior
11. Add wager/reward transactions and envelope history
12. Decide where custom background images should live if the theme feature ships
   - Supabase Storage would be a natural option

## Money / envelope model

The **Vacation** envelope currently displays a balance of **$350**.

That balance is **not** the weekly wager.

The intended model is:

- weekly wager = variable amount chosen during weekly setup
- Vacation envelope = accumulated winnings / savings destination

For now, the envelope is display/persistence only. There is not yet a transaction ledger or automatic winner payout.

## Run locally

```bash
git clone https://github.com/Csantos07/goals-game.git
cd goals-game
npm install
npm run dev
```

Open:

`http://localhost:3000`

### Production branch

```bash
git checkout main
git pull
npm run dev
```

### Current background experiment

```bash
git fetch origin
git checkout feature/responsive-game-background
git pull
npm run dev
```

## Release / development history

This is a lightweight project history rather than a record of every small styling commit.

### v0.1 — Initial Goals Game starter

**Commit:** `f049d84`

Established the Next.js prototype and basic Goals Game direction.

### v0.2 — Local game-board persistence

**Key commit:** `cc9b871`

Added browser-local game state so the prototype could be played before a backend was connected.

### v0.3 — Envelope / reward concept

**Key commits:** `cd49a17`, `9984bd2`

Introduced the Vacation envelope concept and began separating accumulated reward money from the weekly competition.

### v0.4 — Navigation redesign

**Representative commits:** `59266f4`, `d3ced4e`, `78e8d66`, `71f39ed`

Moved navigation into the large full-screen hamburger experience, added the translucent floating menu button, scroll-hide behavior, and fixed Game / Envelopes navigation.

### v0.5 — Daily + one-time scoring

**PR #1**  
**Merged commit:** `9c00b54`

Major gameplay milestone:

- one-time goals = 50 points
- daily goals = 10 points/day
- Monday–Sunday checkoffs
- My Goals vs Partner Challenges
- automatic score and possible-point totals
- edit/delete/add goal workflow

### v0.6 — Sunday closeout

**PR #2**  
**Merged commit:** `86f6e48`

Added the production Sunday winner experience:

- automatic first-open Sunday result
- one automatic celebration per browser/week
- manual Sunday replay
- full-screen winner takeover
- extended multicolor confetti
- removal of temporary test/reset tooling before production merge

Also updated Carlo's partner daily challenge to:

**Do something for Nico before work**

### v0.7 — Custom background themes — in development

**Branch:** `feature/responsive-game-background`

Key commits:

- `5572882` — uploadable background themes
- `7176b8f` — responsive background styling
- `9db56b7` — more translucent widgets
- `88ce96d` — clearer glass treatment / lighter image overlay

Current direction:

- custom images behave like selectable themes
- backgrounds adapt to mobile and desktop
- cards become glassy only when an image background is active
- default theme remains unchanged

## Known prototype limitations

- State is local to one browser/device
- No authentication yet
- No partner synchronization yet
- Daily completions are stored as weekday labels instead of actual dates
- No automatic new-week reset/archive yet
- No wager input or transaction history yet
- Vacation balance is not transactional
- Uploaded image themes currently use browser storage
- Background uploads have a small prototype limit to avoid exhausting localStorage

## Product principle

When adding features, protect the core loop:

**set goals → earn points → compete through the week → see progress → close the week → winner/reward → start again**

If a feature makes Goals Game feel more like a generic todo app and less like a shared game, reconsider it.
