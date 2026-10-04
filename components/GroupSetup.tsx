"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function GroupSetup({ displayName }: { displayName: string }) {
  const router = useRouter();
  const [groupName, setGroupName] = useState("Our Goals Game");
  const [inviteCode, setInviteCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function createGroup() {
    setBusy(true);
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.rpc("create_group", { group_name: groupName.trim() || "Goals Game" });

    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    router.refresh();
  }

  async function joinGroup() {
    if (!inviteCode.trim()) return;

    setBusy(true);
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.rpc("join_group", { code: inviteCode.trim() });

    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    router.refresh();
  }

  return (
    <main className="authShell">
      <section className="authCard groupSetupCard">
        <p className="authEyebrow">HEY {displayName.toUpperCase()}</p>
        <h1>Start or join a game.</h1>
        <p className="authIntro">
          Groups can have two players or a whole crew. You can invite more people later.
        </p>

        <div className="groupSetupBlock">
          <h2>Create a group</h2>
          <label>
            Group name
            <input value={groupName} onChange={event => setGroupName(event.target.value)} />
          </label>
          <button className="authPrimary" onClick={createGroup} disabled={busy}>
            Create group
          </button>
        </div>

        <div className="groupDivider"><span>or</span></div>

        <div className="groupSetupBlock">
          <h2>Join a group</h2>
          <label>
            Invite code
            <input
              value={inviteCode}
              onChange={event => setInviteCode(event.target.value.toUpperCase())}
              placeholder="AB12CD34"
              autoCapitalize="characters"
            />
          </label>
          <button className="authSecondary" onClick={joinGroup} disabled={busy || !inviteCode.trim()}>
            Join group
          </button>
        </div>

        {message && <p className="authMessage" role="status">{message}</p>}
      </section>
    </main>
  );
}
