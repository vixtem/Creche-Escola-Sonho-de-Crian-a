import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, LogOut, Printer } from 'lucide-react';
import { ageOnDate, enrollmentYear, schoolUnits, studyModes } from './enrollment-fields';
import { allRows, dateInSchool, formatDate, getPortalClient, states, transitions } from './portal-api';
import { school } from './school';
import { PortalLogin } from './portal-login';
import './styles.css';
import './enrollment.css';
import './portal.css';

const staffMode = new URLSearchParams(window.location.search).get('area') === 'secretaria';
const demoAccessKey = `cesc-portal-demo-access-${staffMode ? 'staff' : 'family'}`;
const schedules = Object.keys(studyModes);
const reportUnits = { ...schoolUnits, unspecified: 'Não informada' };
const secretariatTabs = [
  { id: 'reports', label: 'Informações e relatórios' },
  { id: 'students', label: 'Alunos' },
];
const historyFields = 'id, status, family_message, changed_at';
const today = dateInSchool();
const sheetFields = [
  { name: 'child_name', label: 'Nome completo da criança', input: { maxLength: 120 } },
  { name: 'birth_date', label: 'Data de nascimento', input: { type: 'date', min: '1900-01-01', max: today } },
  { name: 'schedule', label: 'Turno', options: schedules },
  { name: 'guardian_name', label: 'Nome do responsável', input: { maxLength: 120 } },
  { name: 'guardian_relationship', label: 'Parentesco ou vínculo', input: { maxLength: 80 } },
  { name: 'guardian_phone', label: 'Telefone com DDD', input: { type: 'tel', maxLength: 24 } },
  { name: 'guardian_email', label: 'E-mail de contato', input: { type: 'email', maxLength: 254 } },
];

function History({ client, item }) {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  async function read(event) {
    if (!event.currentTarget.open || entries) return;
    setError('');
    try {
      setEntries(await allRows(() => client.from('enrollment_history').select(historyFields)
        .eq('application_id', item.id).order('id', { ascending: false })));
    } catch {
      setError('Não foi possível carregar o histórico. Feche e abra para tentar novamente.');
    }
  }
  return <details onToggle={read} className="portal-history">
    <summary>Acompanhar solicitação</summary>
    <p className="portal-protocol">Protocolo <code>{item.protocol}</code></p>
    <p role="status">{error || (!entries && 'Carregando histórico…')}</p>
    {entries && <ol>{entries.map(entry => <li key={entry.id}>
      <strong>{states[entry.status]}</strong> · {formatDate(entry.changed_at)}
      {entry.family_message && <p>{entry.family_message}</p>}
    </li>)}</ol>}
    {item.status === 'approved' && <p>A escola aprovou a solicitação. Consulte o histórico e siga as orientações da secretaria para concluir a matrícula.</p>}
  </details>;
}

