// When Will Your Part of the World Cross 2°C? D3 prototype.
// Data comes from data/warming.json, produced by the team's Colab notebook.
const LOCAL = "#c8372d", GLOBAL = "#1c1c1a", NEVER = "#c9c7c1";
const FIRST_YEAR = 2000, LAST_YEAR = 2090;

// Sequential scale: darker means earlier. It stays fixed so maps can be compared.
const yearColor = d3.scaleLinear()
  .domain([2000, 2022.5, 2045, 2067.5, 2090])
  .range(["#4f0d16", "#a3201f", "#d9592f", "#f2a65a", "#fbe3b5"])
  .interpolate(d3.interpolateLab).clamp(true);
const fmt = v => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)} °C`;
const latName = v => `${Math.abs(v).toFixed(1)}°${v >= 0 ? "N" : "S"}`;
const lonName = v => `${Math.abs(v).toFixed(1)}°${v >= 0 ? "E" : "W"}`;
const yearText = y => (y ? `around ${y}` : "not by about 2090");

const state = { scenario: "ssp245", threshold: "2", cell: null, name: "" };
let D, nLat, nLon, projection, cells, land, mapW, mapH;

const canvas = document.getElementById("map");
const ctx = canvas.getContext("2d");
const tooltip = document.getElementById("tooltip");

Promise.all([
  d3.json("data/warming.json"),
  d3.json("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json"),
]).then(([data, world]) => {
  D = data;
  nLat = D.lat.length; nLon = D.lon.length;
  D.thresholdKeys = D.thresholds.map(t => String(t));
  state.threshold = D.thresholdKeys.find(t => +t === 2);
  land = topojson.feature(world, world.objects.land);
  init();
}).catch(err => {
  console.error(err);
  document.getElementById("headline").textContent =
    "Could not load data/warming.json. Run the Colab notebook, put its data folder here, and serve this folder over http.";
});

const idx = (i, j) => i * nLon + j;
const crossing = (s, t, field, i, j) => D.crossing[s][t][field][idx(i, j)];
const warming = (s, d, i, j) => D.grid[s][(d * nLat + i) * nLon + j] * D.scale;
const nearest = (arr, v) => d3.leastIndex(arr, (a, b) => Math.abs(a - v) - Math.abs(b - v));
const scenarioInfo = id => D.scenarios.find(s => s.id === id);

function selectPlace(p) {
  state.cell = { i: nearest(D.lat, p.lat), j: nearest(D.lon, p.lon) };
  state.name = p.name;
}

function init() {
  d3.select("#thresholds").selectAll("button").data(D.thresholdKeys).join("button")
    .attr("type", "button").html(d => `<b>${+d}°C</b>`)
    .on("click", (_, d) => { state.threshold = d; render(); });
  d3.select("#scenarios").selectAll("button").data(D.scenarios).join("button")
    .attr("type", "button").style("--c", d => d.color)
    .html(d => `<b>${d.label}</b><span>${d.desc}</span>`)
    .on("click", (_, d) => { state.scenario = d.id; render(); });

  const select = d3.select("#place");
  select.selectAll("option").data(D.places).join("option").attr("value", d => d.name).text(d => d.name);
  select.append("option").attr("value", "").attr("id", "customPlace").attr("hidden", true).text("Selected on map");
  select.on("change", function () {
    const p = D.places.find(d => d.name === this.value);
    if (p) { selectPlace(p); render(); }
  });
  selectPlace(D.places[0]);

  document.getElementById("subtitle").textContent =
    `Year each place first reaches the selected warming level: 20-year averages, change from ${D.baseline.join("–")}, median of ${D.n_models} CMIP6 models.`;
  document.getElementById("method").textContent =
    `Data: CMIP6 monthly near-surface air temperature (tas), historical plus future scenario runs. ` +
    `Annual means regridded to ${D.cell}°, with each model compared to its own ${D.baseline.join("–")} mean. ` +
    `A place crosses a level in the middle year of the first 20-year average at that level from 1970 on, so about 2090 is the latest year shown. ` +
    `Grid cells are ${D.cell}° wide, so a named place is an approximate location. Models: ${D.models.join(", ")}.`;

  canvas.addEventListener("mousemove", onHover);
  canvas.addEventListener("mouseleave", () => { tooltip.hidden = true; });
  canvas.addEventListener("click", onClick);
  drawLegend();
  layoutMap();
  new ResizeObserver(() => { layoutMap(); render(); }).observe(canvas.parentElement);
  render();
}

function layoutMap() {
  const width = canvas.parentElement.clientWidth;
  if (!width || width === mapW) return;
  mapW = width; mapH = Math.round(width * 0.487);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = mapW * dpr; canvas.height = mapH * dpr;
  canvas.style.height = `${mapH}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  projection = d3.geoEqualEarth().fitExtent([[2, 2], [mapW - 2, mapH - 2]], { type: "Sphere" });
  // Project each cell once so that changing a control only changes fill colors.
  const half = D.cell / 2;
  cells = [];
  D.lat.forEach((la, i) => D.lon.forEach((lo, j) => {
    const ring = [[lo - half, la - half], [lo - half, la + half], [lo + half, la + half], [lo + half, la - half]]
      .map(p => projection(p));
    const path = new Path2D();
    ring.forEach((p, k) => k ? path.lineTo(p[0], p[1]) : path.moveTo(p[0], p[1]));
    path.closePath();
    cells.push({ i, j, path });
  }));
}

