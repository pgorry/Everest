// Mountain silhouette with side-profile + climbers ascending

const { useMemo } = React;

// Viewbox
const VB_W = 1200;
const VB_H = 520;
const PAD = { l: 60, r: 110, t: 60, b: 90 };
const INNER_W = VB_W - PAD.l - PAD.r;
const INNER_H = VB_H - PAD.t - PAD.b;

// Build a ridgeline curve from start (bottom-left) to summit (top-right-ish).
// We lay checkpoints along a path where x = progress fraction, y = altitude fraction.
// Each checkpoint gets a fractional x along the trail — not linear with altitude.
// Some rubber in the path so it feels like terrain.
function checkpointGeometry() {
  // pct along the horizontal journey from start -> summit
  // Trailhead → Lukla is given a long, gentle approach so the actual
  // mountain climb (Lukla onward) reads as steep and peaky.
  const xs = {
    start:0.00, ktm:0.12, phap:0.24, lukla:0.36, nb:0.46, bc:0.60, c1:0.68, c2:0.74, c3:0.81, c4:0.88,
    bal:0.94, hs:0.98, sum:1.00
  };
  return CHECKPOINTS.map(cp => {
    const fx = xs[cp.id] ?? (cp.alt/SUMMIT);
    const fy = cp.alt/SUMMIT;
    return {
      ...cp,
      x: PAD.l + fx * INNER_W,
      y: PAD.t + INNER_H * (1 - fy),
      fx, fy,
    };
  });
}

