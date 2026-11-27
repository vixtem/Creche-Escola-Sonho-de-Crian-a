import React from 'react';
import { dateInSchool } from './portal-api';

export function Field({ field, values, update, fieldStatus }) {
  const { name, label, options, type = 'text', limit, optional, wide, autoComplete, readOnly, min, max } = field;
  const value = values[name] || '';
  const id = `enrollment-${name}`;
  const props = {
    id, name, value, autoComplete, required: !optional, maxLength: limit, readOnly,
    onChange: (event) => update(name, event.currentTarget.value),
  };

  return (
    <div className={`enrollment-field${wide ? ' enrollment-wide' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {options ? (
        <select {...props}>
          <option value="" disabled>Selecione</option>
          {(Array.isArray(options) ? options.map(option => [option, option]) : Object.entries(options))
            .map(([key, text]) => <option key={key} value={key}>{text}</option>)}
        </select>
      ) : type === 'age' ? (
        <output id={id} htmlFor="enrollment-birth">{values.age || 'Calculada pela data de nascimento'}</output>
      ) : type === 'textarea' ? (
        <textarea {...props} rows={3} />
      ) : (
        <input {...props} type={type} min={min ?? (type === 'date' ? '1900-01-01' : undefined)}
          max={max ?? (type === 'date' ? dateInSchool() : undefined)}
          pattern={name === 'cep' ? '[0-9]{5}(?:-| )?[0-9]{3}' : undefined}
          inputMode={name === 'cep' ? 'numeric' : undefined}
          placeholder={name === 'cep' ? '00000-000' : undefined}
          aria-describedby={fieldStatus === undefined ? undefined : `${id}-status`} />
      )}
      {fieldStatus !== undefined && <p className="enrollment-field-status" id={`${id}-status`} role="status">{fieldStatus}</p>}
    </div>
  );
}

export function PhotoField({ photo, error, loading, onChange }) {
  return (
    <div className="enrollment-field enrollment-wide enrollment-photo">
      <div>
        <label htmlFor="enrollment-photo">Foto 3×4 da criança</label>
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
