# Goals Game

A mobile-first weekly accountability game built around a simple loop:

**GOALS → POINTS → COMPETITION → PROGRESS → WINNER → REWARD → NEXT WEEK**

Goals Game started as a two-player game for Carlo and Lindsey, but the backend is now designed around reusable multiplayer groups so a game can eventually support 2, 3, 4, or more players.

## Live app

Production:

https://goals-game.vercel.app

Stack:

- Next.js 16
- React 19
- TypeScript
- Vercel
- Supabase Auth + Postgres
- PWA metadata / manifest

## Current product state

### Authentication and groups

The app now includes:

- Email/password sign up
- Log in
- Log out
- Supabase-backed sessions
- User profiles
- Create a group
- Join a group with an invite code
- Multiplayer-ready group memberships
- Owner/member roles
- Account + group details inside **Hamburger → Settings**
- Copyable group invite code

The database model is intentionally **not couples-only**. Carlo + Lindsey is simply a two-player group.

### Game board

The game currently includes:

- Carlo / Lindsey player switching in the prototype UI
- Separate **My Goals** and **Partner Challenges**
- One-time goals worth **50 points**
- Daily goals worth **10 points per completed day**
- Monday–Sunday checkoffs
- Automatic score totals and weekly progress
- Goal create, edit, and delete controls
- Weekly pot contributions and winner allocation into the Vacation envelope
- Sunday final scoring with a Monday closeout that remains available until viewed
- Dark / light appearance modes
- Custom accent colors
- Full-screen hamburger navigation
- Sunday closeout / winner celebration
- Slow multicolor confetti
- Custom image backgrounds
- Clear glass/translucent cards that keep the background visible
- Responsive background treatment for mobile and desktop

### Important persistence status

Authentication, profiles, groups, memberships, weeks, goals, completions, weekly contributions, allocations, preferences, backgrounds, and envelope balances are persisted in Supabase.

The game board loads shared group data from Supabase and refreshes on realtime changes. Browser localStorage remains only for legacy import and small client-side fallbacks.

## Weekly game rules

Each goal has two independent properties.

### Who chose it

- **My Goal** — self-selected
- **Challenge** — assigned by another player

The current two-player UI still labels these as Partner Challenges.

### How it scores

- **One-time** — 50 points once completed
- **Daily** — 10 points for each completed day, Monday through Sunday

The original two-player mental model is:

| | One-time | Daily |
| --- | ---: | ---: |
| My Goal | 50 pts | 10/day |
| Partner Challenge | 50 pts | 10/day |

With one goal in each slot, one player has **240 possible points per week**.

## Weekly lifecycle

1. **Weekly setup**
   - create goals and partner challenges
   - record each player's optional contribution to the weekly pot
2. **Monday–Sunday**
   - complete goals and check off daily goals
   - the pot stops accepting contributions after Sunday
3. **After the week ends**
   - the app shows the final scores and winner the first time a player opens the game
   - the sole winner can assign the full pot to the shared Vacation envelope
   - a tie leaves the pot unassigned
   - the result remains available to reopen during the following week

Pot entries and envelope allocations are in-app records. They do not move money between bank accounts.

## Supabase architecture

The live Supabase project uses:

### `profiles`

One profile per authenticated Supabase user.

### `groups`

A reusable game group with:

- name
- invite code
- creator

### `group_members`

Many-to-many membership between profiles and groups.

This is what allows the architecture to support more than two players and eventually lets one account participate in multiple groups.

### `weeks`

A group's weekly game instance.

Includes:

- start date
- end date
- active/closed status
- reward choice
- close timestamp

### `goals`

A weekly goal with:

- player receiving the goal
- user who assigned it
- title
- one-time vs daily scoring type
- points
- completion timestamp

### `goal_completions`

Date-based completion history.

Daily completion is stored by actual calendar date rather than only labels such as Mon/Tue. This prevents completion state from leaking from one week into another.

## Security

Supabase Row Level Security is enabled on every exposed game table.

Access is scoped around authenticated group membership.

Privileged membership helpers live in a non-exposed private schema, public RPC wrappers use security-invoker behavior, and the browser receives only the Supabase **publishable** key — never a service-role/administrator secret.

After the schema was applied, the Supabase security advisor reported **zero security findings**.

## Local browser storage

Legacy prototype data under `goals-game:v1` can be imported into Supabase for accounts that still have it. Current goals, checkoffs, pot contributions, preferences, backgrounds, and Vacation balance are stored in Supabase. Client storage keeps only migration and fallback state.

## Background themes

Custom backgrounds:

- can be uploaded from Settings
- are resized/compressed in the browser
- crop responsively to fill the screen
- can be switched like visual themes
- activate the clear glass treatment
- currently allow up to four browser-local custom backgrounds

The default/no-background theme remains available.

## Money / envelope model

The weekly pot is the sum of the contributions recorded by group members for that week's game. Contributions are optional and do not affect scores.

After the week ends, one sole winner can allocate the full pot to the shared Vacation envelope. Tied weeks are not paid out. Each allocation is saved in `weekly_allocations`, so a week cannot be credited twice. The Vacation balance and contribution history are stored in Supabase.

These are in-app records only; they do not initiate real bank transfers.

