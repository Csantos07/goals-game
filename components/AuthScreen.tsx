"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function AuthScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { display_name: displayName.trim() || email.split("@")[0] }
        }
      });

      setBusy(false);

      if (error) {
        setMessage(error.message);
        return;
      }

      if (!data.session) {
        setMessage("Account created. Check your email to confirm it, then sign in.");
        setMode("signin");
        return;
      }

      router.refresh();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    router.refresh();
  }

  return (
    <main className="authShell">
      <section className="authCard">
        <p className="authEyebrow">GOALS GAME</p>
        <h1>{mode === "signin" ? "Welcome back." : "Create your player."}</h1>
        <p className="authIntro">
          Sign in to keep your weekly game synced across devices and play with your group.
        </p>

        <div className="authTabs" role="tablist" aria-label="Account mode">
          <button
            type="button"
            className={mode === "signin" ? "selected" : ""}
            onClick={() => { setMode("signin"); setMessage(""); }}
          >
            Log in
          </button>
          <button
            type="button"
            className={mode === "signup" ? "selected" : ""}
            onClick={() => { setMode("signup"); setMessage(""); }}
          >
            Sign up
          </button>
        </div>

        <form className="authForm" onSubmit={submit}>
          {mode === "signup" && (
            <label>
              Display name
              <input
                value={displayName}
                onChange={event => setDisplayName(event.target.value)}
                autoComplete="name"
                placeholder="Carlo"
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
              placeholder="••••••••"
            />
          </label>

          {message && <p className="authMessage" role="status">{message}</p>}

          <button className="authPrimary" disabled={busy}>
            {busy ? "Working…" : mode === "signin" ? "Log in" : "Create account"}
          </button>
        </form>
      </section>
    </main>
  );
}
