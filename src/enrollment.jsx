import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, Download, ShieldCheck } from 'lucide-react';
import { school } from './school';
import { sections, ageOnDate } from './enrollment-fields';
import { prepareEnrollmentPhoto } from './enrollment-photo';
import { allRows, currentSchoolYear, dateInSchool, getPortalClient } from './portal-api';
import './styles.css';
import './enrollment.css';

const onlineFields = ['child', 'birth', 'schedule', 'guardian', 'relationship', 'phone', 'email'];

function draftKey(portal, year) {
  return `cesc-enrollment-draft-v1:${portal.user.id}:${portal.child.id}:${year}`;
}

function readDraft(portal, year) {
  try {
    const storage = portal.client.demo ? sessionStorage : localStorage;
    return JSON.parse(storage.getItem(draftKey(portal, year))) || {};
  } catch {
    return {};
  }
}

function Field({ field, values, update }) {
  const { name, label, options, details, type = 'text', limit, optional, wide, autoComplete } = field;
  const value = values[name] || '';
  const id = `enrollment-${name}`;
  const props = {
    id, name, value, autoComplete, required: !optional, maxLength: limit,
    onChange: (event) => update(name, event.currentTarget.value),
  };

  return (
    <div className={`enrollment-field${wide ? ' enrollment-wide' : ''}`}>
      <label htmlFor={id}>{label} {optional && <span>(opcional)</span>}</label>
      {options ? (
        <select {...props}>
          <option value="" disabled>Selecione</option>
          {options.map(option => <option key={option}>{option}</option>)}
        </select>
      ) : type === 'age' ? (
        <output id={id} htmlFor="enrollment-birth">{values.age || 'Calculada pela data de nascimento'}</output>
      ) : (
        <input {...props} type={type} min={type === 'date' ? '1900-01-01' : undefined}
          max={type === 'date' ? dateInSchool() : undefined}
          pattern={name === 'cep' ? '[0-9]{5}(?:-| )?[0-9]{3}' : undefined}
          inputMode={name === 'cep' ? 'numeric' : undefined}
          placeholder={name === 'cep' ? '00000-000' : undefined} />
      )}
      {details && value === 'Sim' && (
        <div className="enrollment-detail">
          <label htmlFor={`${id}-details`}>{details} <span>(obrigatório)</span></label>
          <textarea id={`${id}-details`} name={`${name}Details`}
            rows={2} maxLength={240} required
            value={values[`${name}Details`] || ''}
            onChange={event => update(`${name}Details`, event.currentTarget.value)} />
        </div>
      )}
    </div>
  );
}

function PhotoField({ photo, error, loading, onChange }) {
  return (
    <div className="enrollment-field enrollment-wide enrollment-photo">
      <div>
        <label htmlFor="enrollment-photo">Foto 3×4 da criança <span>(opcional)</span></label>
        <input id="enrollment-photo" type="file" accept="image/jpeg,image/png,image/webp"
          aria-describedby="enrollment-photo-help" onChange={event => onChange(event.currentTarget)} />
        <p id="enrollment-photo-help">JPG, PNG ou WebP, até 12 MB. Escolha uma foto com o rosto centralizado.</p>
        {photo && <button className="text-link" type="button" onClick={event => {
          const input = event.currentTarget.form.querySelector('#enrollment-photo');
          input.value = '';
          onChange(input);
        }}>Remover foto</button>}
        <p role="status">{loading ? 'Preparando foto…' : error}</p>
      </div>
      {photo && <img src={photo} alt="Prévia do recorte da foto 3×4" />}
    </div>
  );
}

