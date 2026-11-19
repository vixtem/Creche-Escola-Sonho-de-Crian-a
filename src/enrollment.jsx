import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, Download, ShieldCheck } from 'lucide-react';
import { school } from './school';
import { sections, ageOnDate } from './enrollment-fields';
import { prepareEnrollmentPhoto } from './enrollment-photo';
import { currentSchoolYear, getPortalClient } from './portal-api';
import './styles.css';
import './enrollment.css';

function Field({ field, values, update, readOnly }) {
  const { name, label, options, details, type = 'text', limit, optional, wide, autoComplete } = field;
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
          {options.map(option => <option key={option}>{option}</option>)}
        </select>
      ) : type === 'age' ? (
        <output id={id} htmlFor="enrollment-birth">{values.age || 'Calculada pela data de nascimento'}</output>
      ) : (
        <input {...props} type={type} max={type === 'date' ? localDate() : undefined}
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

function localDate() {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map(value => String(value).padStart(2, '0')).join('-');
}

function Enrollment() {
  const [values, setValues] = useState({});
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);
  const [schoolYear, setSchoolYear] = useState(currentSchoolYear);
  const [portal, setPortal] = useState({ client: null, child: null, notice: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);
  const [sendError, setSendError] = useState('');

  useEffect(() => {
    const requestedChild = new URLSearchParams(window.location.search).get('crianca');
    if (!requestedChild) return;
    let active = true;
    setPortal({ client: null, child: null, notice: 'Carregando cadastro da criança…' });
    getPortalClient().then(async client => {
      if (!client) throw new Error();
      const { data: { session }, error: sessionError } = client.demo
        ? { data: { session: client.demoSession } } : await client.auth.getSession();
      if (sessionError || !session) throw new Error();
      const { data: child, error } = await client.from('enrollment_children').select('id, full_name, birth_date')
        .eq('id', requestedChild).maybeSingle();
      if (error || !child) throw new Error();
      if (!active) return;
      setValues(current => ({ ...current, child: child.full_name, birth: child.birth_date, email: session.user.email || '' }));
      setPortal({ client, child, notice: '' });
    }).catch(() => {
      if (active) setPortal({ client: null, child: null, notice: 'Cadastro indisponível nesta sessão. Abra a ficha pelo Portal da família para enviar à escola.' });
    });
    return () => { active = false; };
  }, []);

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
    setStatus('');
  }

  const birthDate = values.birth;
  const age = birthDate ? ageOnDate(birthDate, localDate()) : null;
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

  async function send(event) {
    const form = event.currentTarget.form;
    const requiredFields = ['schedule', 'guardian', 'relationship', 'phone'];
    for (const name of requiredFields) {
      const field = form.elements.namedItem(name);
      if (!field.reportValidity()) return;
      if (!field.value.trim()) {
        field.setCustomValidity('Preencha este campo.');
        field.reportValidity();
        field.setCustomValidity('');
        return;
      }
    }
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
      const { data, error } = await portal.client.rpc('submit_enrollment', {
        p_child: portal.child.id, p_year: schoolYear, p_schedule: values.schedule,
        p_guardian_name: values.guardian.trim(), p_relationship: values.relationship.trim(),
        p_phone: values.phone.trim(),
      }).single();
      if (error || !data) throw error;
      setSent(data);
    } catch {
      setSendError('Não foi possível enviar a pré-matrícula. Confira sua sessão e tente novamente.');
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="enrollment">
      <div className="enrollment-shell">
        <a href="./" className="enrollment-back"><ArrowLeft size={18} /> Voltar ao site da escola</a>
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
            ? 'Envie a pré-matrícula à secretaria e acompanhe pelo portal. Foto e informações de saúde ficam apenas no PDF, gerado neste dispositivo. A vaga depende de confirmação pela escola.'
            : 'Preencha a ficha e baixe o PDF de uma página para apresentar à secretaria. Neste modo, os dados ficam no dispositivo.'}</span>
        </p>
        <a className="text-link enrollment-portal-link" href="./portal.html">Portal da família · cadastro e acompanhamento</a>
        {portal.notice && <p role="status">{portal.notice}</p>}
        <form onSubmit={download} autoComplete="off">
          {sections.map(({ title, fields }) => (
            <fieldset key={title} className="enrollment-section">
              <legend>{title}</legend>
              <div className="enrollment-grid">
                {fields.map(field => <Field key={field.name} field={field} values={answers} update={update}
                  readOnly={Boolean(portal.child) && ['child', 'birth'].includes(field.name)} />)}
                {fields[0].name === 'child' &&
                  <PhotoField photo={photo} error={photoError} loading={photoLoading} onChange={changePhoto} />}
              </div>
            </fieldset>
          ))}
          {portal.child && <fieldset className="enrollment-section enrollment-submit">
            <legend>{portal.client.demo ? 'Simular envio à secretaria' : 'Enviar à secretaria'}</legend>
            <div className="enrollment-field">
              <label htmlFor="enrollment-year">Ano letivo</label>
              <select id="enrollment-year" value={schoolYear} disabled={sending || Boolean(sent)}
                onChange={event => { setSchoolYear(Number(event.target.value)); setSendError(''); }}>
                {[currentSchoolYear(), currentSchoolYear()+1].map(year => <option key={year} value={year}>{year}</option>)}
              </select>
            </div>
            <p>O envio usa o cadastro da criança, o turno, o nome, o telefone e o vínculo do responsável, além do e-mail da conta.</p>
            {!sent && <button className="button" type="button" disabled={sending} onClick={send}>
              {sending ? 'Enviando…' : portal.client.demo ? 'Enviar pré-matrícula de teste' : 'Enviar pré-matrícula'}
            </button>}
            {sendError && <p role="alert">{sendError}</p>}
            {sent && <div role="status">
              <p>{sent.created ? (portal.client.demo ? 'Pré-matrícula de teste registrada nesta aba.' : 'Pré-matrícula recebida.') : 'Já existe uma solicitação para esta criança neste ano letivo.'}</p>
              <p>Protocolo <strong>{sent.protocol}</strong></p>
              <a className="text-link" href="./portal.html">Acompanhar solicitação</a>
            </div>}
          </fieldset>}
          <div className="enrollment-actions">
            <button className="button" type="submit" disabled={busy || photoLoading}>
              <Download aria-hidden="true" size={19} /> {busy ? 'Gerando PDF…' : 'Baixar ficha em PDF'}
            </button>
            <p role="status">{status}</p>
          </div>
        </form>
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<Enrollment />);
