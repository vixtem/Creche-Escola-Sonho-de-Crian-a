import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { sections } from './enrollment-fields.js';
import { school } from './school.js';

const width = 595.28;
const height = 841.89;
const margin = 44;
const contentWidth = width - 2 * margin;
const navy = rgb(.03, .13, .45);
const teal = rgb(0, .43, .40);
const lightTeal = rgb(.91, .97, .96);
const yellow = rgb(1, .87, 0);
const ink = rgb(.14, .21, .32);
const gray = rgb(.31, .37, .45);

function wrap(text, font, size, maxWidth) {
  const lines = [];
  const fits = value => font.widthOfTextAtSize(value, size) <= maxWidth;
  let line = '';
  for (const word of text.normalize('NFC').trim().split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (fits(candidate)) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const character of word) {
      if (line && !fits(line + character)) {
        lines.push(line);
        line = '';
      }
      line += character;
    }
  }
  lines.push(line);
  return lines;
}

export async function createEnrollmentPdf(answers, fonts) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Ficha de pré-matrícula | Sonho de Criança');
  pdf.setAuthor(school.fullName);
  pdf.setLanguage('pt-BR');
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const bold = await pdf.embedFont(fonts.bold, { subset: true });
  let page;
  let cursor;

  function draw(text, x, y, size, font, color) {
    page.drawText(text, { x, y, size, font, color });
  }

  function nextPage() {
    page = pdf.addPage([width, height]);
    page.drawRectangle({ x: 0, y: height - 10, width, height: 10, color: yellow });
    draw(school.fullName, margin, height - 48, 12, bold, teal);
    draw('Ficha de pré-matrícula', margin, height - 82, 28, bold, navy);
    draw(`Educação Infantil | ${school.ageRange}`, margin, height - 103, 11, regular, gray);
    cursor = height - 131;
  }

  function sectionTitle(title) {
    page.drawRectangle({ x: margin, y: cursor - 24, width: contentWidth, height: 24, color: lightTeal });
    draw(title, margin + 10, cursor - 16, 11, bold, navy);
    cursor -= 36;
  }

  function fieldHeight(label, value, fieldWidth) {
    return wrap(label, bold, 9, fieldWidth).length * 12
      + wrap(value, regular, 11, fieldWidth).length * 14 + 12;
  }

  function field(label, value, x, fieldWidth) {
    let y = cursor;
    for (const line of wrap(label, bold, 9, fieldWidth)) {
      draw(line, x, y - 9, 9, bold, gray);
      y -= 12;
    }
    for (const line of wrap(value, regular, 11, fieldWidth)) {
      draw(line, x, y - 10, 11, regular, ink);
      y -= 14;
    }
  }

  nextPage();
  for (const { title, fields } of sections) {
    const rows = [];
    for (const item of fields) {
      let value = (answers[item.name] || '').trim() || 'Não informado';
      if (item.type === 'date' && answers[item.name]) value = value.split('-').reverse().join('/');
      const entry = [item.label, value];
      const previous = rows.at(-1);
      if (!item.wide && previous?.canPair && previous.entries.length === 1) {
        previous.entries.push(entry);
      } else {
        rows.push({ entries: [entry], canPair: !item.wide });
      }
      if (item.details && value === 'Sim') {
        rows.push({ entries: [[item.details, (answers[`${item.name}Details`] || '').trim() || 'Não informado']] });
      }
    }
    if (title === 'Informações de saúde') nextPage();
    const gap = 18;
    const rowWidth = row => row.canPair ? (contentWidth - gap) / 2 : contentWidth;
    const rowHeight = row => Math.max(...row.entries.map(([label, value]) => fieldHeight(label, value, rowWidth(row))));

    if (cursor - 36 - rowHeight(rows[0]) < 64) nextPage();
    sectionTitle(title);
    for (const row of rows) {
      const needed = rowHeight(row);
      if (cursor - needed < 64) {
        nextPage();
        sectionTitle(`${title} (continuação)`);
      }
      row.entries.forEach(([label, value], index) => field(label, value, margin + index * (rowWidth(row) + gap), rowWidth(row)));
      cursor -= needed;
    }
    cursor -= 6;
  }

  const pages = pdf.getPages();
  pages.forEach((currentPage, index) => {
    page = currentPage;
    page.drawLine({ start: { x: margin, y: 51 }, end: { x: width - margin, y: 51 }, thickness: .6, color: teal });
    draw('Pré-matrícula sujeita à confirmação da escola.', margin, 35, 9, regular, gray);
    const number = `${index + 1} / ${pages.length}`;
    draw(number, width - margin - regular.widthOfTextAtSize(number, 9), 35, 9, regular, gray);
  });
  return pdf.save();
}