## Run locally

```bash
git clone https://github.com/Csantos07/goals-game.git
cd goals-game
npm install
npm run dev
```

Open:

`http://localhost:3000`

Required environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

Only use a Supabase **publishable** key in `NEXT_PUBLIC_` browser variables. Never place a service-role or secret key there.

---

# Version history

This is the product-level history of Goals Game. It intentionally groups small styling commits into meaningful versions.

## v0.1 — Initial prototype

**Key commit:** `f049d84`

Established the Next.js starter and the core idea: turn weekly personal goals into a small competitive game rather than a generic task list.

## v0.2 — Local playable game

**Key commit:** `cc9b871`

Added browser-local persistence so the game could be played and evaluated before building the backend.

This let us iterate quickly on game feel first.

## v0.3 — Envelope / reward concept

**Key commits:** `cd49a17`, `9984bd2`

Introduced the Vacation envelope concept and separated accumulated winnings from the weekly competition itself.

## v0.4 — Full-screen navigation

**Representative commits:** `59266f4`, `d3ced4e`, `78e8d66`, `71f39ed`

Added:

- full-screen hamburger navigation
- floating translucent menu button
- menu-button scroll behavior
- Game / Envelopes navigation
- Settings inside the menu

## v0.5 — Real scoring system

**PR #1**  
**Merged commit:** `9c00b54`

Established the main gameplay rules:

- one-time goals = 50 points
- daily goals = 10 points/day
- Monday–Sunday daily checkoffs
- My Goals vs Partner Challenges
- automatic earned/possible score totals
- add/edit/delete goal workflow

## v0.6 — Sunday closeout

**PR #2**  
**Merged commit:** `86f6e48`

Added the weekly finish:

- automatic first-open Sunday result
- one automatic celebration per browser/week
- manual replay on Sunday
- full-screen winner takeover
- extended multicolor confetti

This completed the first recognizable weekly game loop.

## v0.7 — Responsive image themes

**PR #3**  
**Merged into main:** `2ae30dcc0561fbba260286f73652575b439c2bb1`

Added:

- uploaded custom background images
- selectable background themes
- responsive cover behavior
- mobile and desktop background treatment
- translucent/glass game surfaces

A later refinement made the glass substantially clearer so the selected image remains visually prominent.

## v0.8 — Multiplayer backend model

**Development branch:** `feature/supabase-auth-persistence`

Replaced the earlier couples-specific backend concept with:

**profile → groups → group_members → weeks → goals → goal_completions**

Important architecture decisions:

- no two-player database limit
- a group can support 2+ players
- users can eventually belong to multiple groups
- goals track both the player and the assigning player
- daily completions are date-based

## v0.9 — Supabase Auth + live groups

Connected the app to a real Supabase project and added:

- email/password signup
- login/logout
- SSR-compatible Supabase clients
- Next.js session-refresh proxy
- automatic profile creation
- create-group RPC
- join-by-invite-code RPC
- group membership RLS
- account/group controls in Settings
- copyable invite code
- Vercel environment configuration

Security hardening included:

- RLS on all exposed tables
- private security-definer helpers
- explicit authenticated grants
- publishable browser key only
- Supabase security-advisor verification
- indexes for important foreign keys

## v0.10 — Next: shared live gameplay

The next version should move gameplay itself from localStorage into Supabase.

Planned work:

1. load the authenticated group's members dynamically
2. replace hard-coded Carlo/Lindsey player types
3. create/load the current week's database record
4. persist goal creation/edit/delete
5. persist one-time completion
6. persist daily completion by date
7. calculate scores from shared database state
8. add realtime synchronization between phones
9. add multi-group selection
10. archive/close weeks and create the next one
11. persist reward/envelope transactions
12. eventually move custom backgrounds to Supabase Storage

## v0.11 — Shared persistent gameplay

**Branch:** \`feature/shared-gameplay-persistence\`

Moves the remaining meaningful game state out of browser-only storage and into Supabase.

Added:

- shared weekly goals in Postgres
- shared one-time completions
- date-based daily completions
- realtime score/game refresh between signed-in players
- dynamic group-member scoreboards instead of a two-player-only data model
- shared Vacation envelope balance
- per-user theme and accent preferences
- per-user active-player preference
- per-user Sunday celebration state
- account-synced custom backgrounds
- automatic one-time import of legacy browser-local goals/settings when possible
- RLS policies for preferences, backgrounds, and envelopes

Custom background images are currently stored as compressed data URLs in an RLS-protected user table. This keeps them synced securely with the user's account without directly mutating Supabase Storage metadata. A future optimization can move the binary image payloads to a private Storage bucket while keeping the same UI.

## Known limitations

- visible goal/checkoff gameplay is still localStorage-backed
- the current GameBoard UI is still hard-coded for Carlo and Lindsey
- only the first group membership is currently selected automatically
- no multi-group selector yet
- no realtime gameplay sync yet
- no automatic week archive/reset yet
- no wager transaction ledger yet
- custom backgrounds remain browser-local

## Product principle

Protect the core loop:

**set goals → earn points → compete through the week → see progress → close the week → winner/reward → start again**

If a feature makes Goals Game feel more like a generic todo app and less like a shared game, reconsider it.
