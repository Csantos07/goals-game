import GameBoard from "@/components/GameBoard";
import AuthScreen from "@/components/AuthScreen";
import BackendSetup from "@/components/BackendSetup";
import GroupSetup from "@/components/GroupSetup";
import SessionBar from "@/components/SessionBar";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!hasSupabaseConfig()) {
    return <BackendSetup />;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return <AuthScreen />;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile) {
    return (
      <BackendSetup
        signedIn
        message="Supabase Auth is connected, but the Goals Game database schema still needs to be applied."
      />
    );
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("group_members")
    .select("group_id, role, groups(id, name, invite_code)")
    .eq("profile_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1);

  if (membershipError) {
    return (
      <BackendSetup
        signedIn
        message="The account is signed in, but the multiplayer group tables are not ready yet."
      />
    );
  }

  const membership = memberships?.[0];

  if (!membership) {
    return <GroupSetup displayName={profile.display_name} />;
  }

  const groupValue = membership.groups;
  const group = Array.isArray(groupValue) ? groupValue[0] : groupValue;

  const { count: memberCount } = await supabase
    .from("group_members")
    .select("*", { count: "exact", head: true })
    .eq("group_id", membership.group_id);

  return (
    <>
      <SessionBar
        displayName={profile.display_name}
        groupName={group?.name ?? "Goals Game"}
        inviteCode={group?.invite_code ?? ""}
        memberCount={memberCount ?? 1}
      />
      <GameBoard />
    </>
  );
}
