export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
export const inRange = (date, from, to) => Boolean(date && date >= from && date <= to);
export const highRisk = level => level === 'Alto' || level === 'Muy alto';
export const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
export function limaDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date(value));
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function selectNoaa(rows, {from, to}, monthly = false) {
  // Un valor mensual representa un periodo, no una observación diaria.
  return rows.filter(r => monthly ? r.date <= to && r.period_end >= from : inRange(r.date, from, to));
}
export function selectForecasts(versions, {from, to, department = 'all'}) {
  const chosen = new Map();
  for (const version of [...versions].sort((a, b) => a.meta.fetched_at.localeCompare(b.meta.fetched_at))) {
    const collectedDate = limaDate(version.meta.fetched_at);
    for (const row of version.data) {
      if (!inRange(row.valid_date, from, to) || (department !== 'all' && row.department_code !== department)) continue;
      // Nunca reconstruir un pronóstico histórico con una consulta posterior a su validez.
      if (collectedDate > row.valid_date) continue;
      chosen.set(`${row.locality_id}|${row.valid_date}`, {...row, collected_at: version.meta.fetched_at});
    }
  }
  return [...chosen.values()].sort((a, b) => a.valid_date.localeCompare(b.valid_date) || a.locality.localeCompare(b.locality, 'es'));
}
export function riskByDepartment(rows, hazard, department = 'all') {
  const groups = new Map();
  for (const row of rows) {
    if (row.hazard !== hazard || (department !== 'all' && row.department_code !== department)) continue;
    if (!groups.has(row.department_code)) groups.set(row.department_code, {code: row.department_code, name: row.department, total: 0, high: 0, unknown: 0});
    const group = groups.get(row.department_code);
    if (row.risk_level == null) { group.unknown++; continue; }
    group.total++;
    if (highRisk(row.risk_level)) group.high++;
  }
  return [...groups.values()].map(g => ({...g, value: g.total ? 100 * g.high / g.total : null})).sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || b.high - a.high);
}
export function forecastByDepartment(rows, metric = 'tmax') {
  const groups = new Map();
  for (const r of rows) {
    if (!groups.has(r.department_code)) groups.set(r.department_code, {code: r.department_code, name: r.department, rows: []});
    groups.get(r.department_code).rows.push(r);
  }
  return [...groups.values()].map(g => ({...g, count: new Set(g.rows.map(r => r.locality_id)).size, value: metric === 'rain' ? 100 * g.rows.filter(r => r.rain_mentioned).length / g.rows.length : mean(g.rows.map(r => metric === 'tmin' ? r.tmin_c : r.tmax_c))})).sort((a, b) => b.value - a.value);
}
export function forecastByDate(rows) {
  const dates = [...new Set(rows.map(r => r.valid_date))].sort();
  return dates.map(date => { const data = rows.filter(r => r.valid_date === date); return {date, tmax: mean(data.map(r => r.tmax_c)), tmin: mean(data.map(r => r.tmin_c)), count: data.length}; });
}
export function csv(rows, fields) {
  const escape = value => {
    let s = value == null ? '' : String(value);
    if (typeof value !== 'number' && /^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return '\ufeff' + [fields.map(escape).join(','), ...rows.map(r => fields.map(f => escape(r[f])).join(','))].join('\r\n');
}

// Malla geográfica fija: 30 km entre centros vecinos en EPSG:3857.
// Cada punto pertenece exactamente a una celda; el zoom no modifica el conteo.
export function hexbinPoints(points, spacingKm = 30) {
  if (!(spacingKm > 0) || !Number.isFinite(spacingKm)) throw new RangeError('El tamaño de celda debe ser positivo.');
  const earth = 6378137, radius = spacingKm * 1000 / Math.sqrt(3), cells = new Map();
  const inverse = (x,y) => [180 / Math.PI * (2 * Math.atan(Math.exp(y / earth)) - Math.PI / 2), x / earth * 180 / Math.PI];
  for (const point of points) {
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon) || Math.abs(point.lat) > 85 || Math.abs(point.lon) > 180) continue;
    const x = earth * point.lon * Math.PI / 180;
    const y = earth * Math.log(Math.tan(Math.PI / 4 + point.lat * Math.PI / 360));
    const q = (Math.sqrt(3) / 3 * x - y / 3) / radius, r = 2 * y / 3 / radius;
    let rq = Math.round(q), rr = Math.round(r), rs = Math.round(-q-r);
    const dq = Math.abs(rq-q), dr = Math.abs(rr-r), ds = Math.abs(rs+q+r);
    if (dq > dr && dq > ds) rq = -rr-rs;
    else if (dr > ds) rr = -rq-rs;
    const id = `${rq}:${rr}`;
    if (!cells.has(id)) {
      const cx = radius * Math.sqrt(3) * (rq + rr / 2), cy = radius * 1.5 * rr;
      const polygon = Array.from({length:6}, (_,i) => {
        const angle = (60*i+30)*Math.PI/180;
        return inverse(cx+radius*Math.cos(angle), cy+radius*Math.sin(angle));
      });
      cells.set(id, {id, center:inverse(cx,cy), polygon, count:0, departments:new Set(), points:[]});
    }
    const cell = cells.get(id);
    cell.count++;cell.points.push(point);
    if (point.department) cell.departments.add(point.department);
  }
  return [...cells.values()].map(c => ({...c, departments:[...c.departments].sort()})).sort((a,b) => b.count-a.count || a.id.localeCompare(b.id));
}
