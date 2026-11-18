import { currentSchoolYear, transitions } from './portal-api.js';

const key = 'cesc-portal-demo-v1';
const user = { id: 'familia-demonstracao', email: 'familia@example.test' };
const now = () => new Date().toISOString();
const result = data => ({ data, error: null });
const failure = code => ({ data: null, error: { code } });

function seed() {
  const child = { id: 'demo-crianca', guardian_id: user.id, full_name: 'Criança de exemplo', birth_date: `${currentSchoolYear() - 4}-01-15` };
  const application = {
    id: 'demo-solicitacao', child_id: child.id, guardian_id: user.id, protocol: 'TESTE-001',
    child_name: child.full_name, birth_date: child.birth_date, guardian_name: 'Responsável de exemplo',
    guardian_relationship: 'Mãe', guardian_phone: '98000000000', guardian_email: user.email,
    school_year: currentSchoolYear(), schedule: 'Tempo Integral', status: 'received', created_at: now(),
  };
  return {
    enrollment_children: [child],
    enrollment_applications: [application],
    enrollment_history: [{ id: 1, application_id: application.id, status: 'received', family_message: '', changed_at: now() }],
  };
}

function read() {
  const stored = sessionStorage.getItem(key);
  return stored ? JSON.parse(stored) : seed();
}

function save(db) {
  sessionStorage.setItem(key, JSON.stringify(db));
}

function history(db, application_id, status, family_message = '') {
  const entries = db.enrollment_history;
  entries.push({ id: (entries.at(-1)?.id ?? 0) + 1, application_id, status, family_message, changed_at: now() });
}

function query(table) {
  const filters = [];
  const order = [];
  let change;
  const matches = row => filters.every(([column, value]) => row[column] === value);
  function rows(db) {
    if (!db[table]) throw new Error('Área de teste desconhecida.');
    return db[table].filter(matches).sort((a, b) => {
      for (const [column, direction] of order) {
        if (a[column] < b[column]) return -direction;
        if (a[column] > b[column]) return direction;
      }
      return 0;
    });
  }
  return {
    select() { return this; },
    eq(column, value) { filters.push([column, value]); return this; },
    order(column, { ascending = true } = {}) { order.push([column, ascending ? 1 : -1]); return this; },
    insert(fields) { change = { fields, insert: true }; return this; },
    update(fields) { change = { fields, insert: false }; return this; },
    async range(first, last) { return result(rows(read()).slice(first, last + 1)); },
    async maybeSingle() { return result(rows(read())[0] ?? null); },
    async single() {
      const db = read();
      const original = change?.insert ? null : rows(db)[0];
      if (!change || table !== 'enrollment_children' || (!change.insert && !original)) return failure('P0002');
      const { full_name, birth_date } = change.fields;
      const normalize = name => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
      if (db.enrollment_children.some(child => child.id !== original?.id && child.birth_date === birth_date
        && normalize(child.full_name) === normalize(full_name))) return failure('23505');
      const record = { id: original?.id ?? crypto.randomUUID(), guardian_id: user.id, full_name, birth_date };
      if (original) Object.assign(original, record);
      else db.enrollment_children.push(record);
      save(db);
      return result(record);
    },
  };
}

function submit(db, params) {
  const child = db.enrollment_children.find(row => row.id === params.p_child);
  if (!child) return failure('P0002');
  const previous = db.enrollment_applications.find(row => row.child_id === child.id && row.school_year === params.p_year);
  if (previous) return result({ id: previous.id, protocol: previous.protocol, created: false });
  const id = crypto.randomUUID();
  const protocol = `TESTE-${id.slice(0, 8).toUpperCase()}`;
  db.enrollment_applications.push({
    id, protocol, child_id: child.id, guardian_id: user.id, child_name: child.full_name, birth_date: child.birth_date,
    guardian_name: params.p_guardian_name, guardian_relationship: params.p_relationship,
    guardian_phone: params.p_phone, guardian_email: user.email, school_year: params.p_year,
    schedule: params.p_schedule, status: 'received', created_at: now(),
  });
  history(db, id, 'received');
  save(db);
  return result({ id, protocol, created: true });
}

function decide(db, params) {
  const application = db.enrollment_applications.find(row => row.id === params.p_application);
  if (!application) return failure('P0002');
  if (application.status !== params.p_expected) return failure('40001');
  if (!transitions[application.status]?.includes(params.p_next)
    || (params.p_next === 'documents' && !params.p_message?.trim())) return failure('22023');
  application.status = params.p_next;
  history(db, application.id, params.p_next, params.p_message);
  save(db);
  return result(null);
}

export function createDemoClient() {
  return {
    demo: true,
    demoSession: { user },
    from: query,
    rpc(name, params) {
      if (name === 'submit_enrollment') return { async single() { return submit(read(), params); } };
      if (name === 'decide_enrollment') return Promise.resolve().then(() => decide(read(), params));
      return Promise.resolve(failure('42883'));
    },
  };
}
