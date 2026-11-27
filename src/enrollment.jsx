import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, Download, ShieldCheck } from 'lucide-react';
import { school } from './school';
import { sections, ageOnDate, childSexOptions, enrollmentAgeRequirement, enrollmentBirthRange, enrollmentYear, isEnrollmentBirthDate } from './enrollment-fields';
import { combineLegacyAddress, enrollmentAddressFields, enrollmentDeclaration, enrollmentDetailsSections, enrollmentHours, imageConsentScope, visibleEnrollmentFields } from './enrollment-details';
import { Field, PhotoField } from './enrollment-controls';
import { formatCep, lookupCepAddress } from './enrollment-cep.js';
import { prepareEnrollmentPhoto } from './enrollment-photo';
import { allRows, getPortalClient } from './portal-api';
import './styles.css';
import './enrollment.css';

const onlineFields = ['child', 'birth', 'schedule', 'guardian', 'relationship', 'phone', 'unit'];
const formFields = sections.flatMap(section => section.fields).filter(field => field.type !== 'age' && !field.readOnly);
const schoolPdfStatuses = ['documents', 'approved', 'enrolled'];

async function readEnrollmentProgress(client, application) {
  if (!application) return { schoolPdf: false, instructions: '' };
  const history = await allRows(() => client.from('enrollment_history').select('id, status, family_message')
    .eq('application_id', application.id).order('id', { ascending: false }));
  return {
    schoolPdf: schoolPdfStatuses.includes(application.status) || history.some(item => schoolPdfStatuses.includes(item.status)),
    instructions: history.find(item => item.status === 'documents')?.family_message || '',
  };
}

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
  const photoEdited = photo !== (portal.savedPhoto ?? null);
  if (photoEdited || Object.keys(fields).length) storage.setItem(key, JSON.stringify({
    revision: draftRevision(portal), fields, ...(photoEdited ? { photo } : {}),
  }));
  else storage.removeItem(key);
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
  const [cepStatus, setCepStatus] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const cepRequest = useRef(null);
  const cepFilledFields = useRef({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const [sendError, setSendError] = useState('');
  const [reload, setReload] = useState(0);
  const { application } = portal;
  const isEnrollment = application?.status === 'documents';
  const schoolPdf = portal.progress?.schoolPdf;
  const enrollmentSections = isEnrollment ? [
    ...sections.map(section => {
      const extra = enrollmentDetailsSections.find(({ title }) => title === section.title);
      return { ...section, fields: [...section.fields, ...extra?.fields ?? []] };
    }),
    ...enrollmentDetailsSections.filter(({ base }) => !base),
  ] : sections;

  function openApplication(context) {
    const item = context.application;
    const details = combineLegacyAddress(context.enrollmentDetails ?? {});
    const saved = readDraft(context);
    const revisionMatches = saved.revision === draftRevision(context);
    const restored = Object.fromEntries(formFields
      .filter(({ name }) => typeof saved.fields?.[name] === 'string'
        && (revisionMatches || (!context.photoSaved && !onlineFields.includes(name) && !Object.hasOwn(details, name))))
      .map(({ name }) => [name, saved.fields[name]]));
    setDraft(restored);
    setPhoto(Object.hasOwn(saved, 'photo') && (revisionMatches || !context.photoSaved)
      ? saved.photo : context.savedPhoto ?? null);
    const initialValues = {
      child: item?.child_name ?? context.child?.full_name ?? '',
      birth: item?.birth_date ?? context.child?.birth_date ?? '',
      email: context.user.email,
      schedule: item?.schedule ?? '', guardian: item?.guardian_name ?? '',
      relationship: item?.guardian_relationship ?? '', phone: item?.guardian_phone ?? '', unit: item?.unit ?? '',
      consentName: item?.guardian_name ?? '',
      ...details,
      ...restored,
    };
    if (!childSexOptions.includes(initialValues.sex)) initialValues.sex = '';
    setValues(initialValues);
    cepFilledFields.current = {};
    setCepStatus('');
    setCepLoading(false);
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
          .select('id, protocol, child_name, birth_date, guardian_name, guardian_relationship, guardian_phone, schedule, unit, status, created_at, updated_at')
          .eq('child_id', requestedChild).eq('guardian_id', session.user.id).eq('school_year', enrollmentYear).maybeSingle(),
      ]);
      if (error || applicationError || !child) throw new Error();
      const progress = await readEnrollmentProgress(client, application);
      let savedRecord;
      if (application) {
        const { data, error } = await client.from('enrollment_form_details').select('details, photo, photo_saved')
          .eq('application_id', application.id).maybeSingle();
        if (error) throw error;
        savedRecord = data;
      }
      if (!active) return;
      const context = { client, child, application, progress, enrollmentDetails: savedRecord?.details,
        savedPhoto: savedRecord?.photo ?? null, photoSaved: savedRecord?.photo_saved, user: session.user, notice: '' };
      openApplication(context);
      setPortal(context);
    }).catch(() => {
      if (active) setPortal({ client: null, child: null, notice: 'Cadastro indisponível nesta sessão. Abra a ficha pelo Portal da família para enviar à escola.' });
    });
    return () => {
      active = false;
      cepRequest.current?.controller.abort();
      cepRequest.current = null;
    };
  }, [reload]);

  useEffect(() => {
    if (!portal.user) return;
    try {
      writeDraft(portal, draft, photo);
      setDraftError('');
    } catch {
      setDraftError('O navegador não conseguiu guardar o rascunho neste dispositivo.');
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

  function updateFields(changes) {
    setValues(current => ({ ...current, ...changes }));
    const draftChanges = Object.fromEntries(formFields
      .filter(({ name }) => Object.hasOwn(changes, name))
      .map(({ name }) => [name, changes[name]]));
    if (Object.keys(draftChanges).length) setDraft(current => ({ ...current, ...draftChanges }));
    setStatus('');
    setSent(null);
  }

  async function findAddress(cep) {
    cepRequest.current?.controller.abort();
    cepRequest.current = null;
    setCepStatus('');
    setCepLoading(cep.length === 9);
    if (cep.length !== 9) return;

    const controller = new AbortController();
    const fields = new Set(['address', 'district'].filter(name => (
      !values[name]?.trim() || values[name] === cepFilledFields.current[name]
    )));
    const request = { controller, fields };
    cepRequest.current = request;
    setCepStatus('Consultando CEP…');
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const result = await lookupCepAddress(cep, controller.signal);
      if (cepRequest.current !== request) return;
      if (!result) {
        setCepStatus('CEP não encontrado. Confira o número ou preencha o endereço manualmente.');
        return;
      }
      const changes = Object.fromEntries([...fields].flatMap(name => {
        const value = result[name] || (Object.hasOwn(cepFilledFields.current, name) ? '' : undefined);
        return value === undefined ? [] : [[name, value]];
      }));
      if (Object.keys(changes).length) {
        Object.assign(cepFilledFields.current, changes);
        updateFields(changes);
      }
      setCepStatus(result.partial
        ? 'CEP encontrado. Complete os dados que faltam no endereço e no bairro.'
        : 'CEP encontrado. Confira o endereço e acrescente o número e o complemento, se houver.');
    } catch {
      if (cepRequest.current === request) {
        setCepStatus('Não foi possível consultar o CEP agora. Preencha o endereço manualmente.');
      }
    } finally {
      clearTimeout(timeout);
      if (cepRequest.current === request) {
        cepRequest.current = null;
        setCepLoading(false);
      }
    }
  }

  function update(name, value) {
    if (name === 'cep') {
      value = formatCep(value);
      if (value !== values.cep) findAddress(value);
    } else if (name === 'address' || name === 'district') {
      cepRequest.current?.fields.delete(name);
      delete cepFilledFields.current[name];
    }
    updateFields({ [name]: value });
  }

  const birthDate = values.birth;
  const savedBirth = application?.birth_date;
  const birthRange = enrollmentBirthRange(enrollmentYear, savedBirth);
  const ageRequirement = enrollmentAgeRequirement();
  const age = birthDate ? ageOnDate(birthDate, `${enrollmentYear}-12-31`) : null;
  const answers = { ...values, ...enrollmentHours(values.schedule), age: age === null ? '' : `${age} ${age === 1 ? 'ano' : 'anos'}` };

  async function download(event) {
    event.preventDefault();
    if (photoLoading || schoolPdf || busy || sending || cepLoading) return;
    const form = event.currentTarget;
    const blank = [...form.elements].find(field => field.required && !field.value.trim());
    if (blank) {
      blank.setCustomValidity('Preencha este campo.');
      blank.reportValidity();
      blank.setCustomValidity('');
      return;
    }
    if (!isEnrollmentBirthDate(birthDate, enrollmentYear, savedBirth)) {
      setStatus(ageRequirement);
      return;
    }
    setBusy(true);
    setStatus('');
    try {
      if (portal.child) {
        const { data: current, error } = await portal.client.from('enrollment_applications').select('id, status')
          .eq('child_id', portal.child.id).eq('school_year', enrollmentYear).maybeSingle();
        if (error || (application && !current)) throw error ?? new Error();
        const progress = await readEnrollmentProgress(portal.client, current);
        if (progress.schoolPdf) {
          setPortal(value => ({ ...value, application: { ...value.application, ...current }, progress }));
          return;
        }
      }
      const { downloadEnrollmentPdf } = await import('./enrollment-download');
      await downloadEnrollmentPdf(answers, photo);
      setStatus('PDF gerado. Guarde o arquivo para apresentar à secretaria.');
    } catch {
      setStatus('Não foi possível gerar o PDF. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function send(event) {
    const form = event.currentTarget.form;
    if (sending || cepLoading) return;
    if (birthDate && !isEnrollmentBirthDate(birthDate, enrollmentYear, savedBirth)) {
      setSendError(ageRequirement);
      form.elements.namedItem('birth').focus();
      return;
    }
    const extraFields = isEnrollment ? enrollmentDetailsSections.flatMap(section => visibleEnrollmentFields(section.fields, values)) : [];
    const fields = [...formFields, ...extraFields];
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
    if (values.address.trim().length > form.elements.namedItem('address').maxLength) {
      const address = form.elements.namedItem('address');
      address.setCustomValidity('Use até 180 caracteres no endereço completo.');
      address.reportValidity();
      address.setCustomValidity('');
      return;
    }
    if (isEnrollment && values.imageConsent === 'Sim' && !/^\d{11}$/.test(values.consentCpf?.replace(/\D/g, ''))) {
      setSendError('Informe o CPF de quem autoriza o uso de imagem, com 11 dígitos.');
      return;
    }
    if (isEnrollment && !form.elements.namedItem('declarationAccepted').reportValidity()) return;
    if (!/^\+?[0-9 ()-]+$/.test(values.phone.trim()) || !/^\d{10,13}$/.test(values.phone.replace(/\D/g, ''))) {
      const phone = form.elements.namedItem('phone');
      phone.setCustomValidity('Informe um telefone válido com DDD.');
      phone.reportValidity();
      phone.setCustomValidity('');
      return;
    }
    setSending(true);
    setSendError('');
    try {
      const payload = {
        p_schedule: values.schedule, p_unit: values.unit,
        p_child_name: values.child.trim(), p_birth_date: values.birth,
        p_guardian_name: values.guardian.trim(), p_relationship: values.relationship.trim(),
        p_phone: values.phone.trim(),
      };
      const details = Object.fromEntries([
        ...enrollmentAddressFields.map(([name]) => name), ...extraFields.map(({ name }) => name),
        ...(isEnrollment ? ['declarationAccepted'] : []),
      ].filter(name => answers[name]?.trim()).map(name => [name, answers[name].trim()]));
      const request = portal.client.rpc('save_family_enrollment_record', {
        ...payload, p_child: portal.child?.id ?? null,
        p_expected_updated_at: application?.updated_at ?? application?.created_at ?? null,
        p_details: details, p_photo: photo, p_is_enrollment: isEnrollment,
      });
      const { data, error } = await request.single();
      if (error || !data) throw error;
      const saved = { ...application, ...data, child_name: values.child.trim(), birth_date: values.birth,
        schedule: values.schedule, unit: values.unit, guardian_name: values.guardian.trim(),
        guardian_relationship: values.relationship.trim(), guardian_phone: values.phone.trim() };
      const updateProfile = !application || application.child_name !== saved.child_name || application.birth_date !== saved.birth_date;
      const child = updateProfile ? { id: portal.child?.id ?? data.child_id, full_name: saved.child_name, birth_date: saved.birth_date } : portal.child;
      const nextPortal = { ...portal, child, application: saved, savedPhoto: photo, photoSaved: true,
        enrollmentDetails: { ...portal.enrollmentDetails, ...details } };
      try {
        const storage = portal.client.demo ? sessionStorage : localStorage;
        storage.removeItem(draftKey(portal));
      } catch {
        // The submitted draft is already saved by the server.
      }
      if (!portal.child) {
        const url = new URL(window.location.href);
        url.searchParams.delete('nova');
        url.searchParams.set('crianca', child.id);
        window.history.replaceState(null, '', url);
      }
      setPortal(nextPortal);
      setDraft({});
      setSent(data);
    } catch (error) {
      setSendError(error?.code === '40001' ? 'Esta ficha foi atualizada desde que você abriu a página. Recarregue a ficha para conferir os dados atuais.'
        : error?.code === 'P2001' ? ageRequirement
        : error?.code === '23505' ? 'Já existe uma criança com esse nome e data de nascimento. Abra a ficha dessa criança pelo Portal da Família.'
        : 'Não foi possível salvar a ficha. Confira os dados e tente novamente.');
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
          <h1>{isEnrollment ? 'Ficha de matrícula' : 'Ficha de pré-matrícula'} {enrollmentYear}</h1>
          <p>Educação Infantil · {school.ageRange}</p>
        </div>
        <p className="enrollment-privacy"><ShieldCheck aria-hidden="true" size={21} />
          <span>{portal.client?.demo
            ? 'Modo de teste. Use apenas dados fictícios. A pré-matrícula de teste fica nesta aba e não é enviada à escola.'
            : schoolPdf
            ? 'A Secretaria recebe os dados e a foto ao salvar. O PDF completo fica disponível na área da Secretaria.'
            : portal.user
            ? 'Ao enviar a ficha, os dados preenchidos e a foto ficam disponíveis para a Secretaria.'
            : 'Entre no Portal da Família e abra a ficha pelo cadastro da criança.'}</span>
        </p>
        <a className="button enrollment-portal-link" href="./portal.html">
          <ArrowLeft size={19} aria-hidden="true" /> Voltar ao Portal da Família
        </a>
        {portal.notice && <p role="status">{portal.notice}</p>}
        {draftError && <p role="status">{draftError}</p>}
        {isEnrollment && portal.progress?.instructions && <div className="enrollment-privacy">
          <div><strong>Orientações da Secretaria</strong><div>{portal.progress.instructions}</div></div>
        </div>}
        {!portal.loading && portal.user && <form onSubmit={download} autoComplete="off">
          {enrollmentSections.map(({ title, fields }) => (
            <fieldset key={title} className="enrollment-section" disabled={sending}>
              <legend>{title}</legend>
              {title === 'Autorização de uso de imagem' && <p>{imageConsentScope}</p>}
              <div className="enrollment-grid">
                {visibleEnrollmentFields(fields, answers).map(field => <Field key={field.name} field={field.name === 'birth' ? { ...field, ...birthRange } : field}
                  values={answers} update={update}
                  fieldStatus={field.name === 'birth' ? ageRequirement : field.name === 'cep' ? cepStatus : undefined} />)}
                {fields[0].name === 'child' &&
                  <PhotoField photo={photo} error={photoError} loading={photoLoading} onChange={changePhoto} />}
              </div>
            </fieldset>
          ))}
          {isEnrollment && <fieldset className="enrollment-section" disabled={sending}>
            <legend>Declaração do responsável</legend>
            <label className="enrollment-declaration">
              <input type="checkbox" name="declarationAccepted" required checked={values.declarationAccepted === 'Sim'}
                onChange={event => update('declarationAccepted', event.target.checked ? 'Sim' : '')} />
              <span>{enrollmentDeclaration}</span>
            </label>
          </fieldset>}
          <fieldset className="enrollment-section enrollment-submit">
            <legend>{isEnrollment ? 'Dados da matrícula' : application ? 'Atualizar pré-matrícula' : 'Enviar à secretaria'}</legend>
            <p>{isEnrollment ? 'A Secretaria recebe todos os dados da ficha para conferência.'
              : 'A Secretaria recebe os dados da pré-matrícula e a foto 3×4, se enviada.'}</p>
            <button className="button" type="button" disabled={sending || photoLoading || cepLoading} onClick={send}>
              {sending ? 'Salvando…' : isEnrollment ? 'Salvar dados da matrícula' : application ? 'Salvar alterações' : 'Enviar pré-matrícula'}
            </button>
            {sendError && <div role="alert"><p>{sendError}</p>{sendError.startsWith('Esta ficha foi atualizada') &&
              <button className="text-link" type="button" onClick={() => setReload(value => value + 1)}>Recarregar ficha</button>}</div>}
            {sent && <div role="status">
              <p>{sent.created ? 'Pré-matrícula recebida.'
                : isEnrollment ? 'Dados salvos. A confirmação da matrícula é feita pela Secretaria.' : 'Alterações salvas.'}</p>
              {sent.protocol && <>
                <p>Protocolo <strong>{sent.protocol}</strong></p>
                <a className="text-link" href="./portal.html">Acompanhar solicitação</a>
              </>}
            </div>}
          </fieldset>
          {!schoolPdf && <div className="enrollment-actions">
            <button className="button" type="submit" disabled={busy || photoLoading || sending || cepLoading}>
              <Download aria-hidden="true" size={19} /> {busy ? 'Gerando PDF…' : 'Baixar ficha em PDF'}
            </button>
            <p role="status">{status}</p>
          </div>}
        </form>}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Enrollment />);
