# Goals Game

A mobile-first prototype of the couples goal game: set weekly goals, attach points, complete goals, watch the score, and close the week.

## What works right now
- Mobile game-board UI
- Carlo/Lindsey player switching
- One-time and daily goal scoring
- Separate My Goals and Partner Challenges
- Edit and delete goal controls
- Automatic point totals and weekly progress
- Dark/light theme toggle and custom accent colors
- Browser localStorage persistence for goals, checkoffs, active player, and theme
- PWA manifest
- Supabase-ready schema + RLS policies

The current prototype saves locally in the browser so the game can be tested before wiring shared persistence/auth with Supabase.

## Run it
```bash
npm install
npm run dev
```
Open http://localhost:3000.

## Connect Supabase next
1. Create a Supabase project.
2. Run `supabase/schema.sql` in its SQL editor.
3. Add Supabase Auth and `@supabase/ssr`.
4. Replace browser-local state with queries/mutations against `weeks` and `goals`.
5. Add couple invitation/onboarding.
6. Deploy to Vercel.

Current Supabase guidance for Next.js uses cookie-based auth with `@supabase/ssr`; use the current official quickstart when wiring auth.

## Product rule
Keep the heart of the game intact:
**set goals → assign points → play the week → track the race → close the week → winner/reward → new week.**
