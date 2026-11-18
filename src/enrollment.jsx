import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, Download, ShieldCheck } from 'lucide-react';
import { school } from './school';
import { sections, ageOnDate } from './enrollment-fields';
import { prepareEnrollmentPhoto } from './enrollment-photo';
import './styles.css';
import './enrollment.css';

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

  return (
    <main className="enrollment">
      <div className="enrollment-shell">
        <a href="./" className="enrollment-back"><ArrowLeft size={18} /> Voltar ao site da escola</a>
        <div className="enrollment-intro">
          <svg className="enrollment-logo" viewBox="400 65 740 510" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
            <image href={`${import.meta.env.BASE_URL}images/marca.webp`} width="1536" height="1024" />
          </svg>
          <p className="enrollment-school">{school.fullName}</p>
          <h1>Ficha de pré-matrícula</h1>
          <p>Educação Infantil · {school.ageRange}</p>
        </div>
        <p className="enrollment-privacy"><ShieldCheck aria-hidden="true" size={21} />
          <span>Preencha a ficha e baixe o PDF de uma página para apresentar à secretaria. Os dados ficam neste dispositivo e a vaga depende de confirmação pela escola.</span>
        </p>
        <form onSubmit={download} autoComplete="off">
          {sections.map(({ title, fields }) => (
            <fieldset key={title} className="enrollment-section">
              <legend>{title}</legend>
              <div className="enrollment-grid">
                {fields.map(field => <Field key={field.name} field={field} values={answers} update={update} />)}
                {fields[0].name === 'child' &&
                  <PhotoField photo={photo} error={photoError} loading={photoLoading} onChange={changePhoto} />}
              </div>
            </fieldset>
          ))}
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
