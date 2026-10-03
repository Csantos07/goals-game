"use client";

import { useMemo, useState } from "react";

type Goal = {
  id: number;
  player: "Carlo" | "Lindsey";
  title: string;
  points: number;
  done: boolean;
  assignedBy: "self" | "partner";
};

const initialGoals: Goal[] = [
  { id: 1, player: "Carlo", title: "3 rehab sessions", points: 20, done: true, assignedBy: "self" },
  { id: 2, player: "Carlo", title: "Finish project milestone", points: 30, done: false, assignedBy: "self" },
  { id: 3, player: "Carlo", title: "Plan our date night", points: 25, done: true, assignedBy: "partner" },
  { id: 4, player: "Carlo", title: "No phone during dinner", points: 15, done: false, assignedBy: "partner" },
  { id: 5, player: "Lindsey", title: "3 workouts", points: 20, done: true, assignedBy: "self" },
  { id: 6, player: "Lindsey", title: "Finish personal project", points: 30, done: true, assignedBy: "self" },
  { id: 7, player: "Lindsey", title: "Pick a family activity", points: 25, done: false, assignedBy: "partner" },
  { id: 8, player: "Lindsey", title: "Read 30 minutes twice", points: 15, done: false, assignedBy: "partner" }
];

export default function GameBoard() {
  const [goals, setGoals] = useState(initialGoals);
  const [active, setActive] = useState<"Carlo" | "Lindsey">("Carlo");
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [points, setPoints] = useState(20);
  const [assignedBy, setAssignedBy] = useState<"self" | "partner">("self");

  const scores = useMemo(() => ({
    Carlo: goals.filter(g => g.player === "Carlo" && g.done).reduce((a,g) => a + g.points, 0),
    Lindsey: goals.filter(g => g.player === "Lindsey" && g.done).reduce((a,g) => a + g.points, 0)
  }), [goals]);

  const maxPoints = (p: "Carlo" | "Lindsey") =>
    goals.filter(g => g.player === p).reduce((a,g) => a + g.points, 0);

  function toggle(id: number) {
    setGoals(gs => gs.map(g => g.id === id ? {...g, done: !g.done} : g));
  }

  function addGoal() {
    if (!title.trim()) return;
    setGoals(gs => [...gs, {
      id: Date.now(), player: active, title: title.trim(), points, done: false, assignedBy
    }]);
    setTitle(""); setPoints(20); setShowAdd(false);
  }

  const activeGoals = goals.filter(g => g.player === active);
  const leader = scores.Carlo === scores.Lindsey ? "Tie game" :
    scores.Carlo > scores.Lindsey ? "Carlo leads" : "Lindsey leads";

  return (
    <main className="shell">
      <header className="top">
        <div>
          <p className="eyebrow">GOALS GAME</p>
          <h1>Win the week <span>together.</span></h1>
          <p className="sub">Oct 2–8 · Week 1</p>
        </div>
        <div className="streak">🔥 <b>1</b><small>week streak</small></div>
      </header>

      <section className="scoreboard">
        <Score name="Carlo" score={scores.Carlo} max={maxPoints("Carlo")} active={active==="Carlo"} onClick={()=>setActive("Carlo")} />
        <div className="versus"><b>VS</b><span>{leader}</span></div>
        <Score name="Lindsey" score={scores.Lindsey} max={maxPoints("Lindsey")} active={active==="Lindsey"} onClick={()=>setActive("Lindsey")} />
      </section>

      <section className="card">
        <div className="sectionHead">
          <div><p className="eyebrow">{active.toUpperCase()}'S GOALS</p><h2>Make your moves.</h2></div>
          <button className="add" onClick={()=>setShowAdd(true)}>＋ Add goal</button>
        </div>

        <div className="goals">
          {activeGoals.map(goal => (
            <button key={goal.id} className={`goal ${goal.done ? "done" : ""}`} onClick={()=>toggle(goal.id)}>
              <span className="check">{goal.done ? "✓" : ""}</span>
              <span className="goalText">
                <b>{goal.title}</b>
                <small>{goal.assignedBy === "self" ? "My goal" : "Partner challenge"}</small>
              </span>
              <span className="pts">+{goal.points}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="progressCard">
        <div><p className="eyebrow">WEEKLY PROGRESS</p><b>{activeGoals.filter(g=>g.done).length} of {activeGoals.length} goals complete</b></div>
        <div className="bar"><span style={{width: `${activeGoals.length ? activeGoals.filter(g=>g.done).length/activeGoals.length*100 : 0}%`}} /></div>
        <p className="motivate">Every completed goal moves the game forward.</p>
      </section>

      <button className="closeWeek" onClick={()=>alert(`Current score — Carlo ${scores.Carlo}, Lindsey ${scores.Lindsey}. Keep playing until the week closes!`)}>
        🏁 Preview week result
      </button>

      {showAdd && (
        <div className="modalBack" onClick={()=>setShowAdd(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <p className="eyebrow">NEW GOAL · {active.toUpperCase()}</p>
            <h2>Add something worth chasing.</h2>
            <label>Goal<input autoFocus value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Run twice this week" /></label>
            <label>Points<input type="number" min="5" step="5" value={points} onChange={e=>setPoints(Number(e.target.value))} /></label>
            <div className="seg">
              <button className={assignedBy==="self"?"selected":""} onClick={()=>setAssignedBy("self")}>My goal</button>
              <button className={assignedBy==="partner"?"selected":""} onClick={()=>setAssignedBy("partner")}>Partner challenge</button>
            </div>
            <button className="primary" onClick={addGoal}>Add to the week</button>
          </div>
        </div>
      )}
    </main>
  );
}

function Score({name, score, max, active, onClick}: {name:string; score:number; max:number; active:boolean; onClick:()=>void}) {
  return (
    <button className={`score ${active ? "active" : ""}`} onClick={onClick}>
      <span className="avatar">{name[0]}</span>
      <span><small>{name}</small><strong>{score}</strong><em>/ {max} pts</em></span>
    </button>
  );
}