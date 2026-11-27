export const enrollmentYear = 2027;

export function enrollmentBirthRange(year = enrollmentYear, previousBirth) {
  const min = `${year - 5}-01-01`;
  const max = `${year - 2}-12-31`;
  return {
    min: previousBirth && previousBirth < min ? previousBirth : min,
    max: previousBirth && previousBirth > max ? previousBirth : max,
  };
}

export function isEnrollmentBirthDate(birth, year = enrollmentYear, previousBirth) {
  if (!birth) return false;
  const { min, max } = enrollmentBirthRange(year);
  return birth === previousBirth || (birth >= min && birth <= max);
}

export function enrollmentAgeRequirement(year = enrollmentYear) {
  return `Para o ano letivo de ${year}, a criança precisa completar de 2 a 5 anos durante o ano.`;
}
export const childSexOptions = ['Feminino', 'Masculino'];

export const studyModes = {
  'Tempo Parcial (Matutino)': 'Manhã',
  'Tempo Parcial (Vespertino)': 'Tarde',
  'Tempo Integral': 'Integral',
};

export const schoolUnits = {
  'jardim-eldorado': 'Jardim Eldorado (Chácara Brasil)',
  'parque-vitoria': 'Parque Vitória (Turu)',
};

export const sections = [
  {
    title: 'Dados da criança',
    fields: [
      { name: 'child', label: 'Nome completo da criança', limit: 120, wide: true },
      { name: 'birth', label: 'Data de nascimento', type: 'date' },
      { name: 'age', label: `Idade no fim de ${enrollmentYear}`, type: 'age' },
      { name: 'sex', label: 'Sexo', options: childSexOptions },
      { name: 'cep', label: 'CEP', limit: 9, optional: true, autoComplete: 'section-crianca postal-code' },
      { name: 'address', label: 'Endereço completo', limit: 180, wide: true },
      { name: 'district', label: 'Bairro', limit: 80, wide: true },
    ],
  },
  {
    title: 'Modalidade de estudo',
    fields: [
      { name: 'schedule', label: 'Modalidade de estudo', options: studyModes, wide: true },
    ],
  },
  {
    title: 'Dados do responsável legal',
    fields: [
      { name: 'guardian', label: 'Nome completo do responsável', limit: 120, wide: true, autoComplete: 'section-responsavel name' },
      { name: 'relationship', label: 'Parentesco ou vínculo com a criança', limit: 80 },
      { name: 'phone', label: 'Telefone com DDD', type: 'tel', limit: 24, autoComplete: 'section-responsavel tel' },
      { name: 'email', label: 'E-mail da conta', type: 'email', readOnly: true, wide: true },
    ],
  },
  {
    title: 'Unidade da escola',
    fields: [
      { name: 'unit', label: 'Escolha a unidade', options: schoolUnits, wide: true },
    ],
  },
];

export function ageOnDate(birth, today) {
  const [year, month, day] = birth.split('-').map(Number);
  const [currentYear, currentMonth, currentDay] = today.split('-').map(Number);
  if (birth > today || !year || !month || !day) return null;
  const beforeBirthday = currentMonth < month || (currentMonth === month && currentDay < day);
  return currentYear - year - Number(beforeBirthday);
}
