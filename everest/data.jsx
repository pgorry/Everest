// Everest checkpoints (from the selected list)
// Altitudes in meters. `m` is climb-progress (meters from sea level start).
const CHECKPOINTS = [
  { id:"start", name:"Trailhead",        alt:0,    note:"Every journey begins." },
  { id:"ktm",   name:"Kathmandu",        alt:1400, note:"Where the journey begins." },
  { id:"phap",  name:"Phaplu Airport",   alt:2413, note:"The quieter gateway." },
  { id:"lukla", name:"Lukla Airport",    alt:2860, note:"Gateway to the Khumbu." },
  { id:"nb",    name:"Namche Bazaar",    alt:3440, note:"Sherpa capital." },
  { id:"bc",    name:"Base Camp",        alt:5364, note:"Tents on the glacier." },
  { id:"c1",    name:"Camp I",           alt:6065, note:"Above the Icefall." },
  { id:"c2",    name:"Camp II",          alt:6400, note:"Advanced Base Camp." },
  { id:"c3",    name:"Camp III",         alt:7200, note:"On the Lhotse Face." },
  { id:"c4",    name:"Camp IV",          alt:7920, note:"The South Col. Death zone." },
  { id:"bal",   name:"The Balcony",      alt:8400, note:"First light of the summit push." },
  { id:"hs",    name:"Hillary Step",     alt:8790, note:"The final obstacle." },
  { id:"sum",   name:"Summit",           alt:8849, note:"The top of the world." },
];

const SUMMIT = 8849;

// Family — 4 members. Colors are climber dot hues.
const FAMILY_SEED = [
  { id:"a", name:"Dad",   color:"#d85a1f", hue:"alpen" },
  { id:"b", name:"Mom",   color:"#3e6b3a", hue:"moss"  },
  { id:"c", name:"Faith", color:"#2f6aa8", hue:"sky"   },
  { id:"d", name:"Felix", color:"#8a4fa0", hue:"berry" },
];

// Seed hikes to show the thing alive. Dates are synthetic.
const SEED_HIKES = [
  { id:1, climberId:"a", name:"Mission Peak",         gain:670,  date:"2025-01-12" },
  { id:2, climberId:"b", name:"Mission Peak",         gain:670,  date:"2025-01-12" },
  { id:3, climberId:"c", name:"Mission Peak",         gain:540,  date:"2025-01-12" },
  { id:4, climberId:"d", name:"Mission Peak",         gain:540,  date:"2025-01-12" },
  { id:5, climberId:"a", name:"Mt. Tam — East Peak",  gain:780,  date:"2025-02-02" },
  { id:6, climberId:"b", name:"Mt. Tam — East Peak", gain:780, date:"2025-02-02" },
  { id:7, climberId:"c", name:"Muir Woods Loop",      gain:420,  date:"2025-02-09" },
  { id:8, climberId:"a", name:"Half Dome",            gain:1490, date:"2025-03-15" },
  { id:9, climberId:"b", name:"Half Dome",            gain:1490, date:"2025-03-15" },
  {id:10, climberId:"d", name:"Eagle Peak",           gain:610,  date:"2025-03-29" },
  {id:11, climberId:"a", name:"Whitney day-hike",     gain:1985, date:"2025-05-10" },
  {id:12, climberId:"c", name:"Black Mountain",       gain:950,  date:"2025-05-24" },
  {id:13, climberId:"b", name:"Whitney day-hike",     gain:1985, date:"2025-05-10" },
  {id:14, climberId:"d", name:"Dipsea Trail",         gain:680,  date:"2025-06-07" },
  {id:15, climberId:"a", name:"Mt. Shasta — Bunny Flat", gain:880, date:"2025-07-05" },
  {id:16, climberId:"c", name:"Mt. Diablo Summit",    gain:1000, date:"2025-07-19" },
  {id:17, climberId:"b", name:"Mt. Shasta — Bunny Flat", gain:880, date:"2025-07-05" },
  {id:18, climberId:"a", name:"Cathedral Peak",       gain:430,  date:"2025-08-15" },
  {id:19, climberId:"d", name:"Mt. Diablo Summit",    gain:1000, date:"2025-07-19" },
];

Object.assign(window, { CHECKPOINTS, SUMMIT, FAMILY_SEED, SEED_HIKES });