function drawMap() {
  ctx.clearRect(0, 0, mapW, mapH);
  ctx.lineWidth = 0.6;
  for (const c of cells) {
    const y = crossing(state.scenario, state.threshold, "median", c.i, c.j);
    const fill = y ? yearColor(y) : NEVER;
    ctx.fillStyle = fill; ctx.strokeStyle = fill;   // the stroke hides hairline seams between cells
    ctx.fill(c.path); ctx.stroke(c.path);
  }
  const path = d3.geoPath(projection, ctx);
  ctx.beginPath(); path(land); ctx.strokeStyle = "rgba(20,20,20,.7)"; ctx.lineWidth = 0.7; ctx.stroke();
  ctx.beginPath(); path({ type: "Sphere" }); ctx.strokeStyle = "#bdbbb4"; ctx.lineWidth = 1; ctx.stroke();
  if (state.cell) {
    const [x, y] = projection([D.lon[state.cell.j], D.lat[state.cell.i]]);
    ctx.beginPath(); ctx.arc(x, y, 6, 0, 2 * Math.PI);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3.5; ctx.stroke();
    ctx.strokeStyle = "#111"; ctx.lineWidth = 1.6; ctx.stroke();
  }
}

function cellAt(evt) {
  const box = canvas.getBoundingClientRect();
  const lonlat = projection.invert([evt.clientX - box.left, evt.clientY - box.top]);
  if (!lonlat || Math.abs(lonlat[0]) > 180 || Math.abs(lonlat[1]) > 90) return null;
  return { i: nearest(D.lat, lonlat[1]), j: nearest(D.lon, lonlat[0]) };
}

function onHover(evt) {
  const c = cellAt(evt);
  if (!c) { tooltip.hidden = true; return; }
  const y = crossing(state.scenario, state.threshold, "median", c.i, c.j);
  const n = crossing(state.scenario, state.threshold, "count", c.i, c.j);
  tooltip.innerHTML = `<b>${+state.threshold}°C ${yearText(y)}</b><br>${latName(D.lat[c.i])}, ${lonName(D.lon[c.j])}<br>${n} of ${D.n_models} models reach it`;
  tooltip.hidden = false;
  const flip = evt.clientX > window.innerWidth - 250;
  tooltip.style.left = `${evt.clientX + (flip ? -220 : 14)}px`;
  tooltip.style.top = `${evt.clientY + 14}px`;
}

function onClick(evt) {
  const c = cellAt(evt);
  if (!c) return;
  state.cell = c;
  state.name = `${latName(D.lat[c.i])}, ${lonName(D.lon[c.j])}`;
  render();
}

