"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import SessionBar from "@/components/SessionBar";
import { createClient } from "@/lib/supabase/client";

type AssignedBy = "self" | "challenge";
type GoalType = "oneTime" | "daily";
type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
type ThemeMode = "dark" | "light";

type Member = {
  id: string;
  displayName: string;
};

type BackgroundTheme = {
  id: string;
  name: string;
  dataUrl: string;
  isPrivate: boolean;
};

type Goal = {
  id: string;
  playerId: string;
  assignedById: string;
  title: string;
  type: GoalType;
  points: number;
  done: boolean;
  dailyDone: DayKey[];
};

type LegacyGoal = {
  id: number;
  player: string;
  title: string;
  assignedBy: "self" | "partner";
  type: GoalType;
  done: boolean;
  dailyDone: DayKey[];
};

const DAYS: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ONE_TIME_POINTS = 50;
const DAILY_POINTS = 10;
const ACCENTS = ["#c9ff54", "#8b5cf6", "#38bdf8", "#fb7185", "#f59e0b", "#22c55e"];
const LEGACY_STORAGE_KEY = "goals-game:v1";
const LEGACY_SUNDAY_KEY = "goals-game:last-sunday-celebration";
const LEGACY_BACKGROUNDS_KEY = "goals-game:backgrounds:v1";
const LEGACY_SELECTED_BACKGROUND_KEY = "goals-game:selected-background:v1";
const LAST_PUBLIC_BACKGROUND_KEY = "goals-game:last-public-background:v1";
const MIGRATION_KEY = "goals-game:supabase-migrated:v1";
const MAX_BACKGROUND_THEMES = 4;
const MAX_PRIVATE_BACKGROUND_THEMES = 8;
const PRIVATE_THEMES_EMAIL = "rcarlosantos89@gmail.com";
const PRIVATE_THEMES_HOLD_MS = 3000;
const PRIVATE_THEME_REVEAL_HOLD_MS = 2000;

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function parseLocalDate(value: string) {
  const parts = value.split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
}

function getWeekStart() {
  const now = new Date();
  const jsDay = now.getDay();
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(now);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(now.getDate() + diffToMonday);
  return formatLocalDate(monday);
}

function addDays(value: string, days: number) {
  const date = parseLocalDate(value);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

function getCurrentDayKey(): DayKey {
  const jsDay = new Date().getDay();
  return DAYS[(jsDay + 6) % 7];
}

function getWeekLabel(weekStart: string) {
  const monday = parseLocalDate(weekStart);
  const sunday = parseLocalDate(addDays(weekStart, 6));
  const month = new Intl.DateTimeFormat("en-US", { month: "short" });
  const sameMonth = monday.getMonth() === sunday.getMonth();

  return sameMonth
    ? month.format(monday) + " " + monday.getDate() + "–" + sunday.getDate()
    : month.format(monday) + " " + monday.getDate() + "–" + month.format(sunday) + " " + sunday.getDate();
}

function dateForDay(weekStart: string, day: DayKey) {
  return addDays(weekStart, DAYS.indexOf(day));
}

function dayForDate(weekStart: string, date: string): DayKey | null {
  const index = DAYS.findIndex(day => dateForDay(weekStart, day) === date);
  return index >= 0 ? DAYS[index] : null;
}

function earnedPoints(goal: Goal) {
  return goal.type === "oneTime"
    ? goal.done ? goal.points : 0
    : goal.dailyDone.length * goal.points;
}

function possiblePoints(goal: Goal) {
  return goal.type === "oneTime" ? goal.points : DAYS.length * goal.points;
}

function contrastText(hex: string) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return "#10120c";
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#10120c" : "#ffffff";
}

function compressBackground(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.onload = () => {
      const image = new Image();

      image.onerror = () => reject(new Error("That image format could not be loaded."));
      image.onload = () => {
        const maxDimension = 1600;
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Could not prepare that background."));
          return;
        }

        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };

      image.src = String(reader.result);
    };

    reader.readAsDataURL(file);
  });
}

