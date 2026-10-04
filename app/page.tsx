import GameBoard from "@/components/GameBoard";
import AuthScreen from "@/components/AuthScreen";
import BackendSetup from "@/components/BackendSetup";
import GroupSetup from "@/components/GroupSetup";
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
    .select("group_id, role, joined_at, groups(id, name, invite_code)")
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

  const { data: memberRows, error: memberError } = await supabase
    .from("group_members")
    .select("profile_id, joined_at")
    .eq("group_id", membership.group_id)
    .order("joined_at", { ascending: true });

  if (memberError) {
    return (
      <BackendSetup
        signedIn
        message="Your group exists, but its player list could not be loaded."
      />
    );
  }

  const memberIds = (memberRows ?? []).map(member => member.profile_id);
  const { data: memberProfiles, error: memberProfileError } = memberIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", memberIds)
    : { data: [], error: null };

  if (memberProfileError) {
    return (
      <BackendSetup
        signedIn
        message="Your group exists, but its player profiles could not be loaded."
      />
    );
  }

  const profileById = new Map(
    (memberProfiles ?? []).map(member => [member.id, member.display_name])
  );

  const members = (memberRows ?? [])
    .map(member => ({
      id: member.profile_id,
      displayName: profileById.get(member.profile_id) ?? "Player"
    }));

  return (
    <GameBoard
      currentUserId={user.id}
      displayName={profile.display_name}
      groupId={membership.group_id}
      groupName={group?.name ?? "Goals Game"}
      inviteCode={group?.invite_code ?? ""}
      members={members}
    />
  );
}
