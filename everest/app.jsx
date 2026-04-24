// Main app — auth gate + live data from Supabase.

const { useState, useEffect, useMemo, useRef, useCallback } = React;

const SHAPES = ['triangle', 'diamond', 'circle', 'square'];
const COLOR_PALETTE = [
  '#d85a1f', '#3e6b3a', '#2f6aa8', '#8a4fa0',
  '#b8860b', '#c0392b', '#16a085', '#7f5539',
];

function hashId(id) {
  let h = 0;
  for (const c of id || '') h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}
const colorFromId = id => COLOR_PALETTE[hashId(id) % COLOR_PALETTE.length];
const shapeFromId = id => SHAPES[hashId(id) % SHAPES.length];

function useLocalState(key, initial){
  const [v, setV] = useState(()=>{
    try { const raw = localStorage.getItem(key); return raw? JSON.parse(raw) : initial; }
    catch { return initial; }
  });
  useEffect(()=>{ try { localStorage.setItem(key, JSON.stringify(v)); } catch{} }, [key,v]);
  return [v, setV];
}

function App(){
  const auth = useAuth();

  if (auth.session === undefined) {
    return <div className="app-loading">Everest Challenge</div>;
  }
  if (!auth.session) {
    return <SignInPage signIn={auth.signIn}/>;
  }
  return <MainApp auth={auth}/>;
}

