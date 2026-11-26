"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "forgot";

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

    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`
      });

      setBusy(false);

      if (error) {
        setMessage("We couldn't send the reset email. Please try again.");
        return;
      }

      setMessage("If an account exists for that email, a password reset link has been sent. Check your inbox.");
      return;
    }

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

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setMessage("");
    setPassword("");
  }

  const isForgotMode = mode === "forgot";

  return (
    <main className="authShell">
      <section className="authCard">
        <p className="authEyebrow">GOALS GAME</p>
        <h1>{isForgotMode ? "Reset your password." : mode === "signin" ? "Welcome back." : "Create your player."}</h1>
        <p className="authIntro">
          {isForgotMode
            ? "Enter the email address for your account and we'll send you a secure reset link."
            : "Sign in to keep your weekly game synced across devices and play with your group."}
        </p>

        {isForgotMode ? (
          <button className="authRecoveryLink authBackLink" type="button" onClick={() => changeMode("signin")}>
            Back to log in
          </button>
        ) : (
          <div className="authTabs" role="tablist" aria-label="Account mode">
            <button
              type="button"
              className={mode === "signin" ? "selected" : ""}
              onClick={() => changeMode("signin")}
            >
              Log in
            </button>
            <button
              type="button"
              className={mode === "signup" ? "selected" : ""}
              onClick={() => changeMode("signup")}
            >
              Sign up
            </button>
          </div>
        )}

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

          {mode !== "forgot" && (
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
          )}

          {message && <p className="authMessage" role="status">{message}</p>}

          <button className="authPrimary" disabled={busy}>
            {busy
              ? "Working…"
              : isForgotMode
                ? "Send reset link"
                : mode === "signin"
                  ? "Log in"
                  : "Create account"}
          </button>

          {mode === "signin" && (
            <button className="authRecoveryLink" type="button" onClick={() => changeMode("forgot")}>
              Forgot password?
            </button>
          )}
        </form>
      </section>
    </main>
  );
}
