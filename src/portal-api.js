export const states = {
  received: 'Recebida',
  review: 'Em análise',
  documents: 'Documentos pendentes',
  waitlist: 'Lista de espera',
  approved: 'Aprovada',
  declined: 'Não aprovada',
  enrolled: 'Matriculada',
};

export const transitions = {
  received: ['review', 'documents', 'waitlist', 'approved', 'declined'],
  review: ['documents', 'waitlist', 'approved', 'declined'],
  documents: ['review', 'waitlist', 'approved', 'declined'],
  waitlist: ['review', 'documents', 'approved', 'declined'],
  approved: ['review', 'documents', 'enrolled', 'declined'],
  declined: ['review'],
  enrolled: [],
};

export const dateInSchool = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Fortaleza' }).format(new Date());
export const currentSchoolYear = () => Number(dateInSchool().slice(0, 4));
export const formatDate = value => value?.slice(0, 10).split('-').reverse().join('/');

let clientPromise;
export function getPortalClient() {
  clientPromise ??= (async () => {
    const response = await fetch(`${import.meta.env.BASE_URL}enrollment-config.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Falha ao carregar a configuração do portal.');
    const { url, publishableKey, enabled } = await response.json();
    if (enabled !== true) return null;
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)
      || !/^sb_publishable_[a-zA-Z0-9_-]+$/.test(publishableKey)) {
      throw new Error('O portal precisa de uma configuração válida.');
    }
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(url, publishableKey, { auth: { storageKey: 'cesc-enrollment-session' } });
  })();
  return clientPromise;
}

export async function allRows(query) {
  const results = [];
  const pageSize = 100;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query().range(from, from + pageSize - 1);
    if (error) throw error;
    results.push(...data);
    if (data.length < pageSize) return results;
  }
}