function MainApp({ auth }){
  const [climbersRaw, setClimbersRaw] = useState([]);
  const [hikes, setHikes] = useState([]);
  const [tweaks, setTweaks] = useLocalState("everest.tweaks.v2", { theme:"paper", avatarStyle:"hiker", units:"metric" });
  const [adding, setAdding] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [scrub, setScrub] = useState(1);
  const [toast, setToast] = useState(null);
  const [showTweaks, setShowTweaks] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [cs, hs] = await Promise.all([fetchClimbers(), fetchHikes()]);
      setClimbersRaw(cs);
      setHikes(hs.map(h => ({
        id: h.id, user_id: h.user_id, name: h.name,
        gain: h.gain_m, date: h.hiked_on,
      })));
      setLoadError(null);
    } catch (e) {
      setLoadError(e.message || 'Failed to load');
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(()=>{
    document.documentElement.setAttribute('data-theme', tweaks.theme);
  }, [tweaks.theme]);

  // Derive family (climbers) with display name + deterministic color/shape
  const family = useMemo(() => climbersRaw.map(c => {
    const fallback = (c.email || '').split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
    return {
      id: c.id,
      email: c.email,
      display_name: c.display_name,
      name: (c.display_name && c.display_name.trim()) || fallback,
      color: c.color || colorFromId(c.id),
      is_admin: c.is_admin,
      shape: shapeFromId(c.id),
    };
  }), [climbersRaw]);

  const currentUserId = auth.session.user.id;
  const currentClimber = family.find(f => f.id === currentUserId);
  const isAdmin = !!currentClimber?.is_admin;

  const sortedHikes = useMemo(() =>
    [...hikes].sort((a,b) => (a.date===b.date ? String(a.id).localeCompare(String(b.id)) : a.date.localeCompare(b.date))),
    [hikes]
  );

  const visibleCount = Math.round(sortedHikes.length * scrub);
  const visibleHikes = sortedHikes.slice(0, visibleCount);

  const climberProgress = useMemo(()=>{
    const tally = Object.fromEntries(family.map(f=>[f.id,{alt:0,hikes:0,gain:0}]));
    for (const h of visibleHikes){
      const t = tally[h.user_id]; if (!t) continue;
      t.alt = Math.min(SUMMIT, t.alt + h.gain);
      t.hikes++;
      t.gain += h.gain;
    }
    return tally;
  }, [visibleHikes, family]);

  const climbersOnMountain = family
    .map(f => ({ ...f, alt: climberProgress[f.id]?.alt || 0 }))
    .sort((a,b)=> a.alt - b.alt);

  const combinedAlt = Object.values(climberProgress).reduce((s,c)=>s+c.alt, 0);
  const totalHikes = visibleHikes.length;
  const summited = Object.values(climberProgress).filter(c=>c.alt>=SUMMIT).length;

  // Replay animation
  const rafRef = useRef(null);
  const lastT = useRef(0);
  useEffect(()=>{
    if (!playing) { cancelAnimationFrame(rafRef.current); return; }
    if (scrub >= 1) setScrub(0);
    lastT.current = performance.now();
    const tick = (t) => {
      const dt = (t - lastT.current)/1000;
      lastT.current = t;
      setScrub(prev => {
        const nxt = prev + (dt/8) * speed;
        if (nxt >= 1){ setPlaying(false); return 1; }
        return nxt;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return ()=>cancelAnimationFrame(rafRef.current);
  }, [playing, speed]);

  // Toast on checkpoint crossings during replay
  const lastReachedRef = useRef({});
  useEffect(()=>{
    if (!playing) return;
    let newToast = null;
    for (const c of climbersOnMountain){
      const reached = CHECKPOINTS.filter(cp => cp.alt>0 && c.alt >= cp.alt).pop();
      if (reached){
        const prev = lastReachedRef.current[c.id];
        if (prev !== reached.id){
          lastReachedRef.current[c.id] = reached.id;
          if (prev !== undefined){
            newToast = { climber: c, checkpoint: reached, key: Date.now() };
          }
        }
      }
    }
    if (newToast) setToast(newToast);
  }, [scrub, playing]);

  useEffect(()=>{
    if (!toast) return;
    const t = setTimeout(()=>setToast(null), 3000);
    return ()=>clearTimeout(t);
  }, [toast]);

  async function handleAddHike({ name, gain, date }){
    try {
      await insertHike({ name, gain_m: gain, hiked_on: date });
      await refresh();
      setScrub(1);
    } catch (e) {
      alert('Could not add hike: ' + (e.message || e));
    }
  }

  async function handleDeleteHike(h){
    const mine = h.user_id === currentUserId;
    const who = mine ? 'this hike' : `${family.find(f=>f.id===h.user_id)?.name || 'this user'}'s hike`;
    if (!confirm(`Delete ${who} ("${h.name}")?`)) return;
    try {
      await deleteHike(h.id);
      await refresh();
    } catch (e) {
      alert('Could not delete: ' + (e.message || e));
    }
  }

  const canDelete = (h) => h.user_id === currentUserId || isAdmin;

  const formatAlt = (m) => tweaks.units === 'imperial'
    ? `${Math.round(m * 3.28084).toLocaleString()} ft`
    : `${Math.round(m).toLocaleString()} m`;

  return (
    <div className="app">
      <TopBar
        onAdd={()=>setAdding(true)}
        onToggleTweaks={()=>setShowTweaks(v=>!v)}
        totalClimbed={combinedAlt}
        formatAlt={formatAlt}
      />

      {loadError && (
        <div className="banner-err">
          Couldn't load data from Supabase: {loadError}.{' '}
          <button onClick={refresh} style={{textDecoration:'underline'}}>Retry</button>
        </div>
      )}

      <section className="headline">
        <div>
          <div className="chip" style={{marginBottom:18}}>
            <span className="dot"/>
            The Family Everest Project · Est. 2025
          </div>
          <h1 className="serif h-title">
            {family.length} {family.length === 1 ? 'climber.' : 'climbers.'}<br/>
            One mountain.<br/>
            <em>8,849 meters.</em>
          </h1>
          <p className="h-sub">
            Every hike we take as a family adds to our collective ascent of Mount Everest.
            Log your vertical gain, watch the climbers move up the ridgeline, and replay the
            race from trailhead to summit.
          </p>
        </div>
        <div className="h-stats">
          <div className="h-stat">
            <div className="k">Combined altitude</div>
            <div className="v tnum">{formatAlt(combinedAlt)}</div>
          </div>
          <div className="h-stat">
            <div className="k">Hikes logged</div>
            <div className="v tnum">{totalHikes}</div>
          </div>
          <div className="h-stat">
            <div className="k">On the summit</div>
            <div className="v tnum">{summited}<small>of {family.length || '—'}</small></div>
          </div>
        </div>
      </section>

      <div className="mountain-wrap">
        <div className="mtn-header">
          <div>
            <div className="title">The ascent · Side profile</div>
            <div className="sub serif">Trailhead → Summit</div>
          </div>
          <div className="legend">
            {family.map(f => (
              <div className="legend-item" key={f.id}>
                <span className="legend-sw" style={{background:f.color}}/>
                {f.name} · <span style={{color:'var(--ink-3)'}}>{formatAlt(climberProgress[f.id]?.alt || 0)}</span>
              </div>
            ))}
          </div>
        </div>

        <Mountain
          climbers={climbersOnMountain}
          avatarStyle={tweaks.avatarStyle}
        />

        <Replay
          playing={playing} setPlaying={setPlaying}
          scrub={scrub} setScrub={(v)=>{ setScrub(v); setPlaying(false); }}
          speed={speed} setSpeed={setSpeed}
          totalHikes={sortedHikes.length}
          visibleCount={visibleCount}
          currentDate={visibleHikes[visibleHikes.length-1]?.date}
        />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="sub">The climbers</div>
              <h3>Who's where</h3>
            </div>
          </div>
          <div className="climbers">
            {[...family].sort((a,b)=>(climberProgress[b.id]?.alt||0)-(climberProgress[a.id]?.alt||0)).map(f => {
              const p = climberProgress[f.id] || {alt:0,hikes:0,gain:0};
              const pct = Math.min(100, (p.alt/SUMMIT)*100);
              const nextCp = CHECKPOINTS.find(cp => cp.alt > p.alt);
              return (
                <div className="climber" key={f.id}>
                  <Avatar climber={f} style={tweaks.avatarStyle} size={48}/>
                  <div>
                    <div className="name">
                      {f.name}
                      {f.is_admin && <span className="admin-badge">admin</span>}
                    </div>
                    <div className="meta">
                      {p.hikes} {p.hikes===1?'hike':'hikes'} · {formatAlt(p.gain)} climbed
                      {nextCp && <> · Next: {nextCp.name}</>}
                    </div>
                    <div className="bar"><span style={{width:`${pct}%`, background:f.color}}/></div>
                  </div>
                  <div className="alt">
                    {formatAlt(p.alt).replace(/ (m|ft)$/, '')}
                    <small>{tweaks.units==='imperial'?'feet':'meters'} · {pct.toFixed(0)}%</small>
                  </div>
                </div>
              );
            })}
            {family.length === 0 && (
              <div className="empty">
                <span className="serif">No climbers yet.</span>
                Invite people via the Supabase dashboard to get started.
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="sub">The logbook</div>
              <h3>Recent hikes</h3>
            </div>
            <button className="btn ghost" onClick={()=>setAdding(true)}>
              <PlusIcon/> Log hike
            </button>
          </div>
          <div className="log">
            {sortedHikes.length===0 ? (
              <div className="empty">
                <span className="serif">No hikes yet.</span>
                Add your first climb to get moving.
              </div>
            ) : [...sortedHikes].reverse().map(h => {
              const c = family.find(f=>f.id===h.user_id);
              if (!c) return null;
              return (
                <div className="log-item" key={h.id}>
                  <div className="log-avatar" style={{background:c.color}}>{c.name[0]}</div>
                  <div>
                    <div className="log-name">{h.name}</div>
                    <div className="log-meta">{c.name} · {formatDate(h.date)}</div>
                  </div>
                  <div className="log-gain">
                    +{formatAlt(h.gain).replace(/ (m|ft)$/, '')}
                    <small>{tweaks.units==='imperial'?'ft gain':'m gain'}</small>
                  </div>
                  {canDelete(h) && (
                    <button className="log-delete" onClick={()=>handleDeleteHike(h)} aria-label="Delete hike" title="Delete">
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                        <path d="M2.5 4 H13.5"/>
                        <path d="M4 4 V13 a1 1 0 0 0 1 1 H11 a1 1 0 0 0 1 -1 V4"/>
                        <path d="M6 4 V2.5 a0.5 0.5 0 0 1 0.5 -0.5 H9.5 a0.5 0.5 0 0 1 0.5 0.5 V4"/>
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {adding && (
        <AddHikeModal
          onClose={()=>setAdding(false)}
          onSubmit={(data)=>{ handleAddHike(data); setAdding(false); }}
          hikes={sortedHikes}
        />
      )}

      {toast && <CheckpointToast toast={toast} formatAlt={formatAlt}/>}

      {showTweaks && (
        <TweaksPanel
          tweaks={tweaks}
          update={(patch)=>setTweaks({...tweaks, ...patch})}
          onClose={()=>setShowTweaks(false)}
          currentEmail={auth.session.user.email}
          currentName={currentClimber?.display_name || ''}
          onSaveName={async (newName)=>{ await setMyDisplayName(newName); await refresh(); }}
          onSignOut={auth.signOut}
        />
      )}
    </div>
  );
}

function TopBar({ onAdd, onToggleTweaks, totalClimbed, formatAlt }){
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M2 20 L9 8 L13 14 L17 6 L22 20 Z" fill="var(--ink)" stroke="none"/>
            <path d="M9 8 L11 11 L13 9" stroke="var(--paper)" strokeWidth="1.2"/>
          </svg>
        </div>
        <div>
          <div className="brand-title serif">The Everest Project</div>
          <div className="brand-sub">A family climb · {formatAlt(totalClimbed)} of 8,849 m</div>
        </div>
      </div>
      <div className="topbar-right">
        <button className="icon-btn" onClick={onToggleTweaks} aria-label="Settings">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
        <button className="btn accent" onClick={onAdd}><PlusIcon/> Log a hike</button>
      </div>
    </header>
  );
}

function Replay({ playing, setPlaying, scrub, setScrub, speed, setSpeed, totalHikes, visibleCount, currentDate }){
  const pct = (scrub*100).toFixed(1);
  return (
    <div className="replay">
      <button className="play" onClick={()=>setPlaying(!playing)} aria-label={playing?"Pause":"Play"}>
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="1" width="3.5" height="12" rx="1"/><rect x="8.5" y="1" width="3.5" height="12" rx="1"/></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M3 1 L12 7 L3 13 Z"/></svg>
        )}
      </button>
      <div className="speed">
        {[0.5, 1, 2, 4].map(s => (
          <button key={s} className={speed===s?'active':''} onClick={()=>setSpeed(s)}>{s}×</button>
        ))}
      </div>
      <div className="track">
        <input
          type="range" min="0" max="1000" value={Math.round(scrub*1000)}
          onChange={e=>setScrub(Number(e.target.value)/1000)}
          style={{'--pct':`${pct}%`}}
        />
      </div>
      <div className="readout tnum">
        <b>{visibleCount}</b>/{totalHikes} hikes
        {currentDate && <> · {formatDate(currentDate, true)}</>}
      </div>
    </div>
  );
}

function Avatar({ climber, style, size=32 }){
  const { color, name, shape } = climber;
  const initials = name.slice(0,1).toUpperCase();
  const s = size;
  if (style === "initials"){
    return (
      <div style={{width:s, height:s, borderRadius:999, background:color,
        display:'grid', placeItems:'center', color:'#fff',
        fontWeight:600, fontSize:s*0.38, border:'2px solid var(--paper)'}}>{initials}</div>
    );
  }
  if (style === "silhouette"){
    return (
      <div style={{width:s, height:s, borderRadius:999, background:color,
        display:'grid', placeItems:'center', border:'2px solid var(--paper)'}}>
        <svg width={s*0.6} height={s*0.6} viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="10" cy="5" r="2.5" fill="#fff" stroke="none"/>
          <path d="M 10 8 L 10 14"/>
          <path d="M 10 10 L 15 8"/>
          <path d="M 10 10 L 6 11"/>
          <path d="M 10 14 L 7 19"/>
          <path d="M 10 14 L 13 18"/>
        </svg>
      </div>
    );
  }
  const common = { width:s, height:s, flexShrink:0 };
  return (
    <svg style={common} viewBox="0 0 40 40">
      {shape==="circle" && <circle cx="20" cy="20" r="18" fill={color} stroke="var(--paper)" strokeWidth="2"/>}
      {shape==="square" && <rect x="3" y="3" width="34" height="34" rx="6" fill={color} stroke="var(--paper)" strokeWidth="2"/>}
      {shape==="triangle" && <polygon points="20,3 37,34 3,34" fill={color} stroke="var(--paper)" strokeWidth="2" strokeLinejoin="round"/>}
      {shape==="diamond" && <polygon points="20,2 38,20 20,38 2,20" fill={color} stroke="var(--paper)" strokeWidth="2" strokeLinejoin="round"/>}
      <text x="20" y="25" textAnchor="middle" fontSize="16" fontWeight="600" fill="#fff" fontFamily="Inter">{initials}</text>
    </svg>
  );
}

function AddHikeModal({ onClose, onSubmit, hikes }){
  const [name, setName] = useState("");
  const [gain, setGain] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Deduplicated (name, gain) suggestions, from every user's past hikes.
  const suggestions = useMemo(() => {
    const seen = new Map();
    for (const h of hikes) {
      const key = h.name.toLowerCase().trim() + '|' + h.gain;
      if (!seen.has(key)) seen.set(key, { name: h.name, gain: h.gain });
    }
    return [...seen.values()].sort((a,b) => a.name.localeCompare(b.name));
  }, [hikes]);

  const filtered = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (!q) return suggestions.slice(0, 6);
    return suggestions.filter(s => s.name.toLowerCase().includes(q)).slice(0, 6);
  }, [name, suggestions]);

  function pick(s){
    setName(s.name);
    setGain(String(s.gain));
    setShowSuggestions(false);
  }

  function submit(e){
    e.preventDefault();
    const g = Number(gain);
    if (!name.trim() || !g || g <= 0) return;
    onSubmit({ name:name.trim(), gain:g, date });
  }

  return (
    <div className="scrim" onClick={onClose}>
      <form className="modal" onClick={e=>e.stopPropagation()} onSubmit={submit}>
        <div className="modal-head">
          <div style={{fontSize:10, letterSpacing:'.14em', textTransform:'uppercase', color:'var(--ink-3)'}}>
            New entry · Logbook
          </div>
          <h2>Log a hike</h2>
          <div className="modal-sub">Add vertical gain to your collective climb.</div>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Hike name</label>
            <div className="autocomplete">
              <input type="text" placeholder="Mission Peak, Mt. Tam…"
                value={name}
                onChange={e=>{ setName(e.target.value); setShowSuggestions(true); }}
                onFocus={()=>setShowSuggestions(true)}
                onBlur={()=>setTimeout(()=>setShowSuggestions(false), 150)}
                autoFocus
                autoComplete="off"/>
              {showSuggestions && filtered.length > 0 && (
                <div className="autocomplete-list">
                  {filtered.map((s, i) => (
                    <div key={i} className="autocomplete-item" onMouseDown={()=>pick(s)}>
                      <span>{s.name}</span>
                      <span className="g">{s.gain.toLocaleString()} m</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="field">
            <label>Vertical climb</label>
            <div className="row">
              <input type="number" placeholder="e.g. 750" min="1"
                value={gain} onChange={e=>setGain(e.target.value)}/>
              <div className="unit">meters</div>
            </div>
          </div>
          <div className="field">
            <label>Date</label>
            <input type="text" value={date} onChange={e=>setDate(e.target.value)}/>
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn accent">Add to logbook</button>
        </div>
      </form>
    </div>
  );
}

function CheckpointToast({ toast, formatAlt }){
  const { climber, checkpoint } = toast;
  return (
    <div className="toast" key={toast.key}>
      <div style={{width:34,height:34,borderRadius:999,background:climber.color,display:'grid',placeItems:'center',color:'#fff',fontWeight:600}}>
        {climber.name[0]}
      </div>
      <div>
        <div className="k">{climber.name} reached</div>
        <div className="ser">{checkpoint.name} · {formatAlt(checkpoint.alt)}</div>
      </div>
    </div>
  );
}

function TweaksPanel({ tweaks, update, onClose, currentEmail, currentName, onSaveName, onSignOut }){
  const [nameDraft, setNameDraft] = useState(currentName);
  const [saving, setSaving] = useState(false);
  useEffect(()=>{ setNameDraft(currentName); }, [currentName]);
  const dirty = nameDraft.trim() !== (currentName || '').trim();
  async function saveName(){
    if (!dirty) return;
    setSaving(true);
    try { await onSaveName(nameDraft.trim()); } catch (e) { alert('Could not save: ' + (e.message || e)); }
    setSaving(false);
  }
  return (
    <div className="tweaks">
      <div className="tweaks-head">
        <div>
          <div className="t">Tweaks</div>
          <div className="ser">Shape the climb</div>
        </div>
        {onClose && (
          <button className="icon-btn" onClick={onClose} aria-label="Close tweaks" style={{width:28,height:28}}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M2 2 L10 10"/><path d="M10 2 L2 10"/>
            </svg>
          </button>
        )}
      </div>
      <div className="tweaks-body">
        <div className="tweak-row">
          <span className="lab">Your name</span>
          <div className="name-edit">
            <input
              type="text"
              value={nameDraft}
              onChange={e=>setNameDraft(e.target.value)}
              onKeyDown={e=>{ if (e.key==='Enter'){ e.preventDefault(); saveName(); } }}
              placeholder="What should we call you?"
              className="name-edit-input"
            />
            <button
              type="button"
              className="name-edit-save"
              disabled={!dirty || saving}
              onClick={saveName}
            >{saving ? '…' : 'Save'}</button>
          </div>
        </div>
        <div className="tweak-row">
          <span className="lab">Theme</span>
          <div className="seg">
            {[['paper','Paper'],['moss','Moss'],['ink','Ink']].map(([k,l]) => (
              <button key={k} className={tweaks.theme===k?'on':''} onClick={()=>update({theme:k})}>{l}</button>
            ))}
          </div>
        </div>
        <div className="tweak-row">
          <span className="lab">Climber icons</span>
          <div className="seg">
            {[['hiker','Hikers'],['shape','Crests'],['initials','Initials'],['silhouette','Dots']].map(([k,l]) => (
              <button key={k} className={tweaks.avatarStyle===k?'on':''} onClick={()=>update({avatarStyle:k})}>{l}</button>
            ))}
          </div>
        </div>
        <div className="tweak-row">
          <span className="lab">Units</span>
          <div className="seg">
            {[['metric','Metric'],['imperial','Imperial']].map(([k,l]) => (
              <button key={k} className={tweaks.units===k?'on':''} onClick={()=>update({units:k})}>{l}</button>
            ))}
          </div>
        </div>
      </div>
      {currentEmail && (
        <div className="tweaks-foot">
          <span title={currentEmail}>{currentEmail}</span>
          <button onClick={onSignOut}>Sign out</button>
        </div>
      )}
    </div>
  );
}

function PlusIcon(){
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M6 1 L6 11"/><path d="M1 6 L11 6"/>
    </svg>
  );
}

function formatDate(iso, compact=false){
  if (!iso) return '';
  const d = new Date(iso+'T00:00:00');
  if (isNaN(d)) return iso;
  const opts = compact ? {month:'short', day:'numeric', year:'2-digit'} : {month:'short', day:'numeric', year:'numeric'};
  return d.toLocaleDateString('en-US', opts);
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
