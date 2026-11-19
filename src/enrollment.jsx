import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, Download, ShieldCheck } from 'lucide-react';
import { school } from './school';
import { sections, ageOnDate, enrollmentYear } from './enrollment-fields';
import { prepareEnrollmentPhoto } from './enrollment-photo';
import { dateInSchool, getPortalClient } from './portal-api';
import './styles.css';
import './enrollment.css';

const onlineFields = ['child', 'birth', 'schedule', 'guardian', 'relationship', 'phone', 'unit'];
const formFields = sections.flatMap(section => section.fields).filter(field => field.type !== 'age' && !field.readOnly);

function draftKey(portal) {
  return `cesc-enrollment-draft-v1:${portal.user.id}:${portal.child?.id ?? 'new'}:${enrollmentYear}`;
}

function draftRevision({ application, child }) {
  return application?.updated_at ?? application?.created_at ?? (child ? `${child.full_name}:${child.birth_date}` : 'new');
}

function readDraft(portal) {
  try {
    const storage = portal.client.demo ? sessionStorage : localStorage;
    return JSON.parse(storage.getItem(draftKey(portal))) || {};
  } catch {
    return {};
  }
}

function writeDraft(portal, fields, photo) {
  const storage = portal.client.demo ? sessionStorage : localStorage;
  const key = draftKey(portal);
  if (photo || Object.keys(fields).length) storage.setItem(key, JSON.stringify({ revision: draftRevision(portal), fields, photo }));
  else storage.removeItem(key);
}