function Enrollment() {
  const [values, setValues] = useState({});
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear);
  const [portal, setPortal] = useState(() => ({
    loading: new URLSearchParams(window.location.search).has('crianca'),
  }));
  const [draft, setDraft] = useState({});
  const [draftError, setDraftError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const [sendError, setSendError] = useState('');
  const [reload, setReload] = useState(0);
  const application = portal.applications?.find(item => item.school_year === schoolYear);

  function openYear(context, year) {
    const item = context.applications.find(request => request.school_year === year);
    const saved = readDraft(context, year);
    const revision = item?.updated_at ?? item?.created_at ?? `${context.child.full_name}:${context.child.birth_date}`;
    const restored = Object.fromEntries(Object.entries(saved.fields || {}).filter(([name]) =>
      saved.revision === revision || !onlineFields.includes(name)));
    setSchoolYear(year);
    setDraft(restored);
    setPhoto(saved.photo || null);
    setValues({
      child: item?.child_name ?? context.child.full_name,
      birth: item?.birth_date ?? context.child.birth_date,
      email: item?.guardian_email ?? context.user.email ?? '',
      schedule: item?.schedule ?? '', guardian: item?.guardian_name ?? '',
      relationship: item?.guardian_relationship ?? '', phone: item?.guardian_phone ?? '',
      ...restored,
    });
    setSent(null);
    setStatus('');
    setPhotoError('');
    setSendError('');
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedChild = params.get('crianca');
    if (!requestedChild) return;
    let active = true;
    setPortal({ loading: true, notice: 'Carregando cadastro da criança…' });
    getPortalClient().then(async client => {
      if (!client) throw new Error();
      const { data: { session }, error: sessionError } = client.demo
        ? { data: { session: client.demoSession } } : await client.auth.getSession();
      if (sessionError || !session) throw new Error();
      const [{ data: child, error }, applications] = await Promise.all([
        client.from('enrollment_children').select('id, full_name, birth_date').eq('id', requestedChild).maybeSingle(),
        allRows(() => client.from('enrollment_applications')
          .select('id, protocol, child_name, birth_date, guardian_name, guardian_relationship, guardian_phone, guardian_email, school_year, schedule, created_at, updated_at')
          .eq('child_id', requestedChild).eq('guardian_id', session.user.id).order('school_year', { ascending: false }).order('id')),
      ]);
      if (error || !child) throw new Error();
      if (!active) return;
      const context = { client, child, applications, user: session.user, notice: '' };
      const currentYear = currentSchoolYear();
      const requestedYear = Number(params.get('ano'));
      const knownYears = [currentYear, currentYear + 1, ...applications.map(item => item.school_year)];
      openYear(context, knownYears.includes(requestedYear) ? requestedYear : applications[0]?.school_year ?? currentYear);
      setPortal(context);
    }).catch(() => {
      if (active) setPortal({ client: null, child: null, notice: 'Cadastro indisponível nesta sessão. Abra a ficha pelo Portal da família para enviar à escola.' });
    });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    if (!portal.child) return;
    try {
      const key = draftKey(portal, schoolYear);
      const storage = portal.client.demo ? sessionStorage : localStorage;
      const revision = application?.updated_at ?? application?.created_at ?? `${portal.child.full_name}:${portal.child.birth_date}`;
      if (photo || Object.keys(draft).length) storage.setItem(key, JSON.stringify({ revision, fields: draft, photo }));
      else storage.removeItem(key);
      setDraftError('');
    } catch {
      setDraftError('O navegador não conseguiu guardar o rascunho neste dispositivo. Baixe o PDF para guardar uma cópia.');
    }
  }, [portal, schoolYear, application, draft, photo]);

  async function changePhoto(input) {
    const file = input.files[0];
    setPhoto(null);
    setPhotoError('');
    setStatus('');
    setPhotoLoading(Boolean(file));
    if (!file) return;
    try {
      const image = await prepareEnrollmentPhoto(file);
      if (input.files[0] === file) setPhoto(image);
    } catch (error) {
      if (input.files[0] === file) {
        input.value = '';
        setPhotoError(error.message);
      }
    } finally {
      if (input.files[0] === file || !input.files.length) setPhotoLoading(false);
    }
  }

  function update(name, value) {
    setValues(current => ({ ...current, [name]: value }));
    setDraft(current => ({ ...current, [name]: value }));
    setStatus('');
    setSent(null);
  }

  const birthDate = values.birth;
  const age = birthDate ? ageOnDate(birthDate, dateInSchool()) : null;
  const answers = { ...values, age: age === null ? '' : `${age} ${age === 1 ? 'ano' : 'anos'}` };

  async function download(event) {
    event.preventDefault();
    if (photoLoading) return;
    const form = event.currentTarget;
    const blank = [...form.elements].find(field => field.required && !field.value.trim());
    if (blank) {
      blank.setCustomValidity('Preencha este campo.');
      blank.reportValidity();
      blank.setCustomValidity('');
      return;
    }
    setBusy(true);
    setStatus('');
    try {
      const { downloadEnrollmentPdf } = await import('./enrollment-download');
      await downloadEnrollmentPdf(answers, photo);
      setStatus('PDF gerado. Guarde o arquivo para apresentar à secretaria.');
    } catch {
      setStatus('Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function send(event, profileOnly = false) {
    const form = event.currentTarget.form;
    if (sending) return;
    for (const name of profileOnly ? ['child', 'birth'] : onlineFields) {
      const field = form.elements.namedItem(name);
      if (!field.reportValidity()) return;
      if (name !== 'email' && !field.value.trim()) {
        field.setCustomValidity('Preencha este campo.');
        field.reportValidity();
        field.setCustomValidity('');
        return;
      }
    }
    if (!profileOnly && (!/^\+?[0-9 ()-]+$/.test(values.phone.trim()) || !/^\d{10,13}$/.test(values.phone.replace(/\D/g, '')))) {
      const phone = form.elements.namedItem('phone');
      phone.setCustomValidity('Informe um telefone válido com DDD.');
      phone.reportValidity();
      phone.setCustomValidity('');
      return;
    }
    setSending(true);
    setSendError('');
    try {
      if (profileOnly) {
        const fields = { full_name: values.child.trim(), birth_date: values.birth };
        const { error } = await portal.client.from('enrollment_children').update(fields)
          .eq('id', portal.child.id).select('id').single();
        if (error) throw error;
        setPortal(current => ({ ...current, child: { ...current.child, ...fields } }));
        setDraft(current => Object.fromEntries(Object.entries(current).filter(([name]) => name !== 'child' && name !== 'birth')));
        setSent({ profileOnly: true });
        return;
      }
      const { data, error } = await portal.client.rpc('save_family_enrollment', {
        p_child: portal.child.id, p_year: schoolYear, p_schedule: values.schedule,
        p_expected_updated_at: application?.updated_at ?? application?.created_at ?? null,
        p_child_name: values.child.trim(), p_birth_date: values.birth,
        p_guardian_name: values.guardian.trim(), p_relationship: values.relationship.trim(),
        p_phone: values.phone.trim(), p_email: values.email.trim(),
      }).single();
      if (error || !data) throw error;
      const saved = { ...application, ...data, school_year: schoolYear, child_name: values.child.trim(), birth_date: values.birth,
        schedule: values.schedule, guardian_name: values.guardian.trim(), guardian_relationship: values.relationship.trim(),
        guardian_phone: values.phone.trim(), guardian_email: values.email.trim() || portal.user.email };
      const updateProfile = !application || application.child_name !== saved.child_name || application.birth_date !== saved.birth_date;
      setPortal(current => ({ ...current, child: updateProfile ? { ...current.child, full_name: saved.child_name, birth_date: saved.birth_date } : current.child,
        applications: [...current.applications.filter(item => item.school_year !== schoolYear), saved] }));
      setDraft(current => Object.fromEntries(Object.entries(current).filter(([name]) => !onlineFields.includes(name))));
      setSent(data);
    } catch (error) {
      setSendError(error?.code === '40001' ? 'Esta ficha foi atualizada desde que você abriu a página. Recarregue a ficha para conferir os dados atuais.'
        : error?.code === '23505' ? 'Já existe uma criança com esse nome e data de nascimento na sua conta.'
        : 'Não foi possível salvar a pré-matrícula. Confira os dados e tente novamente.');
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="enrollment">
      <div className="enrollment-shell">
        <div className="enrollment-intro">
          <img className="enrollment-logo" src={`${import.meta.env.BASE_URL}images/marca-cesc.png`} width="600" height="365" alt="" />
          <p className="enrollment-school">{school.fullName}</p>
          <h1>Ficha de pré-matrícula</h1>
          <p>Educação Infantil · {school.ageRange}</p>
        </div>
        <p className="enrollment-privacy"><ShieldCheck aria-hidden="true" size={21} />
          <span>{portal.client?.demo
            ? 'Modo de teste. Use apenas dados fictícios. A pré-matrícula de teste fica nesta aba e não é enviada à escola.'
            : portal.child
            ? 'Os dados enviados à secretaria ficam no portal. Os demais campos e a foto ficam no rascunho deste navegador e podem ser incluídos no PDF.'
            : 'Preencha a ficha e baixe o PDF de uma página para apresentar à secretaria. Neste modo, os dados ficam no dispositivo.'}</span>
        </p>
        <a className="button enrollment-portal-link" href="./portal.html">
          <ArrowLeft size={19} aria-hidden="true" /> Voltar ao Portal da Família
        </a>
        {portal.notice && <p role="status">{portal.notice}</p>}
        {draftError && <p role="status">{draftError}</p>}
        {!portal.loading && <form onSubmit={download} autoComplete="off">
          {sections.map(({ title, fields }) => (
            <fieldset key={title} className="enrollment-section" disabled={sending}>
              <legend>{title}</legend>
              <div className="enrollment-grid">
                {fields.map(field => <Field key={field.name} field={field} values={answers} update={update} />)}
                {fields[0].name === 'child' &&
                  <PhotoField photo={photo} error={photoError} loading={photoLoading} onChange={changePhoto} />}
              </div>
            </fieldset>
          ))}
          {portal.child && <fieldset className="enrollment-section enrollment-submit">
            <legend>{application ? 'Atualizar pré-matrícula' : 'Enviar à secretaria'}</legend>
            <div className="enrollment-field">
              <label htmlFor="enrollment-year">Ano letivo</label>
              <select id="enrollment-year" value={schoolYear} disabled={sending || photoLoading}
                onChange={event => {
                  const url = new URL(window.location.href);
                  url.searchParams.set('ano', event.target.value);
                  window.history.replaceState(null, '', url);
                  openYear(portal, Number(event.target.value));
                }}>
                {[...new Set([currentSchoolYear(), currentSchoolYear() + 1, ...portal.applications.map(item => item.school_year)])]
                  .sort((a, b) => a - b).map(year => <option key={year} value={year}>{year}</option>)}
              </select>
            </div>
            <p>A secretaria recebe o nome e a data de nascimento da criança, o turno e os dados do responsável.</p>
            <button className="button" type="button" disabled={sending} onClick={send}>
              {sending ? 'Salvando…' : application ? 'Salvar alterações' : 'Enviar pré-matrícula'}
            </button>
            {!application && <button className="text-link" type="button" disabled={sending} onClick={event => send(event, true)}>
              Salvar dados da criança
            </button>}
            {sendError && <div role="alert"><p>{sendError}</p>{sendError.startsWith('Esta ficha foi atualizada') &&
              <button className="text-link" type="button" onClick={() => setReload(value => value + 1)}>Recarregar ficha</button>}</div>}
            {sent && <div role="status">
              <p>{sent.profileOnly ? 'Dados da criança salvos.' : sent.created ? 'Pré-matrícula recebida.' : 'Alterações salvas.'}</p>
              {sent.protocol && <>
                <p>Protocolo <strong>{sent.protocol}</strong></p>
                <a className="text-link" href="./portal.html">Acompanhar solicitação</a>
              </>}
            </div>}
          </fieldset>}
          <div className="enrollment-actions">
            <button className="button" type="submit" disabled={busy || photoLoading || sending}>
              <Download aria-hidden="true" size={19} /> {busy ? 'Gerando PDF…' : 'Baixar ficha em PDF'}
            </button>
            <p role="status">{status}</p>
          </div>
        </form>}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Enrollment />);