function drawLegend() {
  const w = 500, h = 44, x = d3.scaleLinear().domain([FIRST_YEAR, LAST_YEAR]).range([10, 330]);
  const svg = d3.select("#legend").html("").append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("width", w).attr("height", h);
  const grad = svg.append("defs").append("linearGradient").attr("id", "yearGrad");
  d3.range(0, 1.001, 0.05).forEach(t => grad.append("stop").attr("offset", t).attr("stop-color", yearColor(FIRST_YEAR + t * 90)));
  svg.append("rect").attr("x", 10).attr("y", 4).attr("width", 320).attr("height", 11).attr("rx", 2).attr("fill", "url(#yearGrad)");
  svg.append("g").attr("class", "axis").attr("transform", "translate(0,15)")
    .call(d3.axisBottom(x).tickValues([2000, 2030, 2060, 2090]).tickFormat(d => d === 2000 ? "≤2000" : d).tickSize(4))
    .call(g => g.select(".domain").remove());
  svg.append("rect").attr("x", 346).attr("y", 4).attr("width", 18).attr("height", 11).attr("rx", 2).attr("fill", NEVER);
  svg.append("text").attr("class", "lab").attr("x", 370).attr("y", 14).text("After about 2090");
}

function drawRange() {
  const { i, j } = state.cell;
  document.getElementById("rangeTitle").textContent = `When ${state.name} crosses ${+state.threshold}°C`;
  const w = Math.max(250, document.getElementById("range").parentElement.clientWidth - 28);
  const h = 380, m = { t: 8, r: 16, b: 28, l: 74 };
  const svg = d3.select("#range").attr("viewBox", `0 0 ${w} ${h}`).attr("height", h);
  svg.selectAll("*").remove();
  const x = d3.scaleLinear().domain([1980, 2095]).range([m.l, w - m.r]);
  const y = d3.scaleBand().domain(D.scenarios.map(s => s.id)).range([m.t, h - m.b]).padding(0.35);
  svg.append("g").attr("class", "grid").selectAll("line").data(x.ticks(4)).join("line")
    .attr("x1", d => x(d)).attr("x2", d => x(d)).attr("y1", m.t).attr("y2", h - m.b);
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(4).tickFormat(d3.format("d")));
  D.scenarios.forEach(s => {
    const med = crossing(s.id, state.threshold, "median", i, j);
    const lo = crossing(s.id, state.threshold, "earliest", i, j);
    const hi = crossing(s.id, state.threshold, "latest", i, j);
    const n = crossing(s.id, state.threshold, "count", i, j);
    const cy = y(s.id) + y.bandwidth() / 2;
    const active = s.id === state.scenario;
    svg.append("text").attr("class", "lab").attr("x", m.l - 8).attr("y", cy + 4).attr("text-anchor", "end")
      .style("font-weight", active ? 700 : 400).text(s.label);
    if (lo) {
      svg.append("line").attr("x1", x(Math.max(1980, lo))).attr("x2", x(hi || 2095)).attr("y1", cy).attr("y2", cy)
        .attr("stroke", s.color).attr("stroke-width", 4).attr("stroke-linecap", "round").attr("opacity", 0.45);
    }
    if (med) {
      svg.append("circle").attr("cx", x(Math.max(1980, med))).attr("cy", cy).attr("r", active ? 7 : 6)
        .attr("fill", s.color).attr("stroke", "#fff").attr("stroke-width", 2);
    }
    const note = med ? `${med}` : lo ? `${n} of ${D.n_models} models` : "Not reached";
    svg.append("text").attr("class", "lab").attr("x", med ? x(Math.max(1980, med)) : lo ? x(2095) : m.l + 4)
      .attr("y", cy - 11).attr("text-anchor", med || !lo ? (med ? "middle" : "start") : "end").text(note);
  });
}

