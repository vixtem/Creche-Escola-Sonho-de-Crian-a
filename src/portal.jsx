import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, LogOut, Printer } from 'lucide-react';
import { ageOnDate, sections } from './enrollment-fields';
import { allRows, currentSchoolYear, dateInSchool, formatDate, getPortalClient, states, transitions } from './portal-api';
import { school } from './school';
import { PortalLogin } from './portal-login';
import './styles.css';
import './enrollment.css';
import './portal.css';

const staffMode = new URLSearchParams(window.location.search).get('area') === 'secretaria';
const demoAccessKey = `cesc-portal-demo-access-${staffMode ? 'staff' : 'family'}`;
const schedules = sections[1].fields[0].options;
const secretariatTabs = [
  { id: 'reports', label: 'Informações e relatórios' },
  { id: 'students', label: 'Alunos' },
];
const historyFields = 'id, status, family_message, changed_at';
const today = dateInSchool();

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
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [profiles, requests] = await Promise.all([
      allRows(() => client.from('enrollment_children').select('id, full_name, birth_date').order('id')),
      allRows(() => client.from('enrollment_applications')
        .select('id, child_id, protocol, child_name, schedule, school_year, status').eq('guardian_id', user.id).order('id')),
    ]);
    setChildren(profiles.sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR')));
    setApplications(requests.sort((a, b) => b.school_year - a.school_year));
  }

  function refresh() {
    setError('');
    load().catch(() => setError('Não foi possível carregar as fichas. Tente atualizar.'));
  }
  useEffect(refresh, [client, user.id]);

  async function save(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const data = new FormData(event.currentTarget);
      const full_name = data.get('name').trim();
      const birth_date = data.get('birth');
      if (!full_name || !birth_date) {
        setError('Informe o nome e a data de nascimento da criança.');
        return;
      }
      const request = editing.id ? client.from('enrollment_children').update({ full_name, birth_date })
        .eq('id', editing.id) : client.from('enrollment_children').insert({ full_name, birth_date });
      const { error } = await request.select('id').single();
      if (error) throw error;
      setEditing(null);
      setNotice('Cadastro da criança salvo.');
      refresh();
    } catch (err) {
      setError(err.code === '23505' ? 'Já existe uma criança com este nome e data de nascimento na sua conta.'
        : 'Não foi possível salvar o cadastro. Confira os dados e tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="portal-stack-head"><h2>Minhas crianças</h2>
      <button className="button" type="button" onClick={() => { setEditing({}); setNotice(''); }}>Cadastrar criança</button>
    </div>
    {editing && <form className="portal-card" onSubmit={save} key={editing.id || 'new'}>
      <h3>{editing.id ? 'Editar cadastro' : 'Cadastro da criança'}</h3>
      <div className="enrollment-grid">
        <div className="enrollment-field"><label htmlFor="child-name">Nome completo</label>
          <input id="child-name" name="name" defaultValue={editing.full_name} maxLength={120} required /></div>
        <div className="enrollment-field"><label htmlFor="child-birth">Data de nascimento</label>
          <input id="child-birth" name="birth" type="date" min="1900-01-01" max={today} defaultValue={editing.birth_date} required /></div>
      </div>
      <div className="portal-actions"><button className="button" disabled={busy}>Salvar cadastro</button>
        <button className="text-link" type="button" disabled={busy} onClick={() => setEditing(null)}>Cancelar</button></div>
    </form>}
    <p role="status">{error || notice || (!children ? 'Carregando fichas…' : '')}</p>
    {error && <button className="text-link" type="button" onClick={refresh}>Atualizar lista</button>}
    {children?.length === 0 && !editing && <p>Cadastre uma criança para enviar e acompanhar a pré-matrícula.</p>}
    {children?.map(child => <article className="portal-card" key={child.id}>
      <h3>{child.full_name}</h3>
      <p>Nascimento em {formatDate(child.birth_date)}</p>
      <div className="portal-actions">
        <a className="button" href={`./pre-matricula.html?crianca=${encodeURIComponent(child.id)}`}>Preencher pré-matrícula</a>
        <button className="text-link" type="button" onClick={() => setEditing(child)}>Editar cadastro</button>
      </div>
    </article>)}
    <div className="portal-stack-head"><h2>Minhas solicitações</h2>
      <button className="text-link" type="button" onClick={refresh}>Atualizar situação</button></div>
    {children && applications.length === 0 && <p>As pré-matrículas enviadas aparecem aqui.</p>}
    {applications.map(item => <article className="portal-card" key={item.id}>
      <h3>{item.child_name}</h3>
      <p>{item.school_year} · {item.schedule}</p>
      <strong className="portal-status">{states[item.status]}</strong>
      <History key={item.status} client={client} item={item} />
    </article>)}
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

function Secretariat({ client }) {
  const [tab, setTab] = useState(0);
  const [records, setRecords] = useState([]);
  const [years, setYears] = useState([]);
  const [year, setYear] = useState(currentSchoolYear);
  const [status, setStatus] = useState('');
  const [schedule, setSchedule] = useState('');
  const [age, setAge] = useState('');
  const [visibleId, setVisibleId] = useState(null);
  const [report, setReport] = useState('summary');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const referenceDate = dateInSchool();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setRecords([]);
    setError('');
    Promise.all([
      allRows(() => client.from('enrollment_applications')
        .select('id, protocol, child_name, birth_date, guardian_name, guardian_relationship, guardian_phone, guardian_email, school_year, schedule, status, created_at')
        .eq('school_year', year).order('id')),
      allRows(() => client.from('enrollment_applications').select('school_year').order('school_year').order('id')),
    ]).then(([items, historic]) => {
      if (!active) return;
      setRecords(items.sort((a,b) => b.created_at.localeCompare(a.created_at)));
      setYears([...new Set([currentSchoolYear(), currentSchoolYear() + 1, ...historic.map(item => item.school_year)])].sort((a,b) => b-a));
    }).catch(() => { if (active) setError('Não foi possível carregar as solicitações. Atualize para tentar novamente.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, year, refresh]);

  const items = records.map(item => ({ ...item, age: ageOnDate(item.birth_date, referenceDate) }));
  const ages = [...new Set(items.map(item => item.age).filter(value => value !== null))].sort((a,b) => a-b);
  const filtered = items.filter(item => (!status || item.status === status)
    && (!schedule || item.schedule === schedule) && (age === '' || item.age === Number(age)));
  const enrolled = filtered.filter(item => item.status === 'enrolled').length;
  const active = filtered.filter(item => !['enrolled','declined'].includes(item.status)).length;
  const counts = (keys, keyFor) => Object.fromEntries(keys.map(key => [key, filtered.filter(item => keyFor(item) === key).length]));
  const byStatus = counts(Object.keys(states), item => item.status);
  const bySchedule = counts(schedules, item => item.schedule);
  const byAge = counts(ages, item => item.age);
  const showing = filtered.find(item => item.id === visibleId);

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
          <select id="filter-year" value={year} onChange={e => { setYear(Number(e.target.value)); setAge(''); setVisibleId(null); }}>
            {(years.length ? years : [year]).map(value => <option key={value} value={value}>{value}</option>)}
          </select></div>
        <div className="enrollment-field"><label htmlFor="filter-status">Situação</label>
          <select id="filter-status" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">Todas</option>{Object.entries(states).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
          </select></div>
        <div className="enrollment-field"><label htmlFor="filter-schedule">Turno</label>
          <select id="filter-schedule" value={schedule} onChange={e => setSchedule(e.target.value)}>
            <option value="">Todos</option>{schedules.map(value => <option key={value}>{value}</option>)}
          </select></div>
        <div className="enrollment-field"><label htmlFor="filter-age">Idade</label>
          <select id="filter-age" value={age} onChange={e => setAge(e.target.value)}>
            <option value="">Todas</option>{ages.map(value => <option key={value} value={value}>{value} anos</option>)}
          </select></div>
      </div>
      <div className="portal-actions">
        <button className="text-link" onClick={() => setRefresh(value => value + 1)}>Atualizar</button>
      </div>
      <p role="status">{error || (loading ? 'Carregando solicitações…' : '')}</p>
    </section>
    <section className="portal-report portal-tab-panel" role="tabpanel" id="staff-panel-reports"
      aria-labelledby="staff-tab-reports" data-active={tab === 0} tabIndex={0}>
      <div className="portal-report-title">
        <h2>{school.name} · Relatório de matrículas</h2>
        <p>Ano letivo {year} · {states[status] || 'Todas as situações'} · {schedule || 'Todos os turnos'} · {age === '' ? 'Todas as idades' : `${age} anos`}</p>
        <p>Idades calculadas em {formatDate(referenceDate)}.</p>
      </div>
      <div className="portal-actions portal-screen">
        <button className="button" disabled={loading || Boolean(error)} onClick={() => print('summary')}><Printer size={17} /> Imprimir resumo</button>
        <button className="button" disabled={loading || Boolean(error)} onClick={() => print('list')}><Printer size={17} /> Imprimir lista nominal</button>
      </div>
      {!loading && !error && <>
        <div className="portal-metrics">
          <div><strong>{active}</strong>Pré-matrículas em andamento</div>
          <div><strong>{enrolled}</strong>Matrículas confirmadas</div>
          <div><strong>{filtered.length}</strong>Total de solicitações no filtro</div>
        </div>
        <div className="portal-breakdown">
          <section><h3>Por situação</h3><dl>{Object.entries(states).map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{byStatus[key]}</dd></div>)}</dl></section>
          <section><h3>Por turno</h3><dl>{schedules.map(value => <div key={value}><dt>{value}</dt><dd>{bySchedule[value]}</dd></div>)}</dl></section>
          <section><h3>Por idade</h3><dl>{ages.map(value => <div key={value}><dt>{value} anos</dt><dd>{byAge[value]}</dd></div>)}</dl></section>
        </div>
      </>}
    </section>
    <section className="portal-card portal-tab-panel portal-students-panel" role="tabpanel" id="staff-panel-students"
      aria-labelledby="staff-tab-students" data-active={tab === 1} tabIndex={0}>
      <h2 className="portal-screen">Alunos</h2>
      {!loading && !error && <>
        <div className="portal-table-wrap">{filtered.length ? <table>
          <caption>Solicitações no filtro</caption>
          <thead><tr><th scope="col">Criança</th><th scope="col">Idade</th><th scope="col">Turno</th><th scope="col">Situação</th><th scope="col" className="portal-screen">Ficha</th></tr></thead>
          <tbody>{filtered.map(item => <tr key={item.id}><td>{item.child_name}</td><td>{item.age ?? '—'}</td><td>{item.schedule}</td>
            <td>{states[item.status]}</td><td className="portal-screen"><button type="button" className="text-link"
              aria-expanded={visibleId === item.id} aria-label={`Ficha de ${item.child_name}`}
              onClick={() => setVisibleId(visibleId === item.id ? null : item.id)}>{visibleId === item.id ? 'Fechar' : 'Abrir'}</button></td></tr>)}</tbody>
        </table> : <p>Nenhuma solicitação corresponde aos filtros.</p>}</div>
        {showing && <aside className="portal-card portal-screen">
          <Decision key={`${showing.id}-${showing.status}`} client={client} item={showing} onSaved={() => setRefresh(value => value + 1)} />
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
      <div className="portal-stack-head portal-session">
        <a className="text-link" href={staffMode ? './portal.html' : './portal.html?area=secretaria'}>{staffMode ? 'Portal da família' : 'Acesso da secretaria'}</a>
        {session && <button type="button" className="text-link" onClick={leave}><LogOut size={17}/> {client?.demo ? 'Voltar ao login' : 'Sair'}</button>}
      </div>
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
