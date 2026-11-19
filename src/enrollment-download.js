import regularUrl from '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url';
import boldUrl from '@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff?url';
import { createEnrollmentPdf } from './enrollment-pdf';
import { enrollmentYear } from './enrollment-fields';

async function loadAsset(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Não foi possível carregar os recursos do PDF.');
  return response.arrayBuffer();
}

export async function downloadEnrollmentPdf(answers, photo) {
  const brandUrl = `${import.meta.env.BASE_URL}images/marca-cesc.png`;
  const [regular, bold, brand] = await Promise.all([
    loadAsset(regularUrl),
    loadAsset(boldUrl),
    loadAsset(brandUrl).catch(() => undefined),
  ]);
  const bytes = await createEnrollmentPdf(answers, { regular, bold }, { brand, photo });
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  const childName = answers.child.normalize('NFC').replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  link.download = `pre-matricula_${childName || 'crianca'}_${enrollmentYear}.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
