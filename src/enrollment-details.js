const yesNo = ['Sim', 'Não'];
export const imageConsentScope = 'A autorização vale para fotos e vídeos da criança no grupo dos pais e no Instagram da escola (@crecheescolasonhodecrianca2021).';
export const enrollmentDeclaration = 'Confirmo que sou responsável pelas informações prestadas e estou ciente de que a matrícula será formalizada após a assinatura da ficha e de seus anexos ou termos aditivos.';
const text = (name, label, extra = {}) => ({ name, label, limit: 120, optional: true, ...extra });
const healthQuestion = (name, label, detailLabel = 'Qual?') => [
  text(name, label, { options: yesNo }),
  text(name + 'Detail', detailLabel, { wide: true, limit: 400, when: [name, 'Sim'] }),
];

export const enrollmentDetailsSections = [
  {
    title: 'Dados da criança',
    base: 'child',
    fields: [
      text('studentDocument', 'CPF ou RG da criança', { limit: 32 }),
      text('birthCertificate', 'Número da certidão de nascimento', { limit: 50 }),
      text('birthplace', 'Naturalidade'),
      text('birthState', 'Estado', { limit: 40 }),
      text('nationality', 'Nacionalidade'),
      text('addressBlock', 'Quadra', { limit: 30 }),
      text('residesWith', 'A criança reside com', { options: ['Pais', 'Mãe', 'Pai', 'Outros'] }),
      text('otherResident', 'Com quem a criança reside?', { when: ['residesWith', 'Outros'], wide: true }),
      text('sus', 'Número do cartão SUS', { limit: 25 }),
      text('studentNis', 'NIS da criança', { limit: 20 }),
    ],
  },
  {
    title: 'Informações de saúde da criança',
    fields: [
      ...healthQuestion('foodAllergy', 'Alergia a algum alimento?', 'Qual alimento?'),
      ...healthQuestion('medicineAllergy', 'Alergia a algum medicamento?', 'Qual medicamento causa alergia?'),
      text('otherAllergies', 'Outras alergias', { type: 'textarea', wide: true, limit: 400 }),
      ...healthQuestion('healthCondition', 'Tem algum problema de saúde?', 'Qual problema de saúde?'),
      ...healthQuestion('medicalReport', 'Tem laudo?', 'Observações sobre o laudo'),
      ...healthQuestion('treatment', 'Faz algum tratamento médico?', 'Qual tratamento?'),
      ...healthQuestion('medication', 'Faz uso de algum medicamento?', 'Qual medicamento utiliza?'),
      ...healthQuestion('disability', 'Possui algum tipo de deficiência?', 'Qual deficiência?'),
      text('feverMedication', 'Em caso de febre, qual remédio costuma tomar?', { wide: true, limit: 240 }),
    ],
  },
  {
    title: 'Horário das aulas',
    fields: [
      text('arrival', 'Entrada', { readOnly: true }),
      text('departure', 'Saída', { readOnly: true }),
    ],
  },
  {
    title: 'Dados do responsável legal',
    base: 'guardian',
    fields: [
      text('guardianNis', 'NIS do responsável', { limit: 20 }),
      text('motherName', 'Nome da mãe', { wide: true }),
      text('motherJob', 'Profissão da mãe'),
      text('motherContact', 'Contato da mãe', { type: 'tel', limit: 30 }),
      text('motherReligion', 'Religião da mãe'),
      text('fatherName', 'Nome do pai', { wide: true }),
      text('fatherJob', 'Profissão do pai'),
      text('fatherContact', 'Contato do pai', { type: 'tel', limit: 30 }),
      text('fatherReligion', 'Religião do pai'),
      text('householdSize', 'Quantas pessoas moram com a criança?', { type: 'number', min: 1, max: 99 }),
      text('guardianJob', 'Ocupação do responsável'),
      text('guardianReligion', 'Religião do responsável'),
      text('observations', 'Observações', { type: 'textarea', wide: true, limit: 1000 }),
    ],
  },
  {
    title: 'Autorização de uso de imagem',
    fields: [
      text('imageConsent', 'Autoriza o uso de imagem da criança?', { options: ['Sim', 'Não'], optional: false, wide: true }),
      text('consentName', 'Nome de quem autoriza', { optional: false, when: ['imageConsent', 'Sim'] }),
      text('consentCpf', 'CPF de quem autoriza', { limit: 14, optional: false, when: ['imageConsent', 'Sim'] }),
    ],
  },
];

export const enrollmentAddressFields = [
  ['sex', 'Sexo'], ['address', 'Endereço completo'], ['cep', 'CEP'], ['district', 'Bairro'],
];

export const staffEnrollmentSections = [
  { ...enrollmentDetailsSections[0], fields: [
    text('sex', 'Sexo', { options: ['Feminino', 'Masculino', 'Prefiro não informar'] }),
    text('address', 'Endereço completo', { limit: 180, wide: true }),
    text('cep', 'CEP', { limit: 9 }),
    text('district', 'Bairro', { limit: 80 }),
    ...enrollmentDetailsSections[0].fields,
  ] },
  ...enrollmentDetailsSections.slice(1),
  { title: 'Formalização da matrícula', fields: [
    text('registration_date', 'Data da matrícula', { type: 'date' }),
    text('grade', 'Série ou turma', { limit: 80 }),
    text('declarationAccepted', 'Ciência da declaração registrada', { options: yesNo }),
  ] },
];

export function visibleEnrollmentFields(fields, values) {
  return fields.filter(({ when }) => !when || values[when[0]] === when[1]);
}

const classHours = {
  'Tempo Parcial (Matutino)': { arrival: '07:00', departure: '12:00' },
  'Tempo Parcial (Vespertino)': { arrival: '13:00', departure: '17:00' },
  'Tempo Integral': { arrival: '07:00', departure: '17:00' },
};

export function enrollmentHours(schedule) {
  return classHours[schedule] ?? { arrival: '', departure: '' };
}

export function combineLegacyAddress(details = {}) {
  const { addressNumber, ...fields } = details;
  const number = addressNumber?.trim();
  if (!number) return fields;
  const address = fields.address?.trim() || '';
  const tokens = address.match(/[\p{L}\p{N}]+/gu) ?? [];
  const numberTokens = number.match(/[\p{L}\p{N}]+/gu)?.join(' ');
  if (numberTokens && ` ${tokens.join(' ').toLowerCase()} `.includes(` ${numberTokens.toLowerCase()} `)) return fields;
  return { ...fields, address: [address, `nº ${number}`].filter(Boolean).join(', ') };
}
