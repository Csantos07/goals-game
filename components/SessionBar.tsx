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

  async function signOut() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  return (
    <div className="sessionBar">
      <div>
        <strong>{displayName}</strong>
        <span>{groupName} · {memberCount} player{memberCount === 1 ? "" : "s"}</span>
      </div>
      <div className="sessionBarActions">
        {inviteCode && <code title="Group invite code">{inviteCode}</code>}
        <button onClick={signOut} disabled={busy}>
          {busy ? "Logging out…" : "Log out"}
        </button>
      </div>
    </div>
  );
}