function drawLine() {
  const { i, j } = state.cell;
  document.getElementById("lineTitle").textContent =
    `${state.name} vs. global mean under ${scenarioInfo(state.scenario).label}, decade averages`;
  const w = Math.max(280, document.getElementById("line").parentElement.clientWidth - 28);
  const h = 240, m = { t: 12, r: 92, b: 26, l: 44 };
  const svg = d3.select("#line").attr("viewBox", `0 0 ${w} ${h}`).attr("height", h);
  svg.selectAll("*").remove();
  const years = D.decades.map(d => d + 5);
  const global = D.global[state.scenario];
  const local = D.decades.map((_, d) => warming(state.scenario, d, i, j));
  const t = +state.threshold;
  const x = d3.scaleLinear().domain(d3.extent(years)).range([m.l, w - m.r]);
  const y = d3.scaleLinear().domain(d3.extent([...global, ...local, 0, t])).nice().range([h - m.b, m.t]);
  svg.append("g").attr("class", "grid").selectAll("line").data(y.ticks(5)).join("line")
    .attr("x1", m.l).attr("x2", w - m.r).attr("y1", d => y(d)).attr("y2", d => y(d));
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`).call(d3.axisBottom(x).ticks(w < 520 ? 4 : 8).tickFormat(d3.format("d")));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d => d > 0 ? `+${d}` : d));
  svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(t)).attr("y2", y(t)).attr("stroke", "#5e5d59").attr("stroke-dasharray", "5 4");
  svg.append("text").attr("class", "lab").attr("x", m.l + 6).attr("y", y(t) < m.t + 16 ? y(t) + 15 : y(t) - 5).text(`${t}°C level`);
  const crossed = crossing(state.scenario, state.threshold, "median", i, j);
  if (crossed && crossed >= years[0]) {
    svg.append("line").attr("x1", x(crossed)).attr("x2", x(crossed)).attr("y1", m.t).attr("y2", h - m.b)
      .attr("stroke", LOCAL).attr("stroke-dasharray", "2 3");
    svg.append("text").attr("class", "lab").attr("x", x(crossed) + 5).attr("y", h - m.b - 7).text(`Crosses ${crossed}`);
  }
  const lineGen = d3.line().x((_, k) => x(years[k])).y(d => y(d));
  [[global, GLOBAL], [local, LOCAL]].forEach(([vals, stroke]) => {
    svg.append("path").datum(vals).attr("fill", "none").attr("stroke", stroke).attr("stroke-width", 2).attr("d", lineGen);
  });
  const ends = [[global, "Global mean"], [local, "Selected"]]
    .map(([v, label]) => ({ y: y(v[v.length - 1]), label })).sort((a, b) => a.y - b.y);
  if (ends[1].y - ends[0].y < 14) ends[1].y = ends[0].y + 14;
  svg.selectAll(".end").data(ends).join("text").attr("class", "lab end").attr("x", w - m.r + 6).attr("y", d => d.y + 4).text(d => d.label);
}

function drawHeadline() {
  const { i, j } = state.cell;
  const s = scenarioInfo(state.scenario);
  const local = crossing(state.scenario, state.threshold, "median", i, j);
  const world = D.global_crossing[state.scenario][state.threshold][0];
  const gap = local && world ? world - local : null;
  const years = n => `${n} year${n === 1 ? "" : "s"}`;
  const compare = gap === null
    ? (world ? `The world as a whole gets there around ${world}.` : "Neither does the world as a whole.")
    : gap === 0 ? "That matches the world as a whole."
    : `That's ${years(Math.abs(gap))} ${gap > 0 ? "before" : "after"} the world as a whole (${world}).`;
  const lead = local ? `${state.name} reaches ${+state.threshold}°C around ${local}`
    : `${state.name} doesn't reach ${+state.threshold}°C by about 2090`;
  document.getElementById("headline").innerHTML = `<b>${lead}</b> under ${s.label}. ${compare}`;
}

function render() {
  tooltip.hidden = true;
  d3.selectAll("#scenarios button").attr("aria-pressed", d => d.id === state.scenario);
  d3.selectAll("#thresholds button").attr("aria-pressed", d => d === state.threshold);
  const named = D.places.some(p => p.name === state.name);
  document.getElementById("place").value = named ? state.name : "";
  drawMap(); drawRange(); drawLine(); drawHeadline();
}
