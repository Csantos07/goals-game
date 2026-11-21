"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ResetStatus = "checking" | "ready" | "invalid";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<ResetStatus>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && event === "PASSWORD_RECOVERY" && session) {
        setStatus("ready");
      }
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (active) {
        setStatus(!error && data.session ? "ready" : "invalid");
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (password !== confirmPassword) {
      setMessage("Those passwords don't match.");
      return;
    }

    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <main className="authShell">
      <section className="authCard">
        <p className="authEyebrow">GOALS GAME</p>
        <h1>Choose a new password.</h1>
        <p className="authIntro">
          {status === "checking"
            ? "Checking your password reset link…"
            : status === "invalid"
              ? "This reset link is invalid or has expired. Return to log in and request a new one."
              : "Set a new password for your Goals Game account."}
        </p>

        {status === "ready" ? (
          <form className="authForm" onSubmit={submit}>
            <label>
              New password
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
                placeholder="At least 6 characters"
              />
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={6}
                required
                placeholder="Enter it again"
              />
            </label>
            {message && <p className="authMessage" role="status">{message}</p>}
            <button className="authPrimary" disabled={busy}>
              {busy ? "Saving…" : "Save new password"}
            </button>
          </form>
        ) : status === "invalid" ? (
          <a className="authRecoveryLink" href="/">Back to log in</a>
        ) : null}
      </section>
    </main>
  );
}