export default function GameBoard({
  currentUserId,
  displayName,
  groupId,
  groupName,
  inviteCode,
  members
}: {
  currentUserId: string;
  displayName: string;
  groupId: string;
  groupName: string;
  inviteCode: string;
  members: Member[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const weekStart = useMemo(() => getWeekStart(), []);
  const weekLabel = useMemo(() => getWeekLabel(weekStart), [weekStart]);
  const today = getCurrentDayKey();
  const isSunday = new Date().getDay() === 0;
  const migrationAttempted = useRef(false);
  const privateThemesHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const privateThemeRevealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [weekId, setWeekId] = useState<string | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [activeProfileId, setActiveProfileId] = useState(currentUserId);
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [assignedBy, setAssignedBy] = useState<AssignedBy>("self");
  const [challengeAssignerId, setChallengeAssignerId] = useState(currentUserId);
  const [goalType, setGoalType] = useState<GoalType>("oneTime");
  const [showMenu, setShowMenu] = useState(false);
  const [menuButtonVisible, setMenuButtonVisible] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showEnvelopes, setShowEnvelopes] = useState(false);
  const [showWeekResult, setShowWeekResult] = useState(false);
  const [potCents, setPotCents] = useState(0);
  const [potInput, setPotInput] = useState("");
  const [potError, setPotError] = useState("");
  const [allocating, setAllocating] = useState(false);
  const [allocatedCents, setAllocatedCents] = useState(0);
  const [allocationNotice, setAllocationNotice] = useState("");
  const [potReady, setPotReady] = useState(false);
  const [currentContributions, setCurrentContributions] = useState<Array<{ profile_id: string; amount_cents: number }>>([]);
  const [settlementContributions, setSettlementContributions] = useState<Array<{ profile_id: string; amount_cents: number }>>([]);

  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [accent, setAccent] = useState("#c9ff54");
  const [vacationBalance, setVacationBalance] = useState(350);
  const [backgrounds, setBackgrounds] = useState<BackgroundTheme[]>([]);
  const [privateBackgrounds, setPrivateBackgrounds] = useState<BackgroundTheme[]>([]);
  const [privateThemesUnlocked, setPrivateThemesUnlocked] = useState(false);
  const [privateThemeSessionEnabled, setPrivateThemeSessionEnabled] = useState(false);
  const [unlockingPrivateThemes, setUnlockingPrivateThemes] = useState(false);
  const [privateThemesSchemaReady, setPrivateThemesSchemaReady] = useState(true);
  const [selectedBackgroundId, setSelectedBackgroundId] = useState<string | null>(null);
  const [lastPublicBackgroundId, setLastPublicBackgroundId] = useState<string | null>(null);
  const [lastCelebratedWeek, setLastCelebratedWeek] = useState<string | null>(null);
  const [backgroundError, setBackgroundError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [ready, setReady] = useState(false);

  const memberById = useMemo(
    () => new Map(members.map(member => [member.id, member])),
    [members]
  );

  const activeMember = memberById.get(activeProfileId) ?? members[0];
  const otherMembers = members.filter(member => member.id !== activeProfileId);

  const migrateLegacyData = useCallback(async (
    activeWeekId: string,
    existingGoals: Array<{ id: string; player_id: string; assigned_by: string; title: string; goal_type: string }>,
    hasPreferences: boolean,
    existingBackgroundCount: number,
    hasEnvelope: boolean
  ) => {
    if (typeof window === "undefined") return false;
    if (window.localStorage.getItem(MIGRATION_KEY) === weekStart) return false;

    let changed = false;

    try {
      const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      const legacy = legacyRaw ? JSON.parse(legacyRaw) as {
        goals?: LegacyGoal[];
        active?: string;
        themeMode?: ThemeMode;
        accent?: string;
        vacationBalance?: number;
      } : null;

      const memberByName = new Map(
        members.map(member => [member.displayName.trim().toLowerCase(), member])
      );

      if (legacy?.goals?.length) {
        for (const oldGoal of legacy.goals) {
          const player = memberByName.get(String(oldGoal.player).trim().toLowerCase());
          if (!player) continue;

          const assigner = oldGoal.assignedBy === "self"
            ? player
            : (currentUserId !== player.id
                ? memberById.get(currentUserId)
                : members.find(member => member.id !== player.id)) ?? player;

          const duplicate = existingGoals.some(goal =>
            goal.player_id === player.id &&
            goal.assigned_by === assigner.id &&
            goal.title === oldGoal.title &&
            goal.goal_type === oldGoal.type
          );
          if (duplicate) continue;

          const { data: insertedGoal, error: insertError } = await supabase
            .from("goals")
            .insert({
              week_id: activeWeekId,
              player_id: player.id,
              assigned_by: assigner.id,
              title: oldGoal.title,
              goal_type: oldGoal.type,
              points: oldGoal.type === "oneTime" ? ONE_TIME_POINTS : DAILY_POINTS,
              completed_at: oldGoal.type === "oneTime" && oldGoal.done ? new Date().toISOString() : null
            })
            .select("id")
            .single();

          if (insertError) throw insertError;

          if (oldGoal.type === "daily" && oldGoal.dailyDone?.length && insertedGoal) {
            const rows = oldGoal.dailyDone.map(day => ({
              goal_id: insertedGoal.id,
              completed_on: dateForDay(weekStart, day),
              completed_by: currentUserId
            }));
            const { error: completionError } = await supabase.from("goal_completions").insert(rows);
            if (completionError) throw completionError;
          }

          changed = true;
        }
      }

      let selectedBackgroundDbId: string | null = null;

      if (existingBackgroundCount === 0) {
        const legacyBackgroundRaw = window.localStorage.getItem(LEGACY_BACKGROUNDS_KEY);
        const legacyBackgrounds = legacyBackgroundRaw
          ? JSON.parse(legacyBackgroundRaw) as BackgroundTheme[]
          : [];
        const legacySelected = window.localStorage.getItem(LEGACY_SELECTED_BACKGROUND_KEY);

        for (const oldBackground of legacyBackgrounds.slice(0, MAX_BACKGROUND_THEMES)) {
          const { data: insertedBackground, error: backgroundInsertError } = await supabase
            .from("user_backgrounds")
            .insert({
              profile_id: currentUserId,
              name: oldBackground.name,
              data_url: oldBackground.dataUrl
            })
            .select("id")
            .single();

          if (backgroundInsertError) throw backgroundInsertError;
          if (legacySelected === oldBackground.id) selectedBackgroundDbId = insertedBackground.id;
          changed = true;
        }
      }

      if (!hasPreferences) {
        const activeLegacyMember = legacy?.active
          ? memberByName.get(String(legacy.active).trim().toLowerCase())
          : null;
        const lastCelebrated = window.localStorage.getItem(LEGACY_SUNDAY_KEY);

        const { error: preferenceError } = await supabase.from("user_preferences").insert({
          profile_id: currentUserId,
          theme_mode: legacy?.themeMode === "light" ? "light" : "dark",
          accent: typeof legacy?.accent === "string" ? legacy.accent : "#c9ff54",
          active_profile_id: activeLegacyMember?.id ?? currentUserId,
          selected_background_id: selectedBackgroundDbId,
          last_celebrated_week: lastCelebrated || null
        });

        if (preferenceError) throw preferenceError;
        changed = true;
      }

      if (!hasEnvelope) {
        const balance = typeof legacy?.vacationBalance === "number" ? legacy.vacationBalance : 350;
        const { error: envelopeError } = await supabase.from("envelopes").insert({
          group_id: groupId,
          name: "Vacation",
          balance_cents: Math.round(balance * 100)
        });
        if (envelopeError && envelopeError.code !== "23505") throw envelopeError;
        changed = true;
      }

      window.localStorage.setItem(MIGRATION_KEY, weekStart);
      return changed;
    } catch (error) {
      console.warn("Could not migrate the old browser game into Supabase.", error);
      return changed;
    }
  }, [currentUserId, groupId, memberById, members, supabase, weekStart]);

  const loadData = useCallback(async (allowMigration = true) => {
    setSyncError("");

    try {
      let { data: week, error: weekError } = await supabase
        .from("weeks")
        .select("id, starts_on, status")
        .eq("group_id", groupId)
        .eq("starts_on", weekStart)
        .maybeSingle();

      if (weekError) throw weekError;

      if (!week) {
        const { data: insertedWeek, error: insertWeekError } = await supabase
          .from("weeks")
          .insert({
            group_id: groupId,
            starts_on: weekStart,
            ends_on: addDays(weekStart, 6),
            status: "active"
          })
          .select("id, starts_on, status")
          .single();

        if (insertWeekError) {
          const retry = await supabase
            .from("weeks")
            .select("id, starts_on, status")
            .eq("group_id", groupId)
            .eq("starts_on", weekStart)
            .single();
          if (retry.error) throw retry.error;
          week = retry.data;
        } else {
          week = insertedWeek;
        }
      }

      setWeekId(week.id);

      const [goalResult, preferenceResult, envelopeResult] = await Promise.all([
        supabase
          .from("goals")
          .select("id, player_id, assigned_by, title, goal_type, points, completed_at, created_at")
          .eq("week_id", week.id)
          .order("created_at", { ascending: true }),
        supabase
          .from("user_preferences")
          .select("theme_mode, accent, active_profile_id, selected_background_id, last_celebrated_week")
          .eq("profile_id", currentUserId)
          .maybeSingle(),
        supabase
          .from("envelopes")
          .select("id, balance_cents")
          .eq("group_id", groupId)
          .eq("name", "Vacation")
          .maybeSingle()
      ]);

      let backgroundRows: Array<{ id: string; name: string; data_url: string; is_private?: boolean }> = [];
      const privateBackgroundResult = await supabase
        .from("user_backgrounds")
        .select("id, name, data_url, is_private, created_at")
        .eq("profile_id", currentUserId)
        .eq("is_private", false)
        .order("created_at", { ascending: true });

      const privateFlagMissing = privateBackgroundResult.error?.code === "42703" ||
        privateBackgroundResult.error?.code === "PGRST204" ||
        privateBackgroundResult.error?.message.toLowerCase().includes("is_private");
      if (privateBackgroundResult.error && privateFlagMissing) {
        // Keep existing deployments usable until the additive SQL upgrade is applied.
        setPrivateThemesSchemaReady(false);
        const legacyBackgroundResult = await supabase
          .from("user_backgrounds")
          .select("id, name, data_url, created_at")
          .eq("profile_id", currentUserId)
          .order("created_at", { ascending: true });
        if (legacyBackgroundResult.error) throw legacyBackgroundResult.error;
        backgroundRows = legacyBackgroundResult.data ?? [];
      } else if (privateBackgroundResult.error) {
        throw privateBackgroundResult.error;
      } else {
        setPrivateThemesSchemaReady(true);
        backgroundRows = privateBackgroundResult.data ?? [];
      }

      if (goalResult.error) throw goalResult.error;
      if (preferenceResult.error) throw preferenceResult.error;
      if (envelopeResult.error) throw envelopeResult.error;

      if (allowMigration && !migrationAttempted.current) {
        migrationAttempted.current = true;
        const didMigrate = await migrateLegacyData(
          week.id,
          goalResult.data ?? [],
          Boolean(preferenceResult.data),
          backgroundRows.length,
          Boolean(envelopeResult.data)
        );
        if (didMigrate) {
          await loadData(false);
          return;
        }
      }

      const goalRows = goalResult.data ?? [];
      let completionRows: Array<{ goal_id: string; completed_on: string }> = [];

      if (goalRows.length) {
        const completionResult = await supabase
          .from("goal_completions")
          .select("goal_id, completed_on")
          .in("goal_id", goalRows.map(goal => goal.id));
        if (completionResult.error) throw completionResult.error;
        completionRows = completionResult.data ?? [];
      }

      const completionMap = new Map<string, DayKey[]>();
      completionRows.forEach(completion => {
        const day = dayForDate(weekStart, completion.completed_on);
        if (!day) return;
        const existing = completionMap.get(completion.goal_id) ?? [];
        completionMap.set(completion.goal_id, [...existing, day]);
      });

      setGoals(goalRows.map(row => ({
        id: row.id,
        playerId: row.player_id,
        assignedById: row.assigned_by,
        title: row.title,
        type: row.goal_type as GoalType,
        points: row.points,
        done: Boolean(row.completed_at),
        dailyDone: completionMap.get(row.id) ?? []
      })));

      const preferences = preferenceResult.data;
      if (preferences) {
        setThemeMode(preferences.theme_mode === "light" ? "light" : "dark");
        setAccent(preferences.accent || "#c9ff54");
        setActiveProfileId(
          preferences.active_profile_id && memberById.has(preferences.active_profile_id)
            ? preferences.active_profile_id
            : currentUserId
        );
        setSelectedBackgroundId(preferences.selected_background_id ?? null);
        setLastCelebratedWeek(preferences.last_celebrated_week ?? null);
      } else {
        setActiveProfileId(currentUserId);
      }

      const fallbackStorageKey = LAST_PUBLIC_BACKGROUND_KEY + ":" + currentUserId;
      const storedFallbackId = typeof window !== "undefined"
        ? window.localStorage.getItem(fallbackStorageKey)
        : null;
      const preferredPublicId = preferences?.selected_background_id &&
        backgroundRows.some(row => row.id === preferences.selected_background_id)
        ? preferences.selected_background_id
        : null;
      const storedPublicId = storedFallbackId && storedFallbackId !== "__default__" &&
        backgroundRows.some(row => row.id === storedFallbackId)
        ? storedFallbackId
        : null;
      const fallbackId = storedFallbackId === "__default__"
        ? null
        : preferredPublicId ?? storedPublicId ?? (
          preferences?.selected_background_id ? backgroundRows[0]?.id ?? null : null
        );
      setLastPublicBackgroundId(fallbackId);
      if (typeof window !== "undefined") {
        if (fallbackId) window.localStorage.setItem(fallbackStorageKey, fallbackId);
        else if (storedFallbackId === "__default__" || !preferences?.selected_background_id) {
          window.localStorage.setItem(fallbackStorageKey, "__default__");
        }
      }

      setBackgrounds(backgroundRows.map(row => ({
        id: row.id,
        name: row.name,
        dataUrl: row.data_url,
        isPrivate: false
      })));

      if (envelopeResult.data) {
        setVacationBalance(envelopeResult.data.balance_cents / 100);
      } else {
        const { data: insertedEnvelope, error: insertEnvelopeError } = await supabase
          .from("envelopes")
          .insert({ group_id: groupId, name: "Vacation", balance_cents: 35000 })
          .select("balance_cents")
          .single();
        if (insertEnvelopeError && insertEnvelopeError.code !== "23505") throw insertEnvelopeError;
        setVacationBalance((insertedEnvelope?.balance_cents ?? 35000) / 100);
      }

      setReady(true);
    } catch (error) {
      console.error("Could not sync Goals Game.", error);
      setSyncError("Could not sync the game right now. Your account is still signed in; try refreshing.");
      setReady(true);
    }
  }, [currentUserId, groupId, memberById, migrateLegacyData, supabase, weekStart]);

  useEffect(() => {
    void loadData(true);
  }, [loadData]);

  const settlementWeekStart = addDays(weekStart, -7);
  const settlementWeekId = useRef<string | null>(null);
  const settlementWinnerId = useRef<string | null>(null);
  const [settlementLeaders, setSettlementLeaders] = useState<Member[]>([]);
  const [settlementScores, setSettlementScores] = useState<Map<string, number>>(new Map());

  const loadCurrentPot = useCallback(async () => {
    if (!weekId) return;
    const { data, error } = await supabase.from("weekly_contributions").select("profile_id, amount_cents").eq("week_id", weekId);
    if (error) { setPotError("Could not load this week's pot."); return; }
    setCurrentContributions(data ?? []);
  }, [supabase, weekId]);

  useEffect(() => { void loadCurrentPot(); }, [loadCurrentPot]);

  const loadSettlement = useCallback(async () => {
    const { data: previous, error: previousError } = await supabase.from("weeks")
      .select("id").eq("group_id", groupId).eq("starts_on", settlementWeekStart).maybeSingle();
    if (previousError || !previous) { settlementWeekId.current = null; setPotReady(false); return; }
    settlementWeekId.current = previous.id;
    const [goalResponse, contributionResponse, allocationResponse] = await Promise.all([
      supabase.from("goals").select("id, player_id, goal_type, points, completed_at").eq("week_id", previous.id),
      supabase.from("weekly_contributions").select("profile_id, amount_cents").eq("week_id", previous.id),
      supabase.from("weekly_allocations").select("profile_id, amount_cents").eq("week_id", previous.id)
    ]);
    if (goalResponse.error || contributionResponse.error || allocationResponse.error) {
      setPotReady(false);
      return;
    }
    const oldGoals = goalResponse.data ?? [];
    const dailyIds = oldGoals.filter(g => g.goal_type === "daily").map(g => g.id);
    const daily = dailyIds.length ? await supabase.from("goal_completions").select("goal_id").in("goal_id", dailyIds) : null;
    if (daily?.error) return;
    const counts = new Map<string, number>();
    (daily?.data ?? []).forEach(item => counts.set(item.goal_id, (counts.get(item.goal_id) ?? 0) + 1));
    const totals = new Map(members.map(member => [member.id, 0]));
    oldGoals.forEach(g => totals.set(g.player_id, (totals.get(g.player_id) ?? 0) +
      g.points * (g.goal_type === "daily" ? (counts.get(g.id) ?? 0) : (g.completed_at ? 1 : 0))));
    const high = Math.max(...Array.from(totals.values()));
    const leaders = members.filter(member => totals.get(member.id) === high);
    setSettlementScores(totals);
    setSettlementLeaders(leaders);
    settlementWinnerId.current = leaders.length === 1 ? leaders[0].id : null;
    setSettlementContributions(contributionResponse.data ?? []);
    setPotCents((contributionResponse.data ?? []).reduce((sum, row) => sum + row.amount_cents, 0));
    setAllocatedCents((allocationResponse.data ?? []).filter(row => row.profile_id === currentUserId)
      .reduce((sum, row) => sum + row.amount_cents, 0));
    setPotReady(true);
  }, [currentUserId, groupId, members, settlementWeekStart, supabase]);

  useEffect(() => { void loadSettlement(); }, [loadSettlement]);

  async function contributeToPot() {
    if (!weekId) return;
    const cents = Math.round(Number(potInput) * 100);
    if (!Number.isSafeInteger(cents) || cents <= 0) { setPotError("Enter a positive dollar amount."); return; }
    setPotError("");
    const { error } = await supabase.from("weekly_contributions").insert({
      week_id: weekId, profile_id: currentUserId, amount_cents: cents
    });
    if (error) { setPotError("Could not save contribution. Check that the settlement SQL migration is installed."); return; }
    setPotInput("");
    await loadCurrentPot();
    setAllocationNotice("Contribution saved for this week.");
  }

  async function allocateWinnings() {
    if (!settlementWeekId.current || allocating) return;
    setAllocating(true);
    setPotError("");
    const { data, error } = await supabase.rpc("allocate_weekly_winnings", {
      target_week_id: settlementWeekId.current, target_envelope_name: "Vacation"
    });
    if (error) setPotError(error.message);
    else {
      setAllocationNotice("$" + (Number(data) / 100).toFixed(2) + " allocated to Vacation.");
      await loadSettlement();
    }
    setAllocating(false);
  }

  useEffect(() => {
    if (showSettings && showMenu) return;
    lockPrivateThemes();
  }, [showMenu, showSettings]);

  useEffect(() => {
    const lockPrivateThemes = () => {
      setPrivateThemesUnlocked(false);
      setPrivateBackgrounds(current =>
        selectedBackgroundId && current.some(background => background.id === selectedBackgroundId)
          ? current.filter(background => background.id === selectedBackgroundId)
          : []
      );
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") lockPrivateThemes();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", lockPrivateThemes);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", lockPrivateThemes);
    };
  }, [selectedBackgroundId]);

  useEffect(() => {
    let lastY = window.scrollY;

    const onScroll = () => {
      const nextY = window.scrollY;
      const nearTop = nextY < 40;
      const scrollingUp = nextY < lastY;

      setMenuButtonVisible(nearTop || scrollingUp || showMenu);
      lastY = nextY;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [showMenu]);

  useEffect(() => {
    if (!ready || !potReady || !settlementWeekId.current) return;
    const previousWeek = settlementWeekStart;
    if (lastCelebratedWeek === previousWeek) return;
    setShowWeekResult(true);
    setLastCelebratedWeek(previousWeek);
    void persistPreferences({ lastCelebratedWeek: previousWeek });
  // Keep an unsettled result available after Monday if the user misses that day.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, potReady, lastCelebratedWeek, settlementWeekStart]);

  useEffect(() => {
    if (!ready) return;

    const refresh = () => {
      void loadData(false);
    };

    const channel = supabase
      .channel("group:" + groupId + ":game")
      .on("postgres_changes", { event: "*", schema: "public", table: "goals" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "goal_completions" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "envelopes" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_preferences" }, refresh)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [groupId, loadData, ready, supabase]);

  async function persistPreferences(overrides: {
    themeMode?: ThemeMode;
    accent?: string;
    activeProfileId?: string;
    selectedBackgroundId?: string | null;
    lastCelebratedWeek?: string | null;
  }) {
    const nextThemeMode = overrides.themeMode ?? themeMode;
    const nextAccent = overrides.accent ?? accent;
    const nextActiveProfileId = overrides.activeProfileId ?? activeProfileId;
    const nextSelectedBackgroundId =
      Object.prototype.hasOwnProperty.call(overrides, "selectedBackgroundId")
        ? overrides.selectedBackgroundId ?? null
        : selectedBackgroundId;
    const nextLastCelebratedWeek =
      Object.prototype.hasOwnProperty.call(overrides, "lastCelebratedWeek")
        ? overrides.lastCelebratedWeek ?? null
        : lastCelebratedWeek;

    const { error } = await supabase.from("user_preferences").upsert({
      profile_id: currentUserId,
      theme_mode: nextThemeMode,
      accent: nextAccent,
      active_profile_id: nextActiveProfileId,
      selected_background_id: nextSelectedBackgroundId,
      last_celebrated_week: nextLastCelebratedWeek,
      updated_at: new Date().toISOString()
    }, { onConflict: "profile_id" });

    if (error) {
      console.error("Could not save Goals Game settings.", error);
      setSyncError("Your settings did not save. Tap Retry after checking your connection.");
      return false;
    }

    setSyncError("");
    return true;
  }

  const accentContrast = contrastText(accent);
  const themeStyle = {
    "--accent": accent,
    "--accent-contrast": accentContrast
  } as CSSProperties;

  const scores = useMemo(() => {
    const totals = new Map<string, number>();
    members.forEach(member => totals.set(member.id, 0));
    goals.forEach(goal => {
      totals.set(goal.playerId, (totals.get(goal.playerId) ?? 0) + earnedPoints(goal));
    });
    return totals;
  }, [goals, members]);

  const maxPoints = useCallback((playerId: string) =>
    goals
      .filter(goal => goal.playerId === playerId)
      .reduce((sum, goal) => sum + possiblePoints(goal), 0),
  [goals]);

  const rankedMembers = useMemo(
    () => [...members].sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0)),
    [members, scores]
  );

  const topScore = rankedMembers.length ? scores.get(rankedMembers[0].id) ?? 0 : 0;
  const leaders = rankedMembers.filter(member => (scores.get(member.id) ?? 0) === topScore);
  const leaderLabel = leaders.length !== 1 ? "Tie game" : leaders[0].displayName + " leads";
  const winner = leaders.length === 1 ? leaders[0] : null;

  async function toggleOneTime(goal: Goal) {
    const nextDone = !goal.done;
    setGoals(current => current.map(item =>
      item.id === goal.id ? { ...item, done: nextDone } : item
    ));

    const { error } = await supabase
      .from("goals")
      .update({ completed_at: nextDone ? new Date().toISOString() : null })
      .eq("id", goal.id);

    if (error) {
      setSyncError("That completion did not save. Refreshing the shared game.");
      await loadData(false);
    }
  }

  async function toggleDaily(goal: Goal, day: DayKey) {
    const completed = goal.dailyDone.includes(day);
    const completedOn = dateForDay(weekStart, day);

    setGoals(current => current.map(item => {
      if (item.id !== goal.id) return item;
      return {
        ...item,
        dailyDone: completed
          ? item.dailyDone.filter(value => value !== day)
          : [...item.dailyDone, day]
      };
    }));

    const result = completed
      ? await supabase
          .from("goal_completions")
          .delete()
          .eq("goal_id", goal.id)
          .eq("completed_on", completedOn)
      : await supabase
          .from("goal_completions")
          .insert({
            goal_id: goal.id,
            completed_on: completedOn,
            completed_by: currentUserId
          });

    if (result.error) {
      setSyncError("That daily checkoff did not save. Refreshing the shared game.");
      await loadData(false);
    }
  }

  function openAdd(assigned: AssignedBy = "self") {
    const fallbackAssigner = currentUserId !== activeProfileId
      ? currentUserId
      : otherMembers[0]?.id ?? currentUserId;

    setEditingGoalId(null);
    setTitle("");
    setAssignedBy(assigned);
    setChallengeAssignerId(fallbackAssigner);
    setGoalType("oneTime");
    setShowGoalModal(true);
  }

  function openEdit(goal: Goal) {
    setEditingGoalId(goal.id);
    setTitle(goal.title);
    setAssignedBy(goal.assignedById === goal.playerId ? "self" : "challenge");
    setChallengeAssignerId(goal.assignedById);
    setGoalType(goal.type);
    setShowGoalModal(true);
  }

  async function saveGoal() {
    if (!title.trim() || !weekId || !activeMember) return;

    const assignerId = assignedBy === "self"
      ? activeMember.id
      : challengeAssignerId;

    if (editingGoalId !== null) {
      const existing = goals.find(goal => goal.id === editingGoalId);
      const changedType = existing?.type !== goalType;

      const { error } = await supabase
        .from("goals")
        .update({
          title: title.trim(),
          assigned_by: assignerId,
          goal_type: goalType,
          points: goalType === "oneTime" ? ONE_TIME_POINTS : DAILY_POINTS,
          completed_at: changedType ? null : existing?.done ? new Date().toISOString() : null
        })
        .eq("id", editingGoalId);

      if (error) {
        setSyncError("Could not save that goal.");
        return;
      }

      if (changedType) {
        await supabase.from("goal_completions").delete().eq("goal_id", editingGoalId);
      }
    } else {
      const { error } = await supabase.from("goals").insert({
        week_id: weekId,
        player_id: activeMember.id,
        assigned_by: assignerId,
        title: title.trim(),
        goal_type: goalType,
        points: goalType === "oneTime" ? ONE_TIME_POINTS : DAILY_POINTS
      });

      if (error) {
        setSyncError("Could not add that goal.");
        return;
      }
    }

    setShowGoalModal(false);
    setEditingGoalId(null);
    setTitle("");
    await loadData(false);
  }

  async function deleteGoal(goal: Goal) {
    if (!window.confirm('Delete "' + goal.title + '"?')) return;

    const oldGoals = goals;
    setGoals(current => current.filter(item => item.id !== goal.id));

    const { error } = await supabase.from("goals").delete().eq("id", goal.id);
    if (error) {
      setGoals(oldGoals);
      setSyncError("Could not delete that goal.");
    }
  }

  async function uploadBackground(file?: File, isPrivate = false) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setBackgroundError("Choose an image file.");
      return;
    }

    const existingCount = isPrivate ? privateBackgrounds.length : backgrounds.length;
    const maxCount = isPrivate ? MAX_PRIVATE_BACKGROUND_THEMES : MAX_BACKGROUND_THEMES;
    if (existingCount >= maxCount) {
      setBackgroundError("You can keep up to " + maxCount + (isPrivate ? " private" : " regular") + " backgrounds right now.");
      return;
    }

    setBackgroundError("");

    try {
      const dataUrl = await compressBackground(file);
      if (isPrivate && !privateThemesSchemaReady) {
        throw new Error("Run the private themes SQL upgrade before adding private photos.");
      }
      const name = file.name.replace(/\.[^.]+$/, "") || "Custom background";
      let nextBackground: BackgroundTheme;
      if (privateThemesSchemaReady) {
        const { data, error } = await supabase
          .from("user_backgrounds")
          .insert({ profile_id: currentUserId, name, data_url: dataUrl, is_private: isPrivate })
          .select("id, name, data_url, is_private")
          .single();
        if (error) throw error;
        nextBackground = {
          id: data.id,
          name: data.name,
          dataUrl: data.data_url,
          isPrivate: Boolean(data.is_private)
        };
      } else {
        const { data, error } = await supabase
          .from("user_backgrounds")
          .insert({ profile_id: currentUserId, name, data_url: dataUrl })
          .select("id, name, data_url")
          .single();
        if (error) throw error;
        nextBackground = { id: data.id, name: data.name, dataUrl: data.data_url, isPrivate: false };
      }

      if (nextBackground.isPrivate) {
        setPrivateBackgrounds(current => [...current, nextBackground]);
      } else {
        setBackgrounds(current => [...current, nextBackground]);
      }
      setSelectedBackgroundId(nextBackground.id);
      if (!nextBackground.isPrivate) {
        setLastPublicBackgroundId(nextBackground.id);
        window.localStorage.setItem(LAST_PUBLIC_BACKGROUND_KEY + ":" + currentUserId, nextBackground.id);
      }
      await persistPreferences({ selectedBackgroundId: nextBackground.id });
    } catch (error) {
      console.warn("Could not upload background.", error);
      setBackgroundError(error instanceof Error ? error.message : "Could not upload that background.");
    }
  }

  async function removeSelectedBackground() {
    if (!selectedBackgroundId) return;

    const oldBackgrounds = backgrounds;
    const oldPrivateBackgrounds = privateBackgrounds;
    const id = selectedBackgroundId;
    setBackgrounds(current => current.filter(background => background.id !== id));
    setPrivateBackgrounds(current => current.filter(background => background.id !== id));
    setSelectedBackgroundId(null);
    setBackgroundError("");
    await persistPreferences({ selectedBackgroundId: null });

    const { error } = await supabase
      .from("user_backgrounds")
      .delete()
      .eq("id", id);

    if (error) {
      setBackgrounds(oldBackgrounds);
      setPrivateBackgrounds(oldPrivateBackgrounds);
      setSelectedBackgroundId(id);
      setBackgroundError("Could not remove that background.");
    }
  }

  async function unlockPrivateThemes() {
    if (!privateThemesSchemaReady) return;
    setUnlockingPrivateThemes(true);
    setBackgroundError("");
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const email = authData.user?.email?.trim().toLowerCase();
      if (!authData.user || authData.user.id !== currentUserId || email !== PRIVATE_THEMES_EMAIL) {
        lockPrivateThemes();
        return;
      }

      const { data, error } = await supabase
        .from("user_backgrounds")
        .select("id, name, data_url, is_private")
        .eq("profile_id", currentUserId)
        .eq("is_private", true)
        .order("created_at", { ascending: true });
      if (error) throw error;

      setPrivateBackgrounds((data ?? []).map(row => ({
        id: row.id,
        name: row.name,
        dataUrl: row.data_url,
        isPrivate: true
      })));
      setPrivateThemesUnlocked(true);
    } catch (error) {
      console.warn("Could not open private themes.", error);
      setBackgroundError(error instanceof Error ? error.message : "Could not open private themes.");
    } finally {
      setUnlockingPrivateThemes(false);
    }
  }

  async function revealPrivateThemeForSession() {
    const backgroundId = selectedBackgroundId;
    if (!backgroundId || backgrounds.some(background => background.id === backgroundId)) return;
    if (!privateThemesSchemaReady) return;

    setBackgroundError("");
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const email = authData.user?.email?.trim().toLowerCase();
      if (!authData.user || authData.user.id !== currentUserId || email !== PRIVATE_THEMES_EMAIL) {
        setPrivateThemeSessionEnabled(false);
        lockPrivateThemes();
        return;
      }

      const { data, error } = await supabase
        .from("user_backgrounds")
        .select("id, name, data_url, is_private")
        .eq("id", backgroundId)
        .eq("profile_id", currentUserId)
        .eq("is_private", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) return;

      const background = {
        id: data.id,
        name: data.name,
        dataUrl: data.data_url,
        isPrivate: true
      };
      setPrivateBackgrounds(current => current.some(item => item.id === background.id)
        ? current
        : [...current, background]
      );
      setPrivateThemeSessionEnabled(true);
    } catch (error) {
      console.warn("Could not reveal the selected private theme.", error);
      setBackgroundError(error instanceof Error ? error.message : "Could not reveal the selected private theme.");
    }
  }

  function startPrivateThemeRevealHold() {
    if (!selectedBackgroundId || backgrounds.some(background => background.id === selectedBackgroundId)) return;
    if (!privateThemesSchemaReady) return;
    if (privateThemeRevealTimer.current) clearTimeout(privateThemeRevealTimer.current);
    privateThemeRevealTimer.current = setTimeout(() => {
      privateThemeRevealTimer.current = null;
      void revealPrivateThemeForSession();
    }, PRIVATE_THEME_REVEAL_HOLD_MS);
  }

  function cancelPrivateThemeRevealHold() {
    if (!privateThemeRevealTimer.current) return;
    clearTimeout(privateThemeRevealTimer.current);
    privateThemeRevealTimer.current = null;
  }

  function lockPrivateThemes() {
    setPrivateThemesUnlocked(false);
    setPrivateBackgrounds(current =>
      selectedBackgroundId && current.some(background => background.id === selectedBackgroundId)
        ? current.filter(background => background.id === selectedBackgroundId)
        : []
    );
  }

  function startPrivateThemesHold() {
    if (privateThemesUnlocked || unlockingPrivateThemes || !privateThemesSchemaReady) return;
    if (privateThemesHoldTimer.current) clearTimeout(privateThemesHoldTimer.current);
    privateThemesHoldTimer.current = setTimeout(() => {
      privateThemesHoldTimer.current = null;
      void unlockPrivateThemes();
    }, PRIVATE_THEMES_HOLD_MS);
  }

  function cancelPrivateThemesHold() {
    if (!privateThemesHoldTimer.current) return;
    clearTimeout(privateThemesHoldTimer.current);
    privateThemesHoldTimer.current = null;
  }

  const selectedBackground = [...backgrounds, ...privateBackgrounds]
    .find(background => background.id === selectedBackgroundId) ?? null;
  const selectedBackgroundIsPrivate = selectedBackgroundId !== null &&
    !backgrounds.some(background => background.id === selectedBackgroundId);
  const lastPublicBackground = backgrounds.find(background => background.id === lastPublicBackgroundId) ?? null;
  const displayedBackground = selectedBackgroundIsPrivate
    ? privateThemeSessionEnabled ? selectedBackground : lastPublicBackground
    : selectedBackground;
  const activeGoals = activeMember ? goals.filter(goal => goal.playerId === activeMember.id) : [];
  const selfGoals = activeGoals.filter(goal => goal.assignedById === goal.playerId);
  const challengeGoals = activeGoals.filter(goal => goal.assignedById !== goal.playerId);
  const activeEarned = activeGoals.reduce((sum, goal) => sum + earnedPoints(goal), 0);
  const activePossible = activeGoals.reduce((sum, goal) => sum + possiblePoints(goal), 0);
  const progress = activePossible ? activeEarned / activePossible * 100 : 0;

  if (!ready) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="authEyebrow">GOALS GAME</p>
          <h1>Loading your week…</h1>
          <p className="authIntro">Syncing your group, goals, settings, and score.</p>
        </section>
      </main>
    );
  }

  return (
    <div className={"appFrame " + (displayedBackground ? "hasBackground" : "")} data-theme={themeMode} style={themeStyle}>
      {displayedBackground && (
        <div
          className="gameBackground"
          style={{ backgroundImage: "url(" + displayedBackground.dataUrl + ")" }}
          aria-hidden="true"
        />
      )}

      <main className="shell">
        <button
          className={"menuButton menuOverlay " + (menuButtonVisible ? "visible" : "hidden") + " " + (showMenu ? "open" : "")}
          onClick={() => setShowMenu(value => !value)}
          aria-expanded={showMenu}
          aria-label={showMenu ? "Close navigation" : "Open navigation"}
        >
          <span>{showMenu ? "×" : "☰"}</span>
        </button>

        <header className="top">
          <div>
            <p className="eyebrow">GOALS GAME</p>
            <h1
              onPointerDown={startPrivateThemeRevealHold}
              onPointerUp={cancelPrivateThemeRevealHold}
              onPointerCancel={cancelPrivateThemeRevealHold}
              onPointerLeave={cancelPrivateThemeRevealHold}
              onContextMenu={event => event.preventDefault()}
              onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void revealPrivateThemeForSession();
                }
              }}
              tabIndex={selectedBackgroundIsPrivate ? 0 : undefined}
              role={selectedBackgroundIsPrivate ? "button" : undefined}
              aria-label={selectedBackgroundIsPrivate ? "Reveal the private theme for this session" : undefined}
              aria-pressed={selectedBackgroundIsPrivate ? privateThemeSessionEnabled : undefined}
            >
              Win the week <span>together.</span>
            </h1>
            <p className="sub">{weekLabel} · Today is {today}</p>
          </div>
        </header>

        {syncError && (
          <button className="syncNotice" onClick={() => void loadData(false)}>
            {syncError} <b>Retry</b>
          </button>
        )}

        <aside className={"fullScreenMenu " + (showMenu ? "open" : "")} aria-hidden={!showMenu}>
          <nav className="fullScreenNav" aria-label="Primary navigation">
            <button onClick={() => { setShowEnvelopes(false); setShowMenu(false); }}>Game</button>
            <button onClick={() => { setShowEnvelopes(true); setShowMenu(false); }}>Envelopes</button>
            <button onClick={() => setShowSettings(value => !value)} aria-expanded={showSettings}>Settings</button>
          </nav>

          {showSettings && (
            <div className="fullScreenSettings">
              <div className="modeSwitch wordSwitch">
                <button
                  className={themeMode === "dark" ? "selected" : ""}
                  onClick={() => {
                    setThemeMode("dark");
                    void persistPreferences({ themeMode: "dark" });
                  }}
                >
                  Dark
                </button>
                <button
                  className={themeMode === "light" ? "selected" : ""}
                  onClick={() => {
                    setThemeMode("light");
                    void persistPreferences({ themeMode: "light" });
                  }}
                >
                  Light
                </button>
              </div>

              <div className="swatches">
                {ACCENTS.map(color => (
                  <button
                    key={color}
                    className={"swatch " + (accent.toLowerCase() === color.toLowerCase() ? "selected" : "")}
                    style={{ background: color }}
                    onClick={() => {
                      setAccent(color);
                      void persistPreferences({ accent: color });
                    }}
                    aria-label={"Use " + color + " accent"}
                  />
                ))}
                <label className="customColor">
                  <input
                    type="color"
                    value={accent}
                    onChange={event => {
                      const nextAccent = event.target.value;
                      setAccent(nextAccent);
                      void persistPreferences({ accent: nextAccent });
                    }}
                  />
                  <span>Custom</span>
                </label>
              </div>

              <div className="backgroundSettings">
                <div
                  className="backgroundSettingsHead"
                  onPointerDown={startPrivateThemesHold}
                  onPointerUp={cancelPrivateThemesHold}
                  onPointerCancel={cancelPrivateThemesHold}
                  onPointerLeave={cancelPrivateThemesHold}
                >
                  <div>
                    <span>Backgrounds</span>
                    <small>Saved to your account</small>
                  </div>
                  <small>{backgrounds.length}/{MAX_BACKGROUND_THEMES}</small>
                </div>

                <div className="backgroundThemeGrid">
                  <button
                    className={"backgroundTheme defaultBackground " + (selectedBackgroundId === null || (selectedBackgroundIsPrivate && !privateThemesUnlocked) ? "selected" : "")}
                    onClick={() => {
                      setSelectedBackgroundId(null);
                      setLastPublicBackgroundId(null);
                      window.localStorage.setItem(LAST_PUBLIC_BACKGROUND_KEY + ":" + currentUserId, "__default__");
                      setBackgroundError("");
                      void persistPreferences({ selectedBackgroundId: null });
                    }}
                    aria-pressed={selectedBackgroundId === null || (selectedBackgroundIsPrivate && !privateThemesUnlocked)}
                  >
                    <span>Default</span>
                  </button>

                  {backgrounds.map(background => (
                    <button
                      key={background.id}
                      className={"backgroundTheme " + (selectedBackgroundId === background.id ? "selected" : "")}
                      style={{ backgroundImage: "url(" + background.dataUrl + ")" }}
                      onClick={() => {
                        setSelectedBackgroundId(background.id);
                        setLastPublicBackgroundId(background.id);
                        window.localStorage.setItem(LAST_PUBLIC_BACKGROUND_KEY + ":" + currentUserId, background.id);
                        setBackgroundError("");
                        void persistPreferences({ selectedBackgroundId: background.id });
                      }}
                      aria-pressed={selectedBackgroundId === background.id}
                      title={background.name}
                    >
                      <span>{background.name}</span>
                    </button>
                  ))}
                </div>

                <div className="backgroundActions">
                  <label className={"backgroundUpload " + (backgrounds.length >= MAX_BACKGROUND_THEMES ? "disabled" : "")}>
                    ＋ Upload background
                    <input
                      type="file"
                      accept="image/*"
                      disabled={backgrounds.length >= MAX_BACKGROUND_THEMES}
                      onChange={event => {
                        void uploadBackground(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>

                  {selectedBackground && (
                    <button className="backgroundRemove" onClick={() => void removeSelectedBackground()}>
                      Remove selected
                    </button>
                  )}
                </div>

                <p className="backgroundHint">Your theme now follows your login across browsers and devices.</p>


                {privateThemesUnlocked && (
                  <div className="privateThemesPanel">
                    <div className="backgroundSettingsHead">
                      <div>
                        <span>Private themes</span>
                        <small>Private account themes</small>
                      </div>
                      <small>{privateBackgrounds.length}/{MAX_PRIVATE_BACKGROUND_THEMES}</small>
                    </div>

                    {privateBackgrounds.length > 0 ? (
                      <div className="backgroundThemeGrid">
                        {privateBackgrounds.map(background => (
                          <button
                            key={background.id}
                            type="button"
                            className={"backgroundTheme " + (selectedBackgroundId === background.id ? "selected" : "")}
                            style={{ backgroundImage: "url(" + background.dataUrl + ")" }}
                            onClick={() => {
                              setSelectedBackgroundId(background.id);
                              setBackgroundError("");
                              void persistPreferences({ selectedBackgroundId: background.id });
                            }}
                            aria-pressed={selectedBackgroundId === background.id}
                            title={background.name}
                          >
                            <span>{background.name}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="backgroundHint">No private themes yet. Add a photo here to keep it out of the regular theme list.</p>
                    )}

                    <button type="button" className="privateThemesToggle" onClick={lockPrivateThemes}>Lock private themes</button>

                    <label className={"backgroundUpload " + (privateBackgrounds.length >= MAX_PRIVATE_BACKGROUND_THEMES ? "disabled" : "")}>
                      ＋ Add private photo
                      <input
                        type="file"
                        accept="image/*"
                        disabled={privateBackgrounds.length >= MAX_PRIVATE_BACKGROUND_THEMES}
                        onChange={event => {
                          void uploadBackground(event.target.files?.[0], true);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  </div>
                )}

                {backgroundError && <p className="backgroundError" role="alert">{backgroundError}</p>}
              </div>

              <SessionBar
                displayName={displayName}
                groupName={groupName}
                inviteCode={inviteCode}
                memberCount={members.length}
              />
            </div>
          )}
        </aside>

        {showWeekResult && (
          <section className="weekResultOverlay" role="dialog" aria-modal="true" aria-labelledby="week-result-title">
            <div className="confettiBurst" aria-hidden="true">
              {Array.from({ length: 120 }, (_, index) => (
                <span
                  key={index}
                  style={{
                    "--x": String((index * 37) % 100) + "%",
                    "--delay": String((index % 20) * 80) + "ms",
                    "--drift": String(((index % 9) - 4) * 18) + "px",
                    "--spin": String(180 + (index % 11) * 34) + "deg"
                  } as CSSProperties}
                />
              ))}
            </div>

            <button className="weekResultClose" onClick={() => setShowWeekResult(false)} aria-label="Close week result">×</button>

            <div className="weekResultContent">
              <p className="weekResultEyebrow">"LAST WEEK'S GAME IS CLOSED"</p>
              <h2 id="week-result-title">{potReady ? (settlementLeaders.length === 1 ? settlementLeaders[0].displayName + " wins the week." : "Last week ended in a tie.") : "Weekly celebration"}</h2>
              <p className="weekResultScoreLabel">PREVIOUS WEEK'S FINAL SCORE</p>
              {potReady && (
                <div style={{ padding: 16, marginBottom: 16, border: "1px solid currentColor", borderRadius: 12 }}>
                  <p>Weekly pot: <strong>${(potCents / 100).toFixed(2)}</strong></p>
                  <p>{settlementLeaders.length === 1 ? settlementLeaders[0].displayName + " won!" : "Tie — the pot remains unassigned."}</p>
                  {settlementLeaders.map(member => <p key={member.id}>{member.displayName}: {settlementScores.get(member.id) ?? 0} points</p>)}
                  {settlementLeaders.length === 1 && settlementLeaders[0].id === currentUserId && potCents > 0 && (
                    <button className="weekResultContinue" disabled={allocating || allocatedCents > 0}
                      onClick={() => void allocateWinnings()}>
                      {allocatedCents > 0 ? "Your winnings are allocated" : allocating ? "Allocating…" : "Assign my winnings to Vacation"}
                    </button>
                  )}
                  {allocationNotice && <p role="status">{allocationNotice}</p>}
                  {potError && <p role="alert">{potError}</p>}
                </div>
              )}
              <div className="weekResultScore multiplayerResult">
                {(potReady ? [...members].sort((a, b) => (settlementScores.get(b.id) ?? 0) - (settlementScores.get(a.id) ?? 0)) : rankedMembers).map(member => (
                  <span key={member.id}>
                    <b>{member.displayName}</b>
                    <strong>{potReady ? (settlementScores.get(member.id) ?? 0) : (scores.get(member.id) ?? 0)}</strong>
                  </span>
                ))}
              </div>
              <button className="weekResultContinue" onClick={() => setShowWeekResult(false)}>
                View final board
              </button>
            </div>
          </section>
        )}

        <section className={"scoreboard " + (members.length === 2 ? "duel" : "multiplayer")}>
          {members.map((member, index) => (
            <Fragment key={member.id}>
              {members.length === 2 && index === 1 && (
                <div className="versus"><b>VS</b><span>{leaderLabel}</span></div>
              )}
              <Score
                name={member.displayName}
                score={scores.get(member.id) ?? 0}
                max={maxPoints(member.id)}
                active={activeMember?.id === member.id}
                onClick={() => {
                  setActiveProfileId(member.id);
                  void persistPreferences({ activeProfileId: member.id });
                }}
              />
            </Fragment>
          ))}
        </section>

        <button className="vacationTile" onClick={() => setShowEnvelopes(true)}>
          <span className="vacationTileIcon">✉</span>
          <span className="vacationTileText">
            <small>ENVELOPE</small>
            <b>Vacation</b>
          </span>
          <strong>{"$" + vacationBalance.toLocaleString()}</strong>
          <span className="vacationTileArrow">›</span>
        </button>

        <section className="card">
          <div className="sectionHead"><div><p className="eyebrow">WEEKLY STAKE</p><h2>Build this week&apos;s pot.</h2></div></div>
          <p>Contributions are optional and never affect points. The pot locks after Sunday.</p>
          <p>This records your agreed contribution in the app; it does not move money between bank accounts.</p>
          <p><strong>This week's pot: ${(currentContributions.reduce((sum, item) => sum + item.amount_cents, 0) / 100).toFixed(2)}</strong></p>
          {members.map(member => <p key={member.id}>{member.displayName}: ${(currentContributions.filter(item => item.profile_id === member.id).reduce((sum, item) => sum + item.amount_cents, 0) / 100).toFixed(2)}</p>)}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <input aria-label="Contribution in dollars" type="number" min="0.01" step="0.01"
              value={potInput} onChange={event => setPotInput(event.target.value)}
              placeholder="Amount ($)" style={{ padding: 10, borderRadius: 8 }} />
            <button className="add" onClick={() => void contributeToPot()}>Add to pot</button>
          </div>
          {potError && <p role="alert">{potError}</p>}
          {allocationNotice && <p role="status">{allocationNotice}</p>}
          <small>This tracks pledges in the game; it does not transfer money.</small>
        </section>
        <section className="card">
          <div className="sectionHead">
            <div>
              <p className="eyebrow">{(activeMember?.displayName ?? "PLAYER").toUpperCase()}&apos;S WEEK</p>
              <h2>Make your moves.</h2>
            </div>
            <button className="add" onClick={() => openAdd("self")}>＋ Add goal</button>
          </div>

          <GoalSection
            title="My Goals"
            subtitle="Goals this player chose for themselves"
            goals={selfGoals}
            today={today}
            onToggleOneTime={goal => void toggleOneTime(goal)}
            onToggleDaily={(goal, day) => void toggleDaily(goal, day)}
            onEdit={openEdit}
            onDelete={goal => void deleteGoal(goal)}
            onAdd={() => openAdd("self")}
          />

          <GoalSection
            title="Challenges"
            subtitle="Goals another player set for them"
            goals={challengeGoals}
            today={today}
            onToggleOneTime={goal => void toggleOneTime(goal)}
            onToggleDaily={(goal, day) => void toggleDaily(goal, day)}
            onEdit={openEdit}
            onDelete={goal => void deleteGoal(goal)}
            onAdd={() => openAdd("challenge")}
          />
        </section>

        <section className="progressCard">
          <div>
            <p className="eyebrow">WEEKLY PROGRESS</p>
            <b>{activeEarned} of {activePossible} possible points</b>
          </div>
          <div className="bar"><span style={{ width: String(progress) + "%" }} /></div>
          <p className="motivate">One-time goals are worth 50. Daily goals earn 10 each completed day.</p>
        </section>


        {potReady && (
          <button className="closeWeek" onClick={() => setShowWeekResult(true)}>
            🏁 View last week&apos;s result
          </button>
        )}

        {showEnvelopes && (
          <section className="envelopePage">
            <div className="envelopePageInner">
              <button className="backButton" onClick={() => setShowEnvelopes(false)}>← Back</button>

              <div className="envelopePageHead">
                <div>
                  <p className="eyebrow">ENVELOPES</p>
                  <h2>Your winnings.</h2>
                </div>
                <strong className="envelopeTotal">{"$" + vacationBalance.toLocaleString()}</strong>
              </div>

              <button className="envelopeRow">
                <span className="envelopeIcon">✉</span>
                <span className="envelopeName"><b>Vacation</b><small>Shared group envelope</small></span>
                <strong>{"$" + vacationBalance.toLocaleString()}</strong>
              </button>

              <div className="emptyEnvelope">
                <span>＋</span>
                <span><b>New envelope</b><small>Available when you decide to open one</small></span>
              </div>
            </div>
          </section>
        )}

        {showGoalModal && activeMember && (
          <div className="modalBack" onClick={() => setShowGoalModal(false)}>
            <div className="modal" onClick={event => event.stopPropagation()}>
              <p className="eyebrow">{editingGoalId !== null ? "EDIT GOAL" : "NEW GOAL"} · {activeMember.displayName.toUpperCase()}</p>
              <h2>{editingGoalId !== null ? "Change the play." : "Add something worth chasing."}</h2>

              <label>
                Goal
                <input autoFocus value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Read before bed" />
              </label>

              <p className="choiceLabel">Who set it?</p>
              <div className="seg">
                <button className={assignedBy === "self" ? "selected" : ""} onClick={() => setAssignedBy("self")}>Self-selected</button>
                <button
                  className={assignedBy === "challenge" ? "selected" : ""}
                  onClick={() => setAssignedBy("challenge")}
                  disabled={otherMembers.length === 0}
                >
                  Challenge
                </button>
              </div>

              {assignedBy === "challenge" && otherMembers.length > 0 && (
                <label>
                  Challenge set by
                  <select value={challengeAssignerId} onChange={event => setChallengeAssignerId(event.target.value)}>
                    {otherMembers.map(member => (
                      <option key={member.id} value={member.id}>{member.displayName}</option>
                    ))}
                  </select>
                </label>
              )}

              <p className="choiceLabel">How does it score?</p>
              <div className="seg">
                <button className={goalType === "oneTime" ? "selected" : ""} onClick={() => setGoalType("oneTime")}>One-time · 50 pts</button>
                <button className={goalType === "daily" ? "selected" : ""} onClick={() => setGoalType("daily")}>Daily · 10/day</button>
              </div>

              <p className="scoreHint">
                {goalType === "oneTime"
                  ? "Complete it once during the week for 50 points."
                  : "Check off each day you complete it. Seven days = 70 possible points."}
              </p>

              <button className="primary" onClick={() => void saveGoal()}>
                {editingGoalId !== null ? "Save changes" : "Add to the week"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function GoalSection({
  title,
  subtitle,
  goals,
  today,
  onToggleOneTime,
  onToggleDaily,
  onEdit,
  onDelete,
  onAdd
}: {
  title: string;
  subtitle: string;
  goals: Goal[];
  today: DayKey;
  onToggleOneTime: (goal: Goal) => void;
  onToggleDaily: (goal: Goal, day: DayKey) => void;
  onEdit: (goal: Goal) => void;
  onDelete: (goal: Goal) => void;
  onAdd: () => void;
}) {
  return (
    <div className="goalSection">
      <div className="goalSectionHead">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <button className="miniAdd" onClick={onAdd}>＋</button>
      </div>

      <div className="goals">
        {goals.length === 0 ? (
          <button className="emptyGoals" onClick={onAdd}>＋ Add a goal here</button>
        ) : goals.map(goal => (
          <article key={goal.id} className={"goalCard " + (goal.type === "oneTime" && goal.done ? "done" : "")}>
            <div className="goalTop">
              {goal.type === "oneTime" ? (
                <button className="check" aria-label={"Toggle " + goal.title} onClick={() => onToggleOneTime(goal)}>
                  {goal.done ? "✓" : ""}
                </button>
              ) : (
                <span className="repeatMark">↻</span>
              )}

              <div className="goalText">
                <b>{goal.title}</b>
                <small>{goal.type === "oneTime" ? "One-time · 50 pts" : "Daily · 10/day"}</small>
              </div>

              <span className="pts">
                {goal.type === "oneTime"
                  ? "+" + goal.points
                  : earnedPoints(goal) + "/" + possiblePoints(goal)}
              </span>

              <div className="goalActions">
                <button onClick={() => onEdit(goal)} aria-label={"Edit " + goal.title} title="Edit">✎</button>
                <button onClick={() => onDelete(goal)} aria-label={"Delete " + goal.title} title="Delete">⌫</button>
              </div>
            </div>

            {goal.type === "daily" && (
              <div className="dayRow" aria-label={goal.title + " daily completion"}>
                {DAYS.map(day => {
                  const completed = goal.dailyDone.includes(day);
                  return (
                    <button
                      key={day}
                      className={"day " + (completed ? "complete" : "") + " " + (today === day ? "today" : "")}
                      onClick={() => onToggleDaily(goal, day)}
                      aria-pressed={completed}
                    >
                      <span>{day}</span>
                      <b>{completed ? "✓" : goal.points}</b>
                    </button>
                  );
                })}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function Score({
  name,
  score,
  max,
  active,
  onClick
}: {
  name: string;
  score: number;
  max: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button className={"score " + (active ? "active" : "")} onClick={onClick}>
      <span className="avatar">{name[0]?.toUpperCase() ?? "?"}</span>
      <span><small>{name}</small><strong>{score}</strong><em>/ {max} pts</em></span>
    </button>
  );
}
