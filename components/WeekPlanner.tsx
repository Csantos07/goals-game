"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type PlannerMember = { id: string; displayName: string };
type PlannerStatus = "planning" | "started";
type Plan = {
  id: string;
  starts_on: string;
  status: PlannerStatus;
  started_week_id: string | null;
};
type PlanEntry = {
  id: string;
  plan_id: string;
  title: string;
  entry_type: "idea" | "draft";
  player_id: string | null;
  assigned_by: string | null;
  goal_type: "oneTime" | "daily" | null;
  points: number | null;
  is_selected: boolean;
  updated_at: string;
};

function addDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day + days, 12, 0, 0);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function weekLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const start = new Date(year, month - 1, day, 12, 0, 0);
  const endValue = addDays(value, 6);
  const [endYear, endMonth, endDay] = endValue.split("-").map(Number);
  const end = new Date(endYear, endMonth - 1, endDay, 12, 0, 0);
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short" });
  return start.getMonth() === end.getMonth()
    ? formatter.format(start) + " " + start.getDate() + "–" + end.getDate()
    : formatter.format(start) + " " + start.getDate() + "–" + formatter.format(end) + " " + end.getDate();
}

export default function WeekPlanner({
  groupId,
  currentUserId,
  currentWeekStart,
  members,
  onClose
}: {
  groupId: string;
  currentUserId: string;
  currentWeekStart: string;
  members: PlannerMember[];
  onClose: () => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const targetWeekStart = useMemo(() => addDays(currentWeekStart, 7), [currentWeekStart]);
  const targetWeekLabel = useMemo(() => weekLabel(targetWeekStart), [targetWeekStart]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [idea, setIdea] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadPlan = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const readPlan = async () => supabase
        .from("weekly_plans")
        .select("id, starts_on, status, started_week_id")
        .eq("group_id", groupId)
        .eq("starts_on", targetWeekStart)
        .maybeSingle();

      let result = await readPlan();
      if (result.error) throw result.error;
      let savedPlan = result.data as Plan | null;

      if (!savedPlan) {
        const created = await supabase.from("weekly_plans")
          .insert({ group_id: groupId, starts_on: targetWeekStart, created_by: currentUserId })
          .select("id, starts_on, status, started_week_id")
          .single();

        if (created.error?.code === "23505") {
          result = await readPlan();
          if (result.error) throw result.error;
          savedPlan = result.data as Plan | null;
        } else if (created.error) {
          throw created.error;
        } else {
          savedPlan = created.data as Plan;
        }
      }

      if (!savedPlan) throw new Error("Could not open this week's plan.");
      setPlan(savedPlan);

      const { data, error: entriesError } = await supabase.from("weekly_plan_entries")
        .select("id, plan_id, title, entry_type, player_id, assigned_by, goal_type, points, is_selected, updated_at")
        .eq("plan_id", savedPlan.id)
        .order("created_at", { ascending: true });
      if (entriesError) throw entriesError;
      setEntries((data ?? []) as PlanEntry[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load the weekly plan.");
    } finally {
      setLoading(false);
    }
  }, [currentUserId, groupId, supabase, targetWeekStart]);

  useEffect(() => { void loadPlan(); }, [loadPlan]);

  useEffect(() => {
    if (!plan?.id) return;
    const channel = supabase.channel("weekly-plan-" + plan.id)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "weekly_plan_entries",
        filter: "plan_id=eq." + plan.id
      }, () => { void loadPlan(); })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "weekly_plans",
        filter: "id=eq." + plan.id
      }, () => { void loadPlan(); })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [loadPlan, plan?.id, supabase]);

  async function addIdea(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!plan || plan.status !== "planning" || !idea.trim() || saving) return;
    setSaving(true);
    setError("");
    const { error: insertError } = await supabase.from("weekly_plan_entries").insert({
      plan_id: plan.id,
      title: idea.trim(),
      entry_type: "idea",
      created_by: currentUserId
    });
    if (insertError) setError("Could not add that idea.");
    else {
      setIdea("");
      await loadPlan();
    }
    setSaving(false);
  }

  async function updateEntry(id: string, changes: Partial<PlanEntry>) {
    if (!plan || plan.status !== "planning") return;
    setError("");
    const { error: updateError } = await supabase.from("weekly_plan_entries")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("plan_id", plan.id);
    if (updateError) setError("Could not save that change.");
    else await loadPlan();
  }

  async function makeDraft(entry: PlanEntry) {
    if (!members.some(member => member.id === currentUserId)) return;
    await updateEntry(entry.id, {
      entry_type: "draft",
      player_id: currentUserId,
      assigned_by: currentUserId,
      goal_type: "oneTime",
      points: 50,
      is_selected: true
    });
  }

  async function deleteEntry(id: string) {
    if (!plan || plan.status !== "planning") return;
    const { error: deleteError } = await supabase.from("weekly_plan_entries")
      .delete()
      .eq("id", id)
      .eq("plan_id", plan.id);
    if (deleteError) setError("Could not remove that item.");
    else await loadPlan();
  }

  async function startNextWeek() {
    if (!plan || plan.status !== "planning" || selectedCount === 0 || starting) return;
    setStarting(true);
    setError("");
    setNotice("");
    const { data, error: startError } = await supabase.rpc("start_weekly_plan", {
      target_plan_id: plan.id
    });
    if (startError) {
      setError(startError.message);
    } else {
      setPlan({ ...plan, status: "started", started_week_id: data });
      setNotice("Selected goals are ready for the week of " + targetWeekLabel + ".");
      await loadPlan();
    }
    setStarting(false);
  }

  const ideas = entries.filter(entry => entry.entry_type === "idea");
  const drafts = entries.filter(entry => entry.entry_type === "draft");
  const selectedCount = drafts.filter(entry => entry.is_selected).length;
  const isStarted = plan?.status === "started";

  return (
    <section className="weeklyPlanner" role="dialog" aria-modal="true" aria-labelledby="planner-title">
      <div className="weeklyPlannerInner">
        <button className="plannerBack" type="button" onClick={onClose}>← Back to game</button>

        <header className="plannerHeader">
          <p className="eyebrow">NEXT ITERATION · {targetWeekLabel.toUpperCase()}</p>
          <h2 id="planner-title">Plan next week.</h2>
          <p>Brainstorm together, then shape the ideas into goals for everyone.</p>
        </header>

        {isStarted && (
          <div className="plannerNotice">
            This iteration is ready for {targetWeekLabel}. The current game stays here until the new week begins.
          </div>
        )}

        <form className="plannerIdeaForm" onSubmit={event => void addIdea(event)}>
          <label htmlFor="planner-new-idea">Shared brainstorm</label>
          <div>
            <input
              id="planner-new-idea"
              value={idea}
              onChange={event => setIdea(event.target.value)}
              placeholder="Add an idea to discuss…"
              maxLength={120}
              disabled={loading || isStarted || saving}
            />
            <button type="submit" disabled={loading || isStarted || saving || !idea.trim()}>
              {saving ? "Adding…" : "Add idea"}
            </button>
          </div>
        </form>

        {loading ? (
          <p className="plannerLoading" role="status">Loading the shared plan…</p>
        ) : (
          <>
            <section className="plannerSection" aria-labelledby="planner-ideas-title">
              <div className="plannerSectionHead">
                <div>
                  <h3 id="planner-ideas-title">Ideas</h3>
                  <p>Keep rough thoughts here until you’re ready to make them goals.</p>
                </div>
                <span>{ideas.length}</span>
              </div>
              {ideas.length === 0 ? (
                <p className="plannerEmpty">No ideas yet. Add one above to start brainstorming.</p>
              ) : (
                <ul className="plannerList">
                  {ideas.map(entry => (
                    <li className="plannerIdea" key={entry.id}>
                      <input
                        aria-label="Edit brainstorm idea"
                        defaultValue={entry.title}
                        maxLength={120}
                        key={entry.id + entry.updated_at}
                        disabled={isStarted}
                        onBlur={event => {
                          const value = event.currentTarget.value.trim();
                          if (value && value !== entry.title) void updateEntry(entry.id, { title: value });
                        }}
                      />
                      <button type="button" className="plannerSecondary"
                        onClick={() => void makeDraft(entry)} disabled={isStarted}>
                        Make a goal
                      </button>
                      <button type="button" className="plannerRemove" aria-label={"Remove " + entry.title}
                        onClick={() => void deleteEntry(entry.id)} disabled={isStarted}>×</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="plannerSection" aria-labelledby="planner-drafts-title">
              <div className="plannerSectionHead">
                <div>
                  <h3 id="planner-drafts-title">Draft goals</h3>
                  <p>Choose the player, who set it, the goal type, and points.</p>
                </div>
                <span>{selectedCount} selected</span>
              </div>
              {drafts.length === 0 ? (
                <p className="plannerEmpty">Turn an idea into a goal to start building next week.</p>
              ) : (
                <ul className="plannerDraftList">
                  {drafts.map(entry => {
                    const playerId = entry.player_id ?? currentUserId;
                    const setBy = entry.assigned_by ?? playerId;
                    const otherMembers = members.filter(member => member.id !== playerId);
                    return (
                      <li className="plannerDraft" key={entry.id}>
                        <div className="plannerDraftTop">
                          <input
                            aria-label="Edit draft goal title"
                            defaultValue={entry.title}
                            maxLength={120}
                            key={entry.id + entry.updated_at}
                            disabled={isStarted}
                            onBlur={event => {
                              const value = event.currentTarget.value.trim();
                              if (value && value !== entry.title) void updateEntry(entry.id, { title: value });
                            }}
                          />
                          <label className="plannerSelected">
                            <input type="checkbox" checked={entry.is_selected} disabled={isStarted}
                              onChange={event => void updateEntry(entry.id, { is_selected: event.target.checked })} />
                            <span>Include</span>
                          </label>
                          <button type="button" className="plannerRemove" aria-label={"Remove " + entry.title}
                            onClick={() => void deleteEntry(entry.id)} disabled={isStarted}>×</button>
                        </div>
                        <div className="plannerFields">
                          <label>
                            For
                            <select value={playerId} disabled={isStarted}
                              onChange={event => {
                                const nextPlayer = event.target.value;
                                const nextAssigner = setBy === playerId
                                  ? nextPlayer
                                  : setBy === nextPlayer
                                    ? (members.find(member => member.id !== nextPlayer)?.id ?? nextPlayer)
                                    : setBy;
                                void updateEntry(entry.id, { player_id: nextPlayer, assigned_by: nextAssigner });
                              }}>
                              {members.map(member => <option key={member.id} value={member.id}>{member.displayName}</option>)}
                            </select>
                          </label>
                          <label>
                            Set by
                            <select value={setBy} disabled={isStarted}
                              onChange={event => void updateEntry(entry.id, { assigned_by: event.target.value })}>
                              <option value={playerId}>Self-selected</option>
                              {otherMembers.map(member => (
                                <option key={member.id} value={member.id}>Challenge by {member.displayName}</option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Type
                            <select value={entry.goal_type ?? "oneTime"} disabled={isStarted}
                              onChange={event => {
                                const type = event.target.value as "oneTime" | "daily";
                                void updateEntry(entry.id, { goal_type: type, points: type === "daily" ? 10 : 50 });
                              }}>
                              <option value="oneTime">One-time</option>
                              <option value="daily">Daily</option>
                            </select>
                          </label>
                          <label>
                            Points
                            <input type="number" min="1" max="1000" defaultValue={entry.points ?? 50}
                              key={entry.id + "-points-" + entry.updated_at}
                              disabled={isStarted}
                              onBlur={event => {
                                const value = Number(event.currentTarget.value);
                                if (Number.isInteger(value) && value >= 1 && value <= 1000 && value !== entry.points) {
                                  void updateEntry(entry.id, { points: value });
                                } else if (!Number.isInteger(value) || value < 1 || value > 1000) {
                                  event.currentTarget.value = String(entry.points ?? 50);
                                }
                              }} />
                          </label>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}

        {error && <p className="plannerError" role="alert">{error}</p>}
        {notice && <p className="plannerNotice" role="status">{notice}</p>}

        <footer className="plannerFooter">
          <span>{isStarted ? "Next week has been prepared." : "Only selected draft goals move to next week."}</span>
          <button type="button" className="plannerStart" onClick={() => void startNextWeek()}
            disabled={loading || starting || isStarted || selectedCount === 0}>
            {isStarted ? "Next week is ready" : starting ? "Starting…" : "Start next iteration"}
          </button>
        </footer>
      </div>
    </section>
  );
}
