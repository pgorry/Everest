// Static reference data — checkpoints on the Khumbu route to Everest's summit.
// Altitudes in meters.
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

Object.assign(window, { CHECKPOINTS, SUMMIT });