// Generate a smooth ridgeline path from checkpoint positions, with extra
// interpolation points so the mountain has texture (jagged ridges).
function ridgelinePath(pts) {
  // Sample intermediate points between checkpoints with small vertical jitter
  // that's deterministic so it doesn't shimmer.
  const rng = mulberry32(9);
  const sampled = [];
  for (let i=0; i<pts.length-1; i++){
    const a = pts[i], b = pts[i+1];
    sampled.push({x:a.x, y:a.y});
    const steps = 6;
    for (let s=1; s<steps; s++){
      const t = s/steps;
      // cubic-ease so ridges aren't linear
      const ease = t<0.5 ? 2*t*t : 1 - Math.pow(-2*t+2,2)/2;
      const x = a.x + (b.x-a.x)*t;
      const y = a.y + (b.y-a.y)*ease;
      const jitter = (rng()-0.5) * Math.min(18, Math.abs(b.y-a.y)*0.25);
      sampled.push({ x, y: y + jitter });
    }
  }
  sampled.push({x:pts[pts.length-1].x, y:pts[pts.length-1].y});

  // Build catmull-rom-ish smooth path
  let d = `M ${sampled[0].x},${sampled[0].y}`;
  for (let i=0;i<sampled.length-1;i++){
    const p0 = sampled[Math.max(0,i-1)];
    const p1 = sampled[i];
    const p2 = sampled[i+1];
    const p3 = sampled[Math.min(sampled.length-1,i+2)];
    const c1x = p1.x + (p2.x-p0.x)/6;
    const c1y = p1.y + (p2.y-p0.y)/6;
    const c2x = p2.x - (p3.x-p1.x)/6;
    const c2y = p2.y - (p3.y-p1.y)/6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return { d, sampled };
}

// Deterministic prng
function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

// Given a ridgeline (ordered sampled points) and a distance fraction along the trail,
// return {x,y,angle} for a climber dot. Distance is measured as accumulated length.
function pointOnPath(sampled, frac){
  frac = Math.max(0, Math.min(1, frac));
  // compute cumulative lengths
  let total = 0;
  const lens = [0];
  for (let i=1;i<sampled.length;i++){
    const dx = sampled[i].x-sampled[i-1].x, dy = sampled[i].y-sampled[i-1].y;
    total += Math.hypot(dx,dy);
    lens.push(total);
  }
  const target = frac*total;
  // find segment
  let lo=0, hi=lens.length-1;
  while(lo<hi-1){
    const mid = (lo+hi)>>1;
    if (lens[mid] < target) lo = mid; else hi = mid;
  }
  const segStart = sampled[lo], segEnd = sampled[hi];
  const segLen = lens[hi]-lens[lo] || 1;
  const t = (target - lens[lo]) / segLen;
  return {
    x: segStart.x + (segEnd.x-segStart.x)*t,
    y: segStart.y + (segEnd.y-segStart.y)*t,
  };
}

// Map altitude (meters) -> fraction along the path.
// Path fraction isn't linear in altitude since checkpoints have fx set manually.
function altToPathFrac(alt, cpGeom, sampled){
  if (alt <= 0) return 0;
  if (alt >= SUMMIT) return 1;
  // find surrounding checkpoints by alt
  let lo=0, hi=cpGeom.length-1;
  for (let i=0;i<cpGeom.length-1;i++){
    if (cpGeom[i].alt <= alt && cpGeom[i+1].alt >= alt){ lo=i; hi=i+1; break; }
  }
  const a = cpGeom[lo], b = cpGeom[hi];
  const t = (alt - a.alt) / Math.max(1, (b.alt - a.alt));
  const fx = a.fx + (b.fx - a.fx) * t;
  return fx;
}

function Mountain({ climbers, avatarStyle }) {
  const cpGeom = useMemo(checkpointGeometry, []);
  const { d, sampled } = useMemo(() => ridgelinePath(cpGeom), [cpGeom]);

  // Create closed polygon for the mountain fill (ridge + bottom)
  const fillD = `${d} L ${PAD.l+INNER_W},${PAD.t+INNER_H} L ${PAD.l},${PAD.t+INNER_H} Z`;

  // Snow caps: above ~7000m the ridge gets snow. We build a fill path
  // that traces only the ridge segments lying above snowY, closed along
  // the snowline — so snow follows peaks instead of being a flat band.
  const SNOW_ALT = 7000;
  const snowY = PAD.t + INNER_H * (1 - SNOW_ALT/SUMMIT);

  // Build snow polygons by walking `sampled` and grouping spans whose y < snowY.
  const snowPaths = [];
  {
    let span = null;
    const flush = () => {
      if (!span || span.length < 2) { span = null; return; }
      // Close along snowline: go right-most x at snowY, then left-most x at snowY.
      const first = span[0], last = span[span.length-1];
      let d = `M ${first.x},${snowY} L ${first.x},${first.y}`;
      for (let i=1;i<span.length;i++) d += ` L ${span[i].x},${span[i].y}`;
      d += ` L ${last.x},${snowY} Z`;
      snowPaths.push(d);
      span = null;
    };
    // Helper: linear interp between two sampled points to y=snowY
    const crossX = (a,b) => {
      const t = (snowY - a.y) / (b.y - a.y);
      return a.x + (b.x - a.x) * t;
    };
    for (let i=0; i<sampled.length; i++){
      const p = sampled[i];
      const prev = sampled[i-1];
      const above = p.y < snowY;
      const prevAbove = prev ? prev.y < snowY : false;
      if (above && !prevAbove && prev){
        // entered snow — add crossing point
        span = [{ x: crossX(prev, p), y: snowY }, p];
      } else if (above && prevAbove){
        span.push(p);
      } else if (!above && prevAbove){
        // left snow — add crossing and flush
        span.push({ x: crossX(prev, p), y: snowY });
        flush();
      } else if (above && !prev){
        span = [p];
      }
    }
    flush();
  }

  // Altitude axis ticks (right side)
  const axisAlts = [0, 2000, 4000, 6000, 8000, 8849];

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="mtn-svg" preserveAspectRatio="xMidYMid meet">
      {/* Altitude axis */}
      <g className="altitude-axis">
        {axisAlts.map(a=>{
          const y = PAD.t + INNER_H*(1 - a/SUMMIT);
          return (
            <g key={a}>
              <line x1={PAD.l} x2={VB_W-PAD.r+30} y1={y} y2={y}/>
              <text x={VB_W-PAD.r+38} y={y+3} textAnchor="start">{a.toLocaleString()}m</text>
            </g>
          );
        })}
      </g>

      {/* Clouds / atmospheric band */}
      <defs>
        <linearGradient id="mtn-grad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--ink)" stopOpacity="0.92"/>
          <stop offset="100%" stopColor="var(--ink)" stopOpacity="0.78"/>
        </linearGradient>
        <clipPath id="mtn-clip"><path d={fillD}/></clipPath>
      </defs>

      {/* Far ridge (ghost) */}
      <path
        d={d}
        transform={`translate(30, 40)`}
        fill="none"
        stroke="var(--ink)"
        strokeOpacity="0.15"
        strokeWidth="1"
      />

      {/* Main mountain fill */}
      <path d={fillD} fill="url(#mtn-grad)" />

      {/* Snow caps — only the peaks above the snowline */}
      {snowPaths.map((sd, i) => (
        <path key={i} d={sd} fill="var(--snow)" opacity="0.96"/>
      ))}
      {/* A faint dashed snowline reference */}
      <line x1={PAD.l} x2={VB_W-PAD.r} y1={snowY} y2={snowY}
            stroke="var(--ink)" strokeOpacity="0.12" strokeWidth="0.8" strokeDasharray="2 5"/>

      {/* Ridge stroke on top */}
      <path d={d} className="ridge-stroke"/>

      {/* Checkpoint ticks + labels */}
      {cpGeom.map((cp, i) => {
        const labelAbove = i % 2 === 0;
        const tickY1 = cp.y;
        const tickY2 = PAD.t + INNER_H + 14;
        return (
          <g key={cp.id}>
            <line x1={cp.x} x2={cp.x} y1={tickY1} y2={tickY2} className="cp-tick"/>
            <circle cx={cp.x} cy={cp.y} r={4.5} className="cp-dot" />
            <g transform={`translate(${cp.x}, ${labelAbove ? cp.y - 18 : tickY2 + 14})`}>
              <text textAnchor="middle" className="cp-label">{cp.name.toUpperCase()}</text>
              <text textAnchor="middle" className="cp-alt" dy={14}>{cp.alt.toLocaleString()}m</text>
            </g>
          </g>
        );
      })}

      {/* Climbers — for the hiker style we stagger bubble heights so labels
          on tightly-clustered climbers don't collide. */}
      {(() => {
        const placed = climbers.map((c, i) => {
          const frac = altToPathFrac(c.alt, cpGeom, sampled);
          const p = pointOnPath(sampled, frac);
          return { c, i, x: p.x, y: p.y };
        });
        // Sort by x for collision-aware stacking of bubbles
        const order = [...placed].sort((a,b)=>a.x-b.x);
        const bubbleLevel = {};
        const minDx = 70;
        const recent = []; // {x, level}
        for (const item of order){
          // find lowest level with no neighbour within minDx
          const used = new Set(recent.filter(r => Math.abs(r.x - item.x) < minDx).map(r=>r.level));
          let lvl = 0; while (used.has(lvl)) lvl++;
          bubbleLevel[item.c.id] = lvl;
          recent.push({ x: item.x, level: lvl });
        }
        return placed.map(({c,x,y}) => (
          <ClimberMark
            key={c.id}
            style={avatarStyle}
            climber={c}
            x={x}
            y={y - 14}
            bubbleLevel={bubbleLevel[c.id] || 0}
          />
        ));
      })()}
    </svg>
  );
}

