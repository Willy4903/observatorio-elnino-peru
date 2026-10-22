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
