"use client";

import { useMemo, useState } from "react";

type Player = "Carlo" | "Lindsey";
type AssignedBy = "self" | "partner";
type GoalType = "oneTime" | "daily";
type DayKey = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

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

const initialGoals: Goal[] = [
  { id: 1, player: "Carlo", title: "Finish project milestone", assignedBy: "self", type: "oneTime", done: false, dailyDone: [] },
  { id: 2, player: "Carlo", title: "3 rehab sessions", assignedBy: "self", type: "daily", done: false, dailyDone: ["Mon", "Wed"] },
  { id: 3, player: "Carlo", title: "Plan our date night", assignedBy: "partner", type: "oneTime", done: true, dailyDone: [] },
  { id: 4, player: "Carlo", title: "No phone during dinner", assignedBy: "partner", type: "daily", done: false, dailyDone: ["Mon", "Tue"] },
  { id: 5, player: "Lindsey", title: "Finish personal project", assignedBy: "self", type: "oneTime", done: true, dailyDone: [] },
  { id: 6, player: "Lindsey", title: "Workout", assignedBy: "self", type: "daily", done: false, dailyDone: ["Mon", "Tue", "Thu"] },
  { id: 7, player: "Lindsey", title: "Pick a family activity", assignedBy: "partner", type: "oneTime", done: false, dailyDone: [] },
  { id: 8, player: "Lindsey", title: "Read 30 minutes", assignedBy: "partner", type: "daily", done: false, dailyDone: ["Wed"] }
];

function getCurrentDayKey(): DayKey {
  const jsDay = new Date().getDay();
  return DAYS[(jsDay + 6) % 7];
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

export default function GameBoard() {
  const [goals, setGoals] = useState(initialGoals);
  const [active, setActive] = useState<Player>("Carlo");
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [assignedBy, setAssignedBy] = useState<AssignedBy>("self");
  const [goalType, setGoalType] = useState<GoalType>("oneTime");

  const today = getCurrentDayKey();
  const weekLabel = getWeekLabel();

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

  function addGoal() {
    if (!title.trim()) return;

    setGoals(gs => [...gs, {
      id: Date.now(),
      player: active,
      title: title.trim(),
      assignedBy,
      type: goalType,
      done: false,
      dailyDone: []
    }]);

    setTitle("");
    setAssignedBy("self");
    setGoalType("oneTime");
    setShowAdd(false);
  }

  const activeGoals = goals.filter(g => g.player === active);
  const leader = scores.Carlo === scores.Lindsey
    ? "Tie game"
    : scores.Carlo > scores.Lindsey
      ? "Carlo leads"
      : "Lindsey leads";

  const activeEarned = activeGoals.reduce((sum, goal) => sum + earnedPoints(goal), 0);
  const activePossible = activeGoals.reduce((sum, goal) => sum + possiblePoints(goal), 0);
  const progress = activePossible ? activeEarned / activePossible * 100 : 0;

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="eyebrow">GOALS GAME</p>
          <h1>Win the week <span>together.</span></h1>
          <p className="sub">{weekLabel} · Today is {today}</p>
        </div>
        <div className="streak">🔥 <b>1</b><small>week streak</small></div>
      </header>

      <section className="scoreboard">
        <Score name="Carlo" score={scores.Carlo} max={maxPoints("Carlo")} active={active === "Carlo"} onClick={() => setActive("Carlo")} />
        <div className="versus"><b>VS</b><span>{leader}</span></div>
        <Score name="Lindsey" score={scores.Lindsey} max={maxPoints("Lindsey")} active={active === "Lindsey"} onClick={() => setActive("Lindsey")} />
      </section>

      <section className="card">
        <div className="sectionHead">
          <div>
            <p className="eyebrow">{active.toUpperCase()}'S GOALS</p>
            <h2>Make your moves.</h2>
          </div>
          <button className="add" onClick={() => setShowAdd(true)}>＋ Add goal</button>
        </div>

        <div className="goals">
          {activeGoals.map(goal => (
            <article key={goal.id} className={`goalCard ${goal.type === "oneTime" && goal.done ? "done" : ""}`}>
              <div className="goalTop">
                {goal.type === "oneTime" ? (
                  <button className="check" aria-label={`Toggle ${goal.title}`} onClick={() => toggleOneTime(goal.id)}>
                    {goal.done ? "✓" : ""}
                  </button>
                ) : (
                  <span className="repeatMark">↻</span>
                )}

                <div className="goalText">
                  <b>{goal.title}</b>
                  <small>
                    {goal.assignedBy === "self" ? "My goal" : "Partner challenge"} · {goal.type === "oneTime" ? "One-time" : "Daily"}
                  </small>
                </div>

                <span className="pts">
                  {goal.type === "oneTime"
                    ? `+${ONE_TIME_POINTS}`
                    : `${earnedPoints(goal)}/${possiblePoints(goal)}`}
                </span>
              </div>

              {goal.type === "daily" && (
                <div className="dayRow" aria-label={`${goal.title} daily completion`}>
                  {DAYS.map(day => {
                    const completed = goal.dailyDone.includes(day);
                    return (
                      <button
                        key={day}
                        className={`day ${completed ? "complete" : ""} ${today === day ? "today" : ""}`}
                        onClick={() => toggleDaily(goal.id, day)}
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
      </section>

      <section className="progressCard">
        <div>
          <p className="eyebrow">WEEKLY PROGRESS</p>
          <b>{activeEarned} of {activePossible} possible points</b>
        </div>
        <div className="bar"><span style={{ width: `${progress}%` }} /></div>
        <p className="motivate">One-time goals are worth 50. Daily goals earn 10 each completed day.</p>
      </section>

      <button className="closeWeek" onClick={() => alert(`Current score — Carlo ${scores.Carlo}, Lindsey ${scores.Lindsey}. Keep playing through Sunday!`)}>
        🏁 Preview week result
      </button>

      {showAdd && (
        <div className="modalBack" onClick={() => setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <p className="eyebrow">NEW GOAL · {active.toUpperCase()}</p>
            <h2>Add something worth chasing.</h2>

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

            <button className="primary" onClick={addGoal}>Add to the week</button>
          </div>
        </div>
      )}
    </main>
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