function Field({ field, values, update }) {
  const { name, label, options, type = 'text', limit, optional, wide, autoComplete, readOnly } = field;
  const value = values[name] || '';
  const id = `enrollment-${name}`;
  const props = {
    id, name, value, autoComplete, required: !optional, maxLength: limit, readOnly,
    onChange: (event) => update(name, event.currentTarget.value),
  };

  return (
    <div className={`enrollment-field${wide ? ' enrollment-wide' : ''}`}>
      <label htmlFor={id}>{label} {optional && <span>(opcional)</span>}</label>
      {options ? (
        <select {...props}>
          <option value="" disabled>Selecione</option>
          {(Array.isArray(options) ? options.map(option => [option, option]) : Object.entries(options))
            .map(([key, text]) => <option key={key} value={key}>{text}</option>)}
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
  const [portal, setPortal] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return { loading: params.has('crianca') || params.get('nova') === '1' };
  });
  const [draft, setDraft] = useState({});
  const [draftError, setDraftError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const [sendError, setSendError] = useState('');
  const [reload, setReload] = useState(0);
  const { application } = portal;

  function openApplication(context) {
    const item = context.application;
    const saved = readDraft(context);
    const revisionMatches = saved.revision === draftRevision(context);
    const restored = Object.fromEntries(formFields
      .filter(({ name }) => typeof saved.fields?.[name] === 'string' && (revisionMatches || !onlineFields.includes(name)))
      .map(({ name }) => [name, saved.fields[name]]));
    setDraft(restored);
    setPhoto(saved.photo || null);
    setValues({
      child: item?.child_name ?? context.child?.full_name ?? '',
      birth: item?.birth_date ?? context.child?.birth_date ?? '',
      email: context.user.email,
      schedule: item?.schedule ?? '', guardian: item?.guardian_name ?? '',
      relationship: item?.guardian_relationship ?? '', phone: item?.guardian_phone ?? '', unit: item?.unit ?? '',
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
    const newApplication = !requestedChild && params.get('nova') === '1';
    if (!requestedChild && !newApplication) return;
    let active = true;
    setPortal({ loading: true, notice: 'Carregando cadastro da criança…' });
    getPortalClient().then(async client => {
      if (!client) throw new Error();
      const { data: { session }, error: sessionError } = client.demo
        ? { data: { session: client.demoSession } } : await client.auth.getSession();
      if (sessionError || !session?.user.email) throw new Error();
      if (newApplication) {
        if (!active) return;
        const context = { client, user: session.user };
        openApplication(context);
        setPortal(context);
        return;
      }
      const [{ data: child, error }, { data: application, error: applicationError }] = await Promise.all([
        client.from('enrollment_children').select('id, full_name, birth_date').eq('id', requestedChild).maybeSingle(),
        client.from('enrollment_applications')
          .select('id, protocol, child_name, birth_date, guardian_name, guardian_relationship, guardian_phone, schedule, unit, created_at, updated_at')
          .eq('child_id', requestedChild).eq('guardian_id', session.user.id).eq('school_year', enrollmentYear).maybeSingle(),
      ]);
      if (error || applicationError || !child) throw new Error();
      if (!active) return;
      const context = { client, child, application, user: session.user, notice: '' };
      openApplication(context);
      setPortal(context);
    }).catch(() => {
      if (active) setPortal({ client: null, child: null, notice: 'Cadastro indisponível nesta sessão. Abra a ficha pelo Portal da família para enviar à escola.' });
    });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    if (!portal.user) return;
    try {
      writeDraft(portal, draft, photo);
      setDraftError('');
    } catch {
      setDraftError('O navegador não conseguiu guardar o rascunho neste dispositivo. Baixe o PDF para guardar uma cópia.');
    }
  }, [portal, draft, photo]);

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
    const fields = profileOnly ? formFields.filter(({ name }) => name === 'child' || name === 'birth') : formFields;
    for (const { name, optional } of fields) {
      const field = form.elements.namedItem(name);
      if (!field.reportValidity()) return;
      if (!optional && !field.value.trim()) {
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
      const payload = {
        p_schedule: values.schedule, p_unit: values.unit,
        p_child_name: values.child.trim(), p_birth_date: values.birth,
        p_guardian_name: values.guardian.trim(), p_relationship: values.relationship.trim(),
        p_phone: values.phone.trim(),
      };
      const request = portal.child ? portal.client.rpc('save_current_enrollment', {
        ...payload, p_child: portal.child.id, p_expected_updated_at: application?.updated_at ?? application?.created_at ?? null,
      }) : portal.client.rpc('create_current_enrollment', payload);
      const { data, error } = await request.single();
      if (error || !data) throw error;
      const saved = { ...application, ...data, child_name: values.child.trim(), birth_date: values.birth,
        schedule: values.schedule, unit: values.unit, guardian_name: values.guardian.trim(),
        guardian_relationship: values.relationship.trim(), guardian_phone: values.phone.trim() };
      const updateProfile = !application || application.child_name !== saved.child_name || application.birth_date !== saved.birth_date;
      const child = updateProfile ? { id: portal.child?.id ?? data.child_id, full_name: saved.child_name, birth_date: saved.birth_date } : portal.child;
      const nextPortal = { ...portal, child, application: saved };
      const remainingDraft = Object.fromEntries(Object.entries(draft).filter(([name]) => !onlineFields.includes(name)));
      if (!portal.child) {
        try {
          writeDraft(nextPortal, remainingDraft, photo);
          const storage = portal.client.demo ? sessionStorage : localStorage;
          storage.removeItem(draftKey(portal));
        } catch {
          // Keep the original draft if moving it to the new record fails.
        }
        const url = new URL(window.location.href);
        url.searchParams.delete('nova');
        url.searchParams.set('crianca', child.id);
        window.history.replaceState(null, '', url);
      }
      setPortal(nextPortal);
      setDraft(remainingDraft);
      setSent(data);
    } catch (error) {
      setSendError(error?.code === '40001' ? 'Esta ficha foi atualizada desde que você abriu a página. Recarregue a ficha para conferir os dados atuais.'
        : error?.code === '23505' ? 'Já existe uma criança com esse nome e data de nascimento. Abra a ficha dessa criança pelo Portal da Família.'
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
          <h1>Ficha de pré-matrícula {enrollmentYear}</h1>
          <p>Educação Infantil · {school.ageRange}</p>
        </div>
        <p className="enrollment-privacy"><ShieldCheck aria-hidden="true" size={21} />
          <span>{portal.client?.demo
            ? 'Modo de teste. Use apenas dados fictícios. A pré-matrícula de teste fica nesta aba e não é enviada à escola.'
            : portal.user
            ? 'Sexo, endereço e foto ficam no rascunho deste navegador e podem ser incluídos no PDF.'
            : 'Entre no Portal da Família e abra a ficha pelo cadastro da criança.'}</span>
        </p>
        <a className="button enrollment-portal-link" href="./portal.html">
          <ArrowLeft size={19} aria-hidden="true" /> Voltar ao Portal da Família
        </a>
        {portal.notice && <p role="status">{portal.notice}</p>}
        {draftError && <p role="status">{draftError}</p>}
        {!portal.loading && portal.user && <form onSubmit={download} autoComplete="off">
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
          <fieldset className="enrollment-section enrollment-submit">
            <legend>{application ? 'Atualizar pré-matrícula' : 'Enviar à secretaria'}</legend>
            <p>A secretaria recebe nome e nascimento da criança, modalidade, unidade e dados do responsável.</p>
            <button className="button" type="button" disabled={sending || photoLoading} onClick={send}>
              {sending ? 'Salvando…' : application ? 'Salvar alterações' : 'Enviar pré-matrícula'}
            </button>
            {portal.child && !application && <button className="text-link" type="button" disabled={sending} onClick={event => send(event, true)}>
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
          </fieldset>
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
