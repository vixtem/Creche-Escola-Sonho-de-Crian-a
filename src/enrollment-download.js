import regularUrl from '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url';
import boldUrl from '@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff?url';
import { createEnrollmentPdf } from './enrollment-pdf';

async function loadFont(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Não foi possível carregar a fonte do PDF.');
  return response.arrayBuffer();
}

export async function downloadEnrollmentPdf(answers) {
  const [regular, bold] = await Promise.all([loadFont(regularUrl), loadFont(boldUrl)]);
  const bytes = await createEnrollmentPdf(answers, { regular, bold });
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ficha-pre-matricula-sonho-de-crianca.pdf';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
