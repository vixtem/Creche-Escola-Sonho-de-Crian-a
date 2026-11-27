export function formatCep(value) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export async function lookupCepAddress(cep, signal) {
  const digits = cep.replace(/\D/g, '');
  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
    signal,
    referrerPolicy: 'no-referrer',
  });
  if (!response.ok) throw new Error('Falha na consulta de CEP.');

  const data = await response.json();
  if (data.erro) return null;
  const street = data.logradouro?.trim();
  const district = data.bairro?.trim();
  const cityAndState = [data.localidade?.trim(), data.uf?.trim()].filter(Boolean).join(' - ');

  return {
    address: [street, cityAndState].filter(Boolean).join(', '),
    district,
    partial: !street || !district,
  };
}
