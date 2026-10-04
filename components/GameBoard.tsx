"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

type Player = "Carlo" | "Lindsey";
type AssignedBy = "self" | "partner";
type GoalType = "oneTime" | "daily";
type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
type ThemeMode = "dark" | "light";

type Goal = {
  id: number;
  player: Player;
  title: string;
  assignedBy: AssignedBy;
  type: GoalType;
  done: boolean;
  dailyDone: DayKey[];
};

const DAYS: DayKey[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ONE_TIME_POINTS = 50;
const DAILY_POINTS = 10;
const ACCENTS = ["#c9ff54", "#8b5cf6", "#38bdf8", "#fb7185", "#f59e0b", "#22c55e"];
const STORAGE_KEY = "goals-game:v1";
const SUNDAY_CELEBRATION_KEY = "goals-game:last-sunday-celebration";

const initialGoals: Goal[] = [
  { id: 1, player: "Carlo", title: "Monday morning gym", assignedBy: "self", type: "oneTime", done: false, dailyDone: [] },
  { id: 2, player: "Carlo", title: "Wake up at 6:15", assignedBy: "self", type: "daily", done: false, dailyDone: ["Tue", "Wed"] },
  { id: 3, player: "Carlo", title: "Monday working in the office", assignedBy: "partner", type: "oneTime", done: false, dailyDone: [] },
  { id: 4, player: "Carlo", title: "Do something for Nico before work", assignedBy: "partner", type: "daily", done: false, dailyDone: ["Mon", "Tue", "Thu", "Fri"] },
  { id: 5, player: "Lindsey", title: "Call Advent", assignedBy: "self", type: "oneTime", done: false, dailyDone: [] },
  { id: 6, player: "Lindsey", title: "Nurse once and pump four times", assignedBy: "self", type: "daily", done: false, dailyDone: ["Tue", "Thu"] },
  { id: 7, player: "Lindsey", title: "Monday morning gym", assignedBy: "partner", type: "oneTime", done: true, dailyDone: [] },
  { id: 8, player: "Lindsey", title: "Pick dinner every night + night routine", assignedBy: "partner", type: "daily", done: false, dailyDone: ["Wed", "Fri", "Sat"] }
];

function getCurrentDayKey(): DayKey {
  const jsDay = new Date().getDay();
  return DAYS[(jsDay + 6) % 7];
}

function getWeekKey() {
  const now = new Date();
  const jsDay = now.getDay();
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(now);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(now.getDate() + diffToMonday);

  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, "0");
  const day = String(monday.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekLabel() {
  const now = new Date();
  const jsDay = now.getDay();
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(now);
  monday.setHours(12, 0, 0, 0);
  monday.setDate(now.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const month = new Intl.DateTimeFormat("en-US", { month: "short" });
  const sameMonth = monday.getMonth() === sunday.getMonth();

  return sameMonth
    ? `${month.format(monday)} ${monday.getDate()}–${sunday.getDate()}`
    : `${month.format(monday)} ${monday.getDate()}–${month.format(sunday)} ${sunday.getDate()}`;
}

function earnedPoints(goal: Goal) {
  return goal.type === "oneTime"
    ? goal.done ? ONE_TIME_POINTS : 0
    : goal.dailyDone.length * DAILY_POINTS;
}

function possiblePoints(goal: Goal) {
  return goal.type === "oneTime" ? ONE_TIME_POINTS : DAYS.length * DAILY_POINTS;
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

export default function GameBoard() {
  const [goals, setGoals] = useState(initialGoals);
  const [active, setActive] = useState<Player>("Lindsey");
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [assignedBy, setAssignedBy] = useState<AssignedBy>("self");
  const [goalType, setGoalType] = useState<GoalType>("oneTime");
  const [showMenu, setShowMenu] = useState(false);
  const [menuButtonVisible, setMenuButtonVisible] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showEnvelopes, setShowEnvelopes] = useState(false);
  const [showWeekResult, setShowWeekResult] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [accent, setAccent] = useState("#c9ff54");
  const [vacationBalance, setVacationBalance] = useState(350);
  const [hasLoadedSavedState, setHasLoadedSavedState] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          goals?: Goal[];
          active?: Player;
          themeMode?: ThemeMode;
          accent?: string;
          vacationBalance?: number;
        };

        if (Array.isArray(parsed.goals)) {
          setGoals(parsed.goals.map(goal =>
            goal.id === 4 && goal.title === "Close-out routine at work"
              ? { ...goal, title: "Do something for Nico before work" }
              : goal
          ));
        }
        if (parsed.active === "Carlo" || parsed.active === "Lindsey") setActive(parsed.active);
        if (parsed.themeMode === "dark" || parsed.themeMode === "light") setThemeMode(parsed.themeMode);
        if (typeof parsed.accent === "string") setAccent(parsed.accent);
        if (typeof parsed.vacationBalance === "number") setVacationBalance(parsed.vacationBalance);
      }
    } catch (error) {
      console.warn("Could not load saved Goals Game data.", error);
    } finally {
      setHasLoadedSavedState(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedSavedState) return;

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ goals, active, themeMode, accent, vacationBalance })
      );
    } catch (error) {
      console.warn("Could not save Goals Game data.", error);
    }
  }, [goals, active, themeMode, accent, vacationBalance, hasLoadedSavedState]);


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

  const today = getCurrentDayKey();
  const isSunday = new Date().getDay() === 0;
  const weekLabel = getWeekLabel();
  const weekKey = getWeekKey();

  useEffect(() => {
    if (!hasLoadedSavedState || !isSunday) return;

    try {
      const lastCelebratedWeek = window.localStorage.getItem(SUNDAY_CELEBRATION_KEY);
      if (lastCelebratedWeek !== weekKey) {
        setShowWeekResult(true);
        window.localStorage.setItem(SUNDAY_CELEBRATION_KEY, weekKey);
      }
    } catch (error) {
      console.warn("Could not track Sunday celebration state.", error);
      setShowWeekResult(true);
    }
  }, [hasLoadedSavedState, isSunday, weekKey]);
  const accentContrast = contrastText(accent);
  const themeStyle = {
    "--accent": accent,
    "--accent-contrast": accentContrast
  } as CSSProperties;

  const scores = useMemo(() => ({
    Carlo: goals.filter(g => g.player === "Carlo").reduce((sum, goal) => sum + earnedPoints(goal), 0),
    Lindsey: goals.filter(g => g.player === "Lindsey").reduce((sum, goal) => sum + earnedPoints(goal), 0)
  }), [goals]);

  const maxPoints = (player: Player) =>
    goals.filter(g => g.player === player).reduce((sum, goal) => sum + possiblePoints(goal), 0);

  function toggleOneTime(id: number) {
    setGoals(gs => gs.map(g => g.id === id ? { ...g, done: !g.done } : g));
  }

  function toggleDaily(id: number, day: DayKey) {
    setGoals(gs => gs.map(g => {
      if (g.id !== id) return g;
      const hasDay = g.dailyDone.includes(day);
      return {
        ...g,
        dailyDone: hasDay ? g.dailyDone.filter(d => d !== day) : [...g.dailyDone, day]
      };
    }));
  }

  function openAdd(assigned: AssignedBy = "self") {
    setEditingGoalId(null);
    setTitle("");
    setAssignedBy(assigned);
    setGoalType("oneTime");
    setShowGoalModal(true);
  }

  function openEdit(goal: Goal) {
    setEditingGoalId(goal.id);
    setTitle(goal.title);
    setAssignedBy(goal.assignedBy);
    setGoalType(goal.type);
    setShowGoalModal(true);
  }

  function saveGoal() {
    if (!title.trim()) return;

    if (editingGoalId !== null) {
      setGoals(gs => gs.map(goal => {
        if (goal.id !== editingGoalId) return goal;
        const changedType = goal.type !== goalType;
        return {
          ...goal,
          title: title.trim(),
          assignedBy,
          type: goalType,
          done: changedType ? false : goal.done,
          dailyDone: changedType ? [] : goal.dailyDone
        };
      }));
    } else {
      setGoals(gs => [...gs, {
        id: Date.now(),
        player: active,
        title: title.trim(),
        assignedBy,
        type: goalType,
        done: false,
        dailyDone: []
      }]);
    }

    setShowGoalModal(false);
    setEditingGoalId(null);
    setTitle("");
  }

  function deleteGoal(goal: Goal) {
    if (!window.confirm(`Delete "${goal.title}"?`)) return;
    setGoals(gs => gs.filter(g => g.id !== goal.id));
  }

  function resetToTestSeed() {
    const seededGoals = initialGoals.map(goal => ({ ...goal, dailyDone: [...goal.dailyDone] }));
    setGoals(seededGoals);
    setActive("Lindsey");
    setShowWeekResult(false);
    setShowEnvelopes(false);
    setShowMenu(false);

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          goals: seededGoals,
          active: "Lindsey",
          themeMode,
          accent,
          vacationBalance
        })
      );
      window.localStorage.removeItem(SUNDAY_CELEBRATION_KEY);
    } catch (error) {
      console.warn("Could not reset Goals Game test seed.", error);
    }
  }

  const activeGoals = goals.filter(g => g.player === active);
  const selfGoals = activeGoals.filter(g => g.assignedBy === "self");
  const partnerGoals = activeGoals.filter(g => g.assignedBy === "partner");

  const leader = scores.Carlo === scores.Lindsey
    ? "Tie game"
    : scores.Carlo > scores.Lindsey
      ? "Carlo leads"
      : "Lindsey leads";

  const winner = scores.Carlo === scores.Lindsey
    ? null
    : scores.Carlo > scores.Lindsey
      ? "Carlo"
      : "Lindsey";
  const activeEarned = activeGoals.reduce((sum, goal) => sum + earnedPoints(goal), 0);
  const activePossible = activeGoals.reduce((sum, goal) => sum + possiblePoints(goal), 0);
  const progress = activePossible ? activeEarned / activePossible * 100 : 0;

  return (
    <div className="appFrame" data-theme={themeMode} style={themeStyle}>
      <main className="shell">
        <button
          className={`menuButton menuOverlay ${menuButtonVisible ? "visible" : "hidden"} ${showMenu ? "open" : ""}`}
          onClick={() => setShowMenu(v => !v)}
          aria-expanded={showMenu}
          aria-label={showMenu ? "Close navigation" : "Open navigation"}
        >
          <span>{showMenu ? "×" : "☰"}</span>
        </button>

        <header className="top">
          <div>
            <p className="eyebrow">GOALS GAME</p>
            <h1>Win the week <span>together.</span></h1>
            <p className="sub">{weekLabel} · Today is {today}</p>
          </div>
        </header>

        <aside className={`fullScreenMenu ${showMenu ? "open" : ""}`} aria-hidden={!showMenu}>
          <nav className="fullScreenNav" aria-label="Primary navigation">
            <button onClick={() => { setShowEnvelopes(false); setShowMenu(false); }}>Game</button>
            <button onClick={() => { setShowEnvelopes(true); setShowMenu(false); }}>Envelopes</button>
            <button onClick={() => setShowSettings(v => !v)} aria-expanded={showSettings}>Settings</button>
          </nav>

          <div className="fullScreenMenuUtility">
            <span>TESTING</span>
            <button onClick={resetToTestSeed}>↺ Reset to test seed</button>
          </div>

          {showSettings && (
            <div className="fullScreenSettings">
              <div className="modeSwitch wordSwitch">
                <button className={themeMode === "dark" ? "selected" : ""} onClick={() => setThemeMode("dark")}>Dark</button>
                <button className={themeMode === "light" ? "selected" : ""} onClick={() => setThemeMode("light")}>Light</button>
              </div>

              <div className="swatches">
                {ACCENTS.map(color => (
                  <button
                    key={color}
                    className={`swatch ${accent.toLowerCase() === color.toLowerCase() ? "selected" : ""}`}
                    style={{ background: color }}
                    onClick={() => setAccent(color)}
                    aria-label={`Use ${color} accent`}
                  />
                ))}
                <label className="customColor">
                  <input type="color" value={accent} onChange={e => setAccent(e.target.value)} />
                  <span>Custom</span>
                </label>
              </div>
            </div>
          )}
        </aside>

        {showWeekResult && (
          <section className="weekResultOverlay" role="dialog" aria-modal="true" aria-labelledby="week-result-title">
            <div className="confettiBurst" aria-hidden="true">
              {Array.from({ length: 90 }, (_, index) => (
                <span
                  key={index}
                  style={{
                    "--x": `${(index * 37) % 100}%`,
                    "--delay": `${(index % 15) * 42}ms`,
                    "--drift": `${((index % 9) - 4) * 18}px`,
                    "--spin": `${180 + (index % 11) * 34}deg`
                  } as CSSProperties}
                />
              ))}
            </div>

            <button className="weekResultClose" onClick={() => setShowWeekResult(false)} aria-label="Close week result">×</button>

            <div className="weekResultContent">
              <p className="weekResultEyebrow">THIS WEEK&apos;S GAME IS CLOSED</p>
              <h2 id="week-result-title">{winner ? `${winner} wins the week.` : "This week ends in a tie."}</h2>
              <p className="weekResultScoreLabel">FINAL SCORE</p>
              <div className="weekResultScore">
                <span><b>Carlo</b><strong>{scores.Carlo}</strong></span>
                <em>—</em>
                <span><b>Lindsey</b><strong>{scores.Lindsey}</strong></span>
              </div>
              <button className="weekResultContinue" onClick={() => setShowWeekResult(false)}>
                {isSunday ? "View final board" : "Back to the game"}
              </button>
            </div>
          </section>
        )}

        <section className="scoreboard">
          <Score name="Carlo" score={scores.Carlo} max={maxPoints("Carlo")} active={active === "Carlo"} onClick={() => setActive("Carlo")} />
          <div className="versus"><b>VS</b><span>{leader}</span></div>
          <Score name="Lindsey" score={scores.Lindsey} max={maxPoints("Lindsey")} active={active === "Lindsey"} onClick={() => setActive("Lindsey")} />
        </section>

        <button className="vacationTile" onClick={() => setShowEnvelopes(true)}>
          <span className="vacationTileIcon">✉</span>
          <span className="vacationTileText">
            <small>ENVELOPE</small>
            <b>Vacation</b>
          </span>
          <strong>${vacationBalance.toLocaleString()}</strong>
          <span className="vacationTileArrow">›</span>
        </button>

        <section className="card">
          <div className="sectionHead">
            <div>
              <p className="eyebrow">{active.toUpperCase()}'S WEEK</p>
              <h2>Make your moves.</h2>
            </div>
            <button className="add" onClick={() => openAdd("self")}>＋ Add goal</button>
          </div>

          <GoalSection
            title="My Goals"
            subtitle="Goals you chose for yourself"
            goals={selfGoals}
            today={today}
            onToggleOneTime={toggleOneTime}
            onToggleDaily={toggleDaily}
            onEdit={openEdit}
            onDelete={deleteGoal}
            onAdd={() => openAdd("self")}
          />

          <GoalSection
            title="Partner Challenges"
            subtitle="Goals your partner set for you"
            goals={partnerGoals}
            today={today}
            onToggleOneTime={toggleOneTime}
            onToggleDaily={toggleDaily}
            onEdit={openEdit}
            onDelete={deleteGoal}
            onAdd={() => openAdd("partner")}
          />
        </section>

        <section className="progressCard">
          <div>
            <p className="eyebrow">WEEKLY PROGRESS</p>
            <b>{activeEarned} of {activePossible} possible points</b>
          </div>
          <div className="bar"><span style={{ width: `${progress}%` }} /></div>
          <p className="motivate">One-time goals are worth 50. Daily goals earn 10 each completed day.</p>
        </section>

        <button className="closeWeek" onClick={() => setShowWeekResult(true)}>
          🏁 {isSunday ? "View final result" : "Preview Sunday closeout"}
        </button>

        {showEnvelopes && (
          <section className="envelopePage">
            <div className="envelopePageInner">
              <button className="backButton" onClick={() => setShowEnvelopes(false)}>← Back</button>

              <div className="envelopePageHead">
                <div>
                  <p className="eyebrow">ENVELOPES</p>
                  <h2>Your winnings.</h2>
                </div>
                <strong className="envelopeTotal">${vacationBalance.toLocaleString()}</strong>
              </div>

              <button className="envelopeRow">
                <span className="envelopeIcon">✉</span>
                <span className="envelopeName"><b>Vacation</b><small>Current envelope</small></span>
                <strong>${vacationBalance.toLocaleString()}</strong>
              </button>

              <div className="emptyEnvelope">
                <span>＋</span>
                <span><b>New envelope</b><small>Available when you decide to open one</small></span>
              </div>
            </div>
          </section>
        )}

        {showGoalModal && (
          <div className="modalBack" onClick={() => setShowGoalModal(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <p className="eyebrow">{editingGoalId !== null ? "EDIT GOAL" : "NEW GOAL"} · {active.toUpperCase()}</p>
              <h2>{editingGoalId !== null ? "Change the play." : "Add something worth chasing."}</h2>

              <label>
                Goal
                <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Read before bed" />
              </label>

              <p className="choiceLabel">Who set it?</p>
              <div className="seg">
                <button className={assignedBy === "self" ? "selected" : ""} onClick={() => setAssignedBy("self")}>My goal</button>
                <button className={assignedBy === "partner" ? "selected" : ""} onClick={() => setAssignedBy("partner")}>Partner challenge</button>
              </div>

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

              <button className="primary" onClick={saveGoal}>{editingGoalId !== null ? "Save changes" : "Add to the week"}</button>
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
  onToggleOneTime: (id: number) => void;
  onToggleDaily: (id: number, day: DayKey) => void;
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
          <article key={goal.id} className={`goalCard ${goal.type === "oneTime" && goal.done ? "done" : ""}`}>
            <div className="goalTop">
              {goal.type === "oneTime" ? (
                <button className="check" aria-label={`Toggle ${goal.title}`} onClick={() => onToggleOneTime(goal.id)}>
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
                  ? `+${ONE_TIME_POINTS}`
                  : `${earnedPoints(goal)}/${possiblePoints(goal)}`}
              </span>

              <div className="goalActions">
                <button onClick={() => onEdit(goal)} aria-label={`Edit ${goal.title}`} title="Edit">✎</button>
                <button onClick={() => onDelete(goal)} aria-label={`Delete ${goal.title}`} title="Delete">⌫</button>
              </div>
            </div>

            {goal.type === "daily" && (
              <div className="dayRow" aria-label={`${goal.title} daily completion`}>
                {DAYS.map(day => {
                  const completed = goal.dailyDone.includes(day);
                  return (
                    <button
                      key={day}
                      className={`day ${completed ? "complete" : ""} ${today === day ? "today" : ""}`}
                      onClick={() => onToggleDaily(goal.id, day)}
                      aria-pressed={completed}
                    >
                      <span>{day}</span>
                      <b>{completed ? "✓" : DAILY_POINTS}</b>
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

function Score({ name, score, max, active, onClick }: { name: string; score: number; max: number; active: boolean; onClick: () => void }) {
  return (
    <button className={`score ${active ? "active" : ""}`} onClick={onClick}>
      <span className="avatar">{name[0]}</span>
      <span><small>{name}</small><strong>{score}</strong><em>/ {max} pts</em></span>
    </button>
  );
}
