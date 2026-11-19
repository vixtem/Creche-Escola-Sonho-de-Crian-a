import regularUrl from '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url';
import boldUrl from '@fontsource/noto-sans/files/noto-sans-latin-700-normal.woff?url';
import { createEnrollmentPdf, createSchoolEnrollmentPdf } from './enrollment-pdf';
import { enrollmentYear } from './enrollment-fields';

async function loadAsset(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Não foi possível carregar os recursos do PDF.');
  return response.arrayBuffer();
}

async function loadPdfAssets() {
  const brandUrl = `${import.meta.env.BASE_URL}images/marca-cesc.png`;
  const [regular, bold, brand] = await Promise.all([
    loadAsset(regularUrl),
    loadAsset(boldUrl),
    loadAsset(brandUrl).catch(() => undefined),
  ]);
  return { fonts: { regular, bold }, brand };
}

function download(bytes, prefix, name, year) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const link = document.createElement('a');
  link.href = url;
  const childName = name.normalize('NFC').replace(/[^\p{L}\p{M}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  link.download = `${prefix}_${childName || 'crianca'}_${year}.pdf`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadEnrollmentPdf(answers, photo) {
  const { fonts, brand } = await loadPdfAssets();
  const bytes = await createEnrollmentPdf(answers, fonts, { brand, photo });
  download(bytes, 'pre-matricula', answers.child, enrollmentYear);
}

export async function downloadSchoolEnrollmentPdf(item, record) {
  const { fonts, brand } = await loadPdfAssets();
  const bytes = await createSchoolEnrollmentPdf(item, record, fonts, brand);
  download(bytes, 'matricula', item.child_name, item.school_year);
}