function Family({ client, user }) {
  const [children, setChildren] = useState(null);
  const [applications, setApplications] = useState([]);
  const [error, setError] = useState('');

  async function load() {
    const [profiles, requests] = await Promise.all([
      allRows(() => client.from('enrollment_children').select('id, full_name, birth_date').order('id')),
      allRows(() => client.from('enrollment_applications')
        .select('id, child_id, protocol, child_name, schedule, unit, school_year, status').eq('guardian_id', user.id).order('id')),
    ]);
    setChildren(profiles.sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR')));
    setApplications(requests.sort((a, b) => b.school_year - a.school_year));
  }

  function refresh() {
    setError('');
    load().catch(() => setError('Não foi possível carregar as fichas. Tente atualizar.'));
  }
  useEffect(refresh, [client, user.id]);

  return <>
    <div className="portal-stack-head"><h2>Minhas crianças</h2>
      <div className="portal-family-toolbar">
        <button className="text-link" type="button" onClick={refresh}>Atualizar situação</button>
        <a className="button" href="./pre-matricula.html?nova=1">Cadastrar criança</a>
      </div>
    </div>
    <p role="status">{error || (!children ? 'Carregando fichas…' : '')}</p>
    {children?.length === 0 && <p>Cadastre uma criança para enviar e acompanhar a pré-matrícula.</p>}
    {children?.map(child => {
      const requests = applications.filter(item => item.child_id === child.id);
      const hasCurrentRequest = requests.some(item => item.school_year === enrollmentYear);
      return <article className="portal-card portal-family-card" key={child.id}>
        <div className="portal-family-card-head">
          <div>
            <h3>{child.full_name}</h3>
            <p>Nascimento em {formatDate(child.birth_date)}</p>
          </div>
          <a className="button" href={`./pre-matricula.html?crianca=${encodeURIComponent(child.id)}`}>
            {hasCurrentRequest ? 'Editar pré-matrícula' : 'Preencher pré-matrícula'}
          </a>
        </div>
        {requests.length === 0 && <p className="portal-family-request">Pré-matrícula ainda não enviada.</p>}
        {requests.map(item => <div className="portal-family-request" key={item.id}>
          {item.child_name !== child.full_name && <p>Nome na solicitação: {item.child_name}</p>}
          <dl className="portal-family-request-details">
            <div><dt>Ano letivo</dt><dd>{item.school_year}</dd></div>
            <div><dt>Modalidade</dt><dd>{studyModes[item.schedule]}</dd></div>
            <div><dt>Unidade</dt><dd>{schoolUnits[item.unit] || 'Não informada'}</dd></div>
            <div><dt>Situação</dt><dd><strong className="portal-status">{states[item.status]}</strong></dd></div>
          </dl>
          <History key={item.status} client={client} item={item} />
        </div>)}
      </article>;
    })}
  </>;
}

function Decision({ client, item, onSaved }) {
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const options = transitions[item.status];

  async function submit(event) {
    event.preventDefault();
    const message = new FormData(event.currentTarget).get('message').trim();
    if (next === 'documents' && !message) {
      setError('Escreva quais documentos estão pendentes.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { error } = await client.rpc('decide_enrollment', {
        p_application: item.id, p_expected: item.status, p_next: next, p_message: message,
      });
      if (error) throw error;
      onSaved();
    } catch (err) {
      setError(err.code === '40001' ? 'A situação mudou. Atualize a lista antes de decidir.' : 'Não foi possível registrar a decisão.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="portal-decision">
    <h3>{item.child_name}</h3>
    <p><strong>Nascimento:</strong> {formatDate(item.birth_date)} · <strong>Ano letivo:</strong> {item.school_year} · <strong>Turno:</strong> {studyModes[item.schedule]}</p>
    <p><strong>Unidade:</strong> {schoolUnits[item.unit] || 'Não informada'}</p>
    <p><strong>Responsável:</strong> {item.guardian_name} ({item.guardian_relationship}) · {item.guardian_phone} · {item.guardian_email}</p>
    <p><strong>Protocolo:</strong> <code>{item.protocol}</code></p>
    <History client={client} item={item} />
    {options.length > 0 && <form onSubmit={submit}>
      <div className="enrollment-grid portal-decision-fields">
        <div className="enrollment-field">
          <label htmlFor={`status-${item.id}`}>Nova situação</label>
          <select id={`status-${item.id}`} value={next} required onChange={e => setNext(e.target.value)}>
            <option value="">Selecione</option>
            {options.map(key => <option key={key} value={key}>{states[key]}</option>)}
          </select>
        </div>
        <div className="enrollment-field">
          <label htmlFor={`message-${item.id}`}>Mensagem visível à família {next !== 'documents' && <span>(opcional)</span>}</label>
          <textarea id={`message-${item.id}`} name="message" rows={2} maxLength={500} required={next === 'documents'} />
        </div>
      </div>
      <button className="button" disabled={busy}>Salvar situação</button>
      <p role="status">{error}</p>
    </form>}
  </div>;
}

function EditApplication({ client, item, onCancel, onSaved, onReload }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(sheetFields.map(({ name }) => [name, form.get(name).trim()]));
    if (Object.values(values).includes('')) {
      setError({ message: 'Preencha todos os campos da ficha.' });
      return;
    }
    if (!/^\+?[0-9 ()-]+$/.test(values.guardian_phone) || !/^\d{10,13}$/.test(values.guardian_phone.replace(/\D/g, ''))) {
      setError({ message: 'Informe um telefone válido com DDD.' });
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { error } = await client.rpc('edit_enrollment_application', {
        p_application: item.id,
        p_expected_updated_at: item.updated_at || item.created_at,
        p_school_year: item.school_year,
        ...Object.fromEntries(Object.entries(values).map(([key, value]) => [`p_${key}`, value])),
      });
      if (error) throw error;
      onSaved();
    } catch (err) {
      const messages = {
        '40001': 'A ficha mudou desde que foi aberta. Recarregue a ficha para conferir a versão atual.',
        '22023': 'Confira os dados informados na ficha.',
        '42501': 'A conta atual não tem permissão para editar esta ficha.',
        P0002: 'Esta ficha não está mais disponível.',
      };
      setError({ code: err.code, message: messages[err.code] || 'Não foi possível salvar a ficha. Tente novamente.' });
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={save}>
    <h3>Editar ficha de {item.child_name}</h3>
    <fieldset className="enrollment-grid portal-edit-fields" disabled={busy}>
      {sheetFields.map(({ name, label, input, options }) => <div className="enrollment-field" key={name}>
        <label htmlFor={`sheet-${name}`}>{label}</label>
        {options ? <select id={`sheet-${name}`} name={name} defaultValue={item[name]} required>
          {options.map(option => <option key={option} value={option}>{studyModes[option]}</option>)}
        </select> : <input id={`sheet-${name}`} name={name} defaultValue={item[name]} {...input} required />}
      </div>)}
    </fieldset>
    <div className="portal-actions">
      <button className="button" disabled={busy || error?.code === '40001'}>{busy ? 'Salvando…' : 'Salvar alterações'}</button>
      {error?.code === '40001' && <button type="button" className="text-link" onClick={onReload}>Recarregar ficha</button>}
      <button type="button" className="text-link" disabled={busy} onClick={onCancel}>Cancelar</button>
    </div>
    <p role="status">{error?.message}</p>
  </form>;
}

function Secretariat({ client }) {
  const [tab, setTab] = useState(0);
  const [records, setRecords] = useState([]);
  const [years, setYears] = useState([]);
  const [year, setYear] = useState(enrollmentYear);
  const [status, setStatus] = useState('');
  const [schedule, setSchedule] = useState('');
  const [unit, setUnit] = useState('');
  const [age, setAge] = useState('');
  const [sheet, setSheet] = useState(null);
  const [notice, setNotice] = useState('');
  const [report, setReport] = useState('summary');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const sheetRef = useRef(null);
  const referenceDate = dateInSchool();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setRecords([]);
    setError('');
    Promise.all([
      allRows(() => client.from('enrollment_applications')
        .select('id, protocol, child_name, birth_date, guardian_name, guardian_relationship, guardian_phone, guardian_email, school_year, schedule, unit, status, created_at, updated_at')
        .eq('school_year', year).order('created_at').order('id')),
      allRows(() => client.from('enrollment_applications').select('school_year').order('school_year').order('id')),
    ]).then(([items, historic]) => {
      if (!active) return;
      setRecords(items);
      setYears([...new Set([enrollmentYear, ...historic.map(item => item.school_year)])].sort((a,b) => b-a));
    }).catch(() => { if (active) setError('Não foi possível carregar as solicitações. Atualize para tentar novamente.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, year, refresh]);

  useEffect(() => {
    if (sheet && tab === 1 && !loading) sheetRef.current?.focus();
  }, [sheet, tab, loading]);

  const items = records.map(item => ({ ...item, age: ageOnDate(item.birth_date, referenceDate) }));
  const ages = [...new Set(items.map(item => item.age).filter(value => value !== null))].sort((a,b) => a-b);
  const filtered = items.filter(item => (!status || item.status === status)
    && (!schedule || item.schedule === schedule)
    && (!unit || (item.unit ?? 'unspecified') === unit) && (age === '' || item.age === Number(age)));
  const screenRows = [...filtered].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const enrolled = filtered.filter(item => item.status === 'enrolled');
  const active = filtered.filter(item => !['enrolled','declined'].includes(item.status)).length;
  const counts = (keys, keyFor, rows = filtered) => Object.fromEntries(keys.map(key => [key, rows.filter(item => keyFor(item) === key).length]));
  const byStatus = counts(Object.keys(states), item => item.status);
  const bySchedule = counts(schedules, item => item.schedule);
  const byUnit = counts(Object.keys(reportUnits), item => item.unit ?? 'unspecified');
  const enrolledByUnit = counts(Object.keys(reportUnits), item => item.unit ?? 'unspecified', enrolled);
  const byAge = counts(ages, item => item.age);
  const showing = items.find(item => item.id === sheet?.id);

  function openSheet(item, mode) {
    setNotice('');
    setSheet(sheet?.id === item.id && sheet.mode === mode ? null : { id: item.id, mode });
  }

  function reload() {
    setRefresh(value => value + 1);
  }

  function savedSheet(id) {
    setSheet(current => current?.id === id && current.mode === 'edit' ? null : current);
    setNotice('Alterações salvas.');
    reload();
  }

  function renderStudentRows(rows, showDecision) {
    return rows.map(item => <tr key={item.id}>
      <td>{showDecision ? <button type="button" className="portal-student-name"
        aria-expanded={sheet?.id === item.id && sheet.mode === 'view'}
        onClick={() => openSheet(item, 'view')}>{item.child_name}</button> : item.child_name}</td>
      <td>{item.age ?? '—'}</td><td>{studyModes[item.schedule]}</td><td>{schoolUnits[item.unit] || reportUnits.unspecified}</td><td>{states[item.status]}</td>
      {showDecision && <td><button type="button" className="text-link"
        aria-expanded={sheet?.id === item.id && sheet.mode === 'edit'} aria-label={`Editar ficha de ${item.child_name}`}
        onClick={() => openSheet(item, 'edit')}>Editar</button></td>}
    </tr>);
  }

  function print(kind) {
    setReport(kind);
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }

  function changeTabWithKeyboard(event, index) {
    const destinations = { ArrowRight: 1 - index, ArrowLeft: 1 - index, Home: 0, End: 1 };
    const next = destinations[event.key];
    if (typeof next !== 'number') return;
    event.preventDefault();
    setTab(next);
    event.currentTarget.parentElement.children[next].focus();
  }

  return <div className={`portal-print--${report}`}>
    <div className="portal-tabs portal-screen" role="tablist" aria-label="Áreas da Secretaria">
      {secretariatTabs.map(({ id, label }, index) => <button key={id} type="button" role="tab"
        id={`staff-tab-${id}`} aria-controls={`staff-panel-${id}`} aria-selected={tab === index}
        tabIndex={tab === index ? 0 : -1} onClick={() => setTab(index)}
        onKeyDown={event => changeTabWithKeyboard(event, index)}>{label}</button>)}
    </div>
    <section className="portal-card portal-screen">
      <h2>Filtros de matrículas</h2>
      <div className="portal-filters">
        <div className="enrollment-field"><label htmlFor="filter-year">Ano letivo</label>
          <select id="filter-year" value={year} onChange={e => { setYear(Number(e.target.value)); setAge(''); setSheet(null); setNotice(''); }}>
            {(years.length ? years : [year]).map(value => <option key={value} value={value}>{value}</option>)}
          </select></div>
        <div className="enrollment-field"><label htmlFor="filter-status">Situação</label>
          <select id="filter-status" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Todas</option>{Object.entries(states).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
          </select></div>
        <div className="enrollment-field"><label htmlFor="filter-schedule">Turno</label>
          <select id="filter-schedule" value={schedule} onChange={e => setSchedule(e.target.value)}>
            <option value="">Todos</option>{schedules.map(value => <option key={value} value={value}>{studyModes[value]}</option>)}
          </select></div>
        <div className="enrollment-field"><label htmlFor="filter-unit">Unidade</label>
          <select id="filter-unit" value={unit} onChange={e => setUnit(e.target.value)}>
            <option value="">Todas</option>{Object.entries(reportUnits).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></div>
        <div className="enrollment-field"><label htmlFor="filter-age">Idade</label>
          <select id="filter-age" value={age} onChange={e => setAge(e.target.value)}>
            <option value="">Todas</option>{ages.map(value => <option key={value} value={value}>{value} anos</option>)}
          </select></div>
      </div>
      <div className="portal-actions">
        <button className="text-link" onClick={reload}>Atualizar</button>
      </div>
      <p role="status">{error || (loading ? 'Carregando solicitações…' : '')}</p>
    </section>
    <section className="portal-report portal-tab-panel" role="tabpanel" id="staff-panel-reports"
      aria-labelledby="staff-tab-reports" data-active={tab === 0} tabIndex={0}>
      <div className="portal-report-title">
        <h2>{school.name} · Relatório de matrículas</h2>
        <p>Ano letivo {year} · {states[status] || 'Todas as situações'} · {studyModes[schedule] || 'Todos os turnos'} · {reportUnits[unit] || 'Todas as unidades'} · {age === '' ? 'Todas as idades' : `${age} anos`}</p>
        <p>Idades calculadas em {formatDate(referenceDate)}.</p>
      </div>
      <div className="portal-actions portal-screen">
        <button className="button" disabled={loading || Boolean(error)} onClick={() => print('summary')}><Printer size={17} /> Imprimir resumo</button>
        <button className="button" disabled={loading || Boolean(error)} onClick={() => print('list')}><Printer size={17} /> Imprimir lista nominal</button>
      </div>
      {!loading && !error && <>
        <div className="portal-metrics">
          <div><strong>{active}</strong>Pré-matrículas em andamento</div>
          <div><strong>{enrolled.length}</strong>Matrículas confirmadas</div>
          <div><strong>{filtered.length}</strong>Total de solicitações no filtro</div>
          <div className="portal-unit-metric">
            <h3>Nossas unidades</h3>
            <p>Matrículas confirmadas por unidade</p>
            <dl>
              {Object.entries(schoolUnits).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{enrolledByUnit[key]}</dd></div>)}
              {enrolledByUnit.unspecified > 0 && <div><dt>{reportUnits.unspecified}</dt><dd>{enrolledByUnit.unspecified}</dd></div>}
            </dl>
          </div>
        </div>
        <div className="portal-breakdown">
          <section><h3>Por situação</h3><dl>{Object.entries(states).map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{byStatus[key]}</dd></div>)}</dl></section>
          <section><h3>Por turno</h3><dl>{schedules.map(value => <div key={value}><dt>{studyModes[value]}</dt><dd>{bySchedule[value]}</dd></div>)}</dl></section>
          <section><h3>Por unidade</h3><dl>{Object.entries(reportUnits).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{byUnit[key]}</dd></div>)}</dl></section>
          <section><h3>Por idade</h3><dl>{ages.map(value => <div key={value}><dt>{value} anos</dt><dd>{byAge[value]}</dd></div>)}</dl></section>
        </div>
      </>}
    </section>
    <section className="portal-card portal-tab-panel portal-students-panel" role="tabpanel" id="staff-panel-students"
      aria-labelledby="staff-tab-students" data-active={tab === 1} tabIndex={0}>
      <h2 className="portal-screen">Alunos</h2>
      <p className="portal-screen" role="status">{notice}</p>
      {!loading && !error && <>
        <div className="portal-table-wrap">{filtered.length ? <table>
          <caption>Solicitações no filtro</caption>
          <thead><tr><th scope="col">Criança</th><th scope="col">Idade</th><th scope="col">Turno</th><th scope="col">Unidade</th><th scope="col">Situação</th><th scope="col" className="portal-screen">Ficha</th></tr></thead>
          <tbody className="portal-screen">{renderStudentRows(screenRows, true)}</tbody>
          <tbody className="portal-print-rows">{renderStudentRows(filtered, false)}</tbody>
        </table> : <p>Nenhuma solicitação corresponde aos filtros.</p>}</div>
        {showing && <aside className="portal-card portal-screen" ref={sheetRef} tabIndex={-1} aria-label="Ficha do aluno">
          {sheet.mode === 'edit'
            ? <EditApplication key={`${showing.id}-${showing.updated_at}`} client={client} item={showing}
              onCancel={() => setSheet(null)} onSaved={() => savedSheet(showing.id)} onReload={reload} />
            : <Decision key={`${showing.id}-${showing.status}`} client={client} item={showing} onSaved={reload} />}
        </aside>}
      </>}
    </section>
  </div>;
}

function Portal() {
  const [client, setClient] = useState(undefined);
  const [session, setSession] = useState(undefined);
  const [permission, setPermission] = useState(null);
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let subscription;
    getPortalClient({ staff: staffMode }).then(api => {
      if (!active) return;
      setClient(api);
      if (!api) return;
      if (api.demo) {
        setSession(sessionStorage.getItem(demoAccessKey) === 'open' ? api.demoSession : null);
        return;
      }
      subscription = api.auth.onAuthStateChange((event, value) => {
        if (!active) return;
        if (event === 'PASSWORD_RECOVERY') setRecovery(true);
        if (event === 'SIGNED_OUT') setRecovery(false);
        setSession(value);
      }).data.subscription;
    }).catch(() => { if (active) setError('Não foi possível abrir o portal. Recarregue a página para tentar novamente.'); });
    return () => { active = false; subscription?.unsubscribe(); };
  }, []);

  const allowed = client?.demo || (permission?.userId === session?.user?.id ? permission?.allowed : undefined);

  useEffect(() => {
    if (!staffMode || !client || client.demo || !session?.user) return;
    let active = true;
    const userId = session.user.id;
    setPermission(null);
    client.rpc('is_enrollment_staff').then(({ data, error }) => {
      if (active) setPermission({ userId, allowed: error ? 'error' : Boolean(data) });
    });
    return () => { active = false; };
  }, [client, session?.user?.id]);

  function enterDemo() {
    sessionStorage.setItem(demoAccessKey, 'open');
    setSession(client.demoSession);
  }

  async function leave() {
    if (client.demo) {
      sessionStorage.removeItem(demoAccessKey);
      setSession(null);
      return;
    }
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) setError('Não foi possível encerrar a sessão. Tente novamente.');
  }

  return <main className="enrollment portal"><div className="enrollment-shell portal-shell">
    <div className="portal-screen">
      <a href="./" className="enrollment-back"><ArrowLeft size={18}/> Voltar ao site da escola</a>
      <header className="enrollment-intro portal-intro">
        <img className="enrollment-logo" src={`${import.meta.env.BASE_URL}images/marca-cesc.png`} width="600" height="365" alt="" />
        <p className="enrollment-school">{school.fullName}</p>
        <h1>{staffMode ? 'Secretaria' : 'Portal da família'}</h1>
        <p>{staffMode ? 'Organize solicitações e matrículas.' : 'Cadastre suas crianças e acompanhe a pré-matrícula.'}</p>
      </header>
      {(staffMode || session) && (
        <div className="portal-stack-head portal-session">
          {staffMode && <a className="text-link" href="./portal.html">Portal da família</a>}
          {session && <button type="button" className="text-link" onClick={leave}><LogOut size={17}/> {client?.demo ? 'Voltar ao login' : 'Sair'}</button>}
        </div>
      )}
    </div>
    {client?.demo && <p className="enrollment-privacy portal-demo-notice">
      <span><strong>Modo de teste.</strong> Use apenas dados fictícios. Os testes ficam nesta aba e não são enviados à escola.</span>
    </p>}
    {error && <p role="alert">{error}</p>}
    {!error && client === undefined && <p role="status">Carregando portal…</p>}
    {client === null && <section className="portal-card">
      <h2>Portal em preparação</h2>
      <p>O envio online e o acompanhamento estarão disponíveis após a ativação pela escola.</p>
      <a className="button" href="./pre-matricula.html">Abrir formulário em PDF</a>
    </section>}
    {client && (session === null || recovery) && <PortalLogin client={client} staff={staffMode}
      recovery={recovery} onRecovered={() => setRecovery(false)} onDemo={enterDemo} />}
    {client && session && !recovery && (!staffMode ? <Family client={client} user={session.user} key={session.user.id} />
      : allowed === true ? <Secretariat client={client} key={session.user.id} />
      : <p role="status">{allowed === undefined ? 'Verificando acesso…'
        : allowed === 'error' ? 'Não foi possível verificar o acesso. Recarregue a página.'
        : 'Esta conta não tem autorização para acessar a secretaria.'}</p>)}
  </div></main>;
}

createRoot(document.getElementById('root')).render(<Portal />);
