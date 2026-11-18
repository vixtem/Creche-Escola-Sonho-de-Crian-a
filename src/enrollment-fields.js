const yesNo = ['Sim', 'Não'];

export const sections = [
  {
    title: 'Dados da criança',
    fields: [
      { name: 'child', label: 'Nome completo da criança', limit: 120, wide: true },
      { name: 'birth', label: 'Data de nascimento', type: 'date' },
      { name: 'age', label: 'Idade', type: 'age' },
      { name: 'sex', label: 'Sexo', options: ['Feminino', 'Masculino', 'Prefiro não informar'] },
      { name: 'cep', label: 'CEP', limit: 9, optional: true, autoComplete: 'section-crianca postal-code' },
      { name: 'address', label: 'Endereço completo (rua, número, complemento e cidade)', limit: 180, wide: true },
      { name: 'district', label: 'Bairro', limit: 80, wide: true },
    ],
  },
  {
    title: 'Modalidade de atendimento',
    fields: [
      { name: 'schedule', label: 'Modalidade desejada', options: ['Tempo Parcial (Matutino)', 'Tempo Parcial (Vespertino)', 'Tempo Integral'], wide: true },
    ],
  },
  {
    title: 'Dados do responsável legal',
    fields: [
      { name: 'guardian', label: 'Nome completo do responsável', limit: 120, wide: true, autoComplete: 'section-responsavel name' },
      { name: 'relationship', label: 'Parentesco ou vínculo com a criança', limit: 80 },
      { name: 'phone', label: 'Telefone com DDD', type: 'tel', limit: 24, autoComplete: 'section-responsavel tel' },
      { name: 'email', label: 'E-mail', type: 'email', limit: 120, optional: true, wide: true, autoComplete: 'section-responsavel email' },
    ],
  },
  {
    title: 'Informações de saúde',
    fields: [
      { name: 'allergy', label: 'A criança possui alguma alergia?', options: yesNo, details: 'Qual alergia?' },
      { name: 'chronic', label: 'Possui alguma doença crônica?', options: yesNo, details: 'Qual doença crônica?' },
      { name: 'medication', label: 'Faz uso contínuo de medicamentos?', options: yesNo, details: 'Qual medicamento?' },
      { name: 'disability', label: 'Possui deficiência ou necessidade educacional específica?', options: yesNo, details: 'Qual deficiência ou necessidade?' },
    ],
  },
  {
    title: 'Alimentação',
    fields: [
      { name: 'food', label: 'Possui restrição alimentar?', options: yesNo, details: 'Quais alimentos não pode consumir?', wide: true },
    ],
  },
  {
    title: 'Desenvolvimento',
    fields: [
      { name: 'priorSchool', label: 'Já frequenta ou frequentou outra escola?', options: yesNo },
      { name: 'toilet', label: 'Está desfraldada?', options: ['Sim', 'Não', 'Em processo'] },
      { name: 'pacifier', label: 'Faz uso de chupeta?', options: yesNo },
      { name: 'bottle', label: 'Usa mamadeira?', options: yesNo },
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
