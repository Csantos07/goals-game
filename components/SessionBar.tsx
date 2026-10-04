"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SessionBar({
  displayName,
  groupName,
  inviteCode,
  memberCount
}: {
  displayName: string;
  groupName: string;
  inviteCode: string;
  memberCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function signOut() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  async function copyInviteCode() {
    if (!inviteCode || !navigator.clipboard) return;
    await navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className="accountSettings">
      <div className="accountSettingsHead">
        <div>
          <span>Account & group</span>
          <small>Signed in as {displayName}</small>
        </div>
        <small>{memberCount} player{memberCount === 1 ? "" : "s"}</small>
      </div>

      <div className="accountGroupCard">
        <div>
          <small>GROUP</small>
          <strong>{groupName}</strong>
        </div>

        {inviteCode && (
          <button className="inviteCodeButton" onClick={copyInviteCode} type="button">
            <span>
              <small>INVITE CODE</small>
              <code>{inviteCode}</code>
            </span>
            <b>{copied ? "Copied" : "Copy"}</b>
          </button>
        )}
      </div>

      <button className="logoutButton" onClick={signOut} disabled={busy} type="button">
        {busy ? "Logging out…" : "Log out"}
      </button>
    </section>
  );
}