function ClimberMark({ climber, x, y, style, bubbleLevel = 0 }) {
  const { color, name } = climber;
  const initials = name.slice(0,1).toUpperCase();

  if (style === "hiker"){
    // approximate text width for the bubble
    const padX = 8;
    const charW = 6.4;
    const textW = Math.max(name.length * charW, 28);
    const bubbleW = textW + padX*2;
    const bubbleH = 18;
    const stackOffset = bubbleLevel * (bubbleH + 6);
    const bubbleY = -34 - stackOffset;     // top of bubble
    const tailTopY = bubbleY + bubbleH;
    const hikerTopY = -8;                   // top of hiker glyph
    return (
      <g className="climber-dot" transform={`translate(${x},${y})`}>
        {/* connector line from bubble to hiker */}
        <line x1="0" y1={tailTopY} x2="0" y2={hikerTopY - 2}
          stroke={color} strokeWidth="1" strokeDasharray="2 2" opacity="0.55"/>
        {/* name bubble */}
        <g>
          <rect x={-bubbleW/2} y={bubbleY} width={bubbleW} height={bubbleH} rx={bubbleH/2}
            fill={color} stroke="var(--paper)" strokeWidth="1.5"/>
          <polygon
            points={`${-4},${bubbleY+bubbleH-0.5} ${4},${bubbleY+bubbleH-0.5} ${0},${bubbleY+bubbleH+5}`}
            fill={color}/>
          <text textAnchor="middle" y={bubbleY + bubbleH/2 + 3.5}
            fontSize="11" fontWeight="600" fill="#fff" fontFamily="Inter"
            letterSpacing="0.02em">{name}</text>
        </g>
        {/* Hiker silhouette with backpack & trekking pole */}
        <g stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
          {/* head */}
          <circle cx="-1" cy="-6" r="2.6" fill={color} stroke="none"/>
          {/* body / backpack */}
          <path d="M -1 -3 L -1 5" />
          <path d="M -4 -1 Q -5 2 -3.5 5" stroke={color} strokeWidth="3" opacity="0.95"/>
          {/* arm forward, trekking pole */}
          <path d="M -1 0 L 4 2" />
          <path d="M 4 2 L 6 9" stroke={color} strokeWidth="1" opacity="0.9"/>
          {/* legs mid-stride */}
          <path d="M -1 5 L -3.5 11" />
          <path d="M -1 5 L 2 11" />
        </g>
        {/* small ground shadow */}
        <ellipse cx="0" cy="12" rx="5" ry="1.2" fill={color} opacity="0.18"/>
      </g>
    );
  }

  if (style === "initials"){
    return (
      <g className="climber-dot" transform={`translate(${x},${y})`}>
        <line x1="0" y1="6" x2="0" y2="14" stroke={color} strokeWidth="1.5" opacity="0.5"/>
        <circle r="13" fill={color} stroke="var(--paper)" strokeWidth="2.5"/>
        <text textAnchor="middle" y="4.5" fontSize="13" fontWeight="600" fill="#fff" fontFamily="Inter">{initials}</text>
      </g>
    );
  }
  if (style === "silhouette"){
    return (
      <g className="climber-dot" transform={`translate(${x},${y})`}>
        <circle r="14" fill={color} opacity="0.15"/>
        <circle r="11" fill={color}/>
        {/* Tiny climber glyph with ice axe */}
        <g transform="translate(-5,-6)" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" fill="none">
          <circle cx="5" cy="2" r="2" fill="#fff" stroke="none"/>
          <path d="M 5 4 L 5 9"/>
          <path d="M 5 6 L 9 5"/>
          <path d="M 5 6 L 2 7"/>
          <path d="M 5 9 L 3 13"/>
          <path d="M 5 9 L 8 12"/>
        </g>
      </g>
    );
  }
  // "shape" — geometric crest per person (square, triangle, diamond, hex)
  const shape = climber.shape || "circle";
  return (
    <g className="climber-dot" transform={`translate(${x},${y})`}>
      <line x1="0" y1="6" x2="0" y2="14" stroke={color} strokeWidth="1.5" opacity="0.55"/>
      {shape === "circle" && <circle r="11" fill={color} stroke="var(--paper)" strokeWidth="2"/>}
      {shape === "square" && <rect x="-10" y="-10" width="20" height="20" rx="3" fill={color} stroke="var(--paper)" strokeWidth="2"/>}
      {shape === "triangle" && <polygon points="0,-12 11,9 -11,9" fill={color} stroke="var(--paper)" strokeWidth="2" strokeLinejoin="round"/>}
      {shape === "diamond" && <polygon points="0,-12 12,0 0,12 -12,0" fill={color} stroke="var(--paper)" strokeWidth="2" strokeLinejoin="round"/>}
      <text textAnchor="middle" y="4" fontSize="10" fontWeight="700" fill="#fff" fontFamily="Inter">{initials}</text>
    </g>
  );
}

Object.assign(window, { Mountain, CHECKPOINTS, altToPathFrac });
