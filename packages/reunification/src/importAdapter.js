export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"' && quoted && next === '"') { cell += '"'; i += 1; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === ',' && !quoted) { row.push(cell.trim()); cell = ''; continue; }
    if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell.trim()); cell = '';
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  row.push(cell.trim());
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
}

function get(row, headers, names) {
  for (const name of names) {
    const idx = headers.indexOf(name);
    if (idx >= 0) return row[idx] || '';
  }
  return '';
}

function releaseFlag(value) {
  return ['Y', 'YES', 'TRUE', '1'].includes(String(value || '').trim().toUpperCase());
}

function displayName(name) {
  const raw = String(name || '').trim();
  if (!raw.includes(',')) return raw;
  const [last, ...rest] = raw.split(',');
  return `${rest.join(',').trim()} ${last.trim()}`.replace(/\s+/g, ' ').trim();
}

export function importCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { students: [], issues: ['No data rows found.'] };
  const headers = rows[0];
  const map = new Map();
  const issues = [];

  rows.slice(1).forEach(row => {
    const id = get(row, headers, ['Student > ID', 'student_number', 'Student ID', 'ID']);
    if (!id) { issues.push('Skipped row with no student id.'); return; }
    if (!map.has(id)) {
      map.set(id, {
        id,
        name: displayName(get(row, headers, ['Student > Name', 'full_name', 'Student Name', 'Name'])),
        school: get(row, headers, ['Student > School', 'building', 'School']),
        grade: get(row, headers, ['Student > Grade', 'grade', 'Grade']),
        teacher: get(row, headers, ['Student > Home Room', 'teacher_of_record', 'Teacher', 'Home Room']),
        contacts: []
      });
    }
    const student = map.get(id);
    const contactName = displayName(get(row, headers, ['Parent/Guardian Contact Info > Name', 'contact_name', 'Contact Name']));
    if (contactName) {
      student.contacts.push({
        id: `${id}-C${student.contacts.length + 1}`,
        name: contactName,
        relation: get(row, headers, ['Parent/Guardian Contact Info > Relationship', 'relation', 'Relationship']),
        release: releaseFlag(get(row, headers, ['Parent/Guardian Contact Info > Release To', 'release_ok', 'Release To']))
      });
    }
    const emergencyName = displayName(get(row, headers, ['Emergency Contact Info > Name', 'Emergency Name']));
    if (emergencyName) {
      student.contacts.push({
        id: `${id}-C${student.contacts.length + 1}`,
        name: emergencyName,
        relation: get(row, headers, ['Emergency Contact Info > Relationship', 'Emergency Relationship']),
        release: releaseFlag(get(row, headers, ['Emergency Contact Info > Release To', 'Emergency Release To']))
      });
    }
  });

  const students = Array.from(map.values());
  students.forEach(student => {
    if (!student.contacts.some(contact => contact.release)) issues.push(`${student.name || student.id} has no authorized release contact.`);
  });
  return { students, issues };
}
