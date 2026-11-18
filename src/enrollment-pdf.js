import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { sections } from './enrollment-fields.js';
import { school } from './school.js';

const width = 595.28;
const height = 841.89;
const margin = 40;
const boxWidth = width - margin * 2;
const inset = 14;
const gap = 18;
const headingHeight = 29;
const bottom = 62;
const navy = rgb(.03, .13, .45);
const white = rgb(1, 1, 1);
const ink = rgb(.13, .20, .30);
const muted = rgb(.31, .37, .45);
const rule = rgb(.77, .81, .86);

const colors = {
  child: { accent: rgb(.61, .15, .28), tint: rgb(1, .93, .95) },
  schedule: { accent: rgb(.02, .38, .62), tint: rgb(.91, .96, 1) },
  guardian: { accent: rgb(.53, .32, .05), tint: rgb(1, .96, .85) },
  allergy: { accent: rgb(.03, .42, .37), tint: rgb(.88, .97, .95) },
  food: { accent: rgb(.29, .42, .08), tint: rgb(.94, .97, .87) },
  priorSchool: { accent: rgb(.36, .24, .57), tint: rgb(.95, .92, .99) },
};

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

function groupFields(fields, answers) {
  const rows = [];
  for (const item of fields) {
    let value = (answers[item.name] || '').trim();
    if (item.type === 'date' && value) value = value.split('-').reverse().join('/');
    const entry = { label: item.label, value, options: item.options };
    const previous = rows.at(-1);
    if (!item.wide && previous?.canPair && previous.entries.length === 1) {
      previous.entries.push(entry);
    } else {
      rows.push({ entries: [entry], canPair: !item.wide });
    }
    if (item.details && value === 'Sim') {
      rows.push({ entries: [{ label: item.details, value: (answers[`${item.name}Details`] || '').trim() }] });
    }
  }
  return rows;
}

export async function createEnrollmentPdf(answers, fonts, { brand, sample = false } = {}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Ficha de pré-matrícula | Sonho de Criança');
  pdf.setAuthor(school.fullName);
  pdf.setLanguage('pt-BR');
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const bold = await pdf.embedFont(fonts.bold, { subset: true });
  const logo = brand ? await pdf.embedPng(brand) : null;
  let page;
  let cursor;

  function draw(text, x, y, size, font, color) {
    page.drawText(text, { x, y, size, font, color });
  }

  function horizontalRule(x, y, lineWidth, color, thickness = .55) {
    page.drawLine({ start: { x, y }, end: { x: x + lineWidth, y }, thickness, color });
  }

  function roundedBox(x, top, boxWidth, boxHeight, radius, style, corners = {}) {
    const { topRight = radius, bottomRight = radius, bottomLeft = radius } = corners;
    const path = [
      `M ${radius} 0 H ${boxWidth - topRight} Q ${boxWidth} 0 ${boxWidth} ${topRight}`,
      `V ${boxHeight - bottomRight} Q ${boxWidth} ${boxHeight} ${boxWidth - bottomRight} ${boxHeight}`,
      `H ${bottomLeft} Q 0 ${boxHeight} 0 ${boxHeight - bottomLeft}`,
      `V ${radius} Q 0 0 ${radius} 0 Z`,
    ].join(' ');
    page.drawSvgPath(path, { x, y: top, ...style });
  }

  function nextPage() {
    page = pdf.addPage([width, height]);
    cursor = height - margin;
    if (pdf.getPageCount() > 1) return;

    const headerHeight = 73;
    const headerY = cursor - headerHeight;
    const titleWidth = 205;
    const radius = 10;
    roundedBox(margin, cursor, titleWidth, headerHeight, radius, { color: navy }, { topRight: 0, bottomRight: 0 });
    horizontalRule(margin + radius, headerY + 2.5, titleWidth - radius, rgb(1, .87, 0), 3);
    roundedBox(margin, cursor, boxWidth, headerHeight, radius, { borderColor: navy, borderWidth: .8 });
    draw('FICHA DE', margin + 16, headerY + 47, 11, bold, white);
    draw('Pré-matrícula', margin + 16, headerY + 21, 23, bold, white);
    const brandX = margin + titleWidth + 19;
    if (logo) {
      const dimensions = logo.scaleToFit(48, 43);
      page.drawImage(logo, { x: brandX, y: headerY + (73 - dimensions.height) / 2, ...dimensions });
    }
    const textX = logo ? brandX + 57 : brandX;
    draw(school.fullName, textX, headerY + 41, 12, bold, navy);
    draw(`Educação Infantil · ${school.ageRange}`, textX, headerY + 23, 10, regular, muted);
    if (sample) draw('MODELO PREENCHIDO · DADOS FICTÍCIOS', margin, headerY - 18, 8, bold, muted);
    cursor = headerY - (sample ? 31 : 19);
  }

  function planOptions(entry, fieldWidth) {
    let x = 0;
    let row = 0;
    const options = entry.options.map(label => {
      const optionWidth = 14 + regular.widthOfTextAtSize(label, 9.5);
      if (x > 0 && x + optionWidth > fieldWidth) {
        x = 0;
        row += 1;
      }
      const option = { label, x, row, selected: entry.value === label };
      x += optionWidth + 13;
      return option;
    });
    return { options, height: (row + 1) * 19 };
  }

  function planField(entry, fieldWidth) {
    const labels = wrap(entry.label, bold, 9, fieldWidth);
    const labelHeight = labels.length * 13;
    if (entry.options) {
      const choices = planOptions(entry, fieldWidth);
      return { labels, labelHeight, options: choices.options, height: labelHeight + choices.height + 9 };
    }
    const values = wrap(entry.value || 'Não informado', regular, 11, fieldWidth);
    return { labels, labelHeight, values, height: labelHeight + values.length * 19 + 9 };
  }

  function drawField(field, x, y, fieldWidth, accent) {
    field.labels.forEach((line, index) => draw(line, x, y - 9 - index * 13, 9, bold, muted));
    const answerTop = y - field.labelHeight;
    if (field.options) {
      for (const option of field.options) {
        const boxX = x + option.x;
        const optionY = answerTop - 13 - option.row * 19;
        roundedBox(boxX, optionY + 8, 9, 9, 1.6, {
          borderColor: accent, borderWidth: .8, color: option.selected ? accent : white,
        });
        if (option.selected) {
          const start = { x: boxX + 2, y: optionY + 3 };
          const middle = { x: boxX + 4, y: optionY + 1.5 };
          const end = { x: boxX + 7.2, y: optionY + 5.5 };
          page.drawLine({ start, end: middle, color: white, thickness: 1 });
          page.drawLine({ start: middle, end, color: white, thickness: 1 });
        }
        draw(option.label, boxX + 14, optionY, 9.5, regular, ink);
      }
      return;
    }

    field.values.forEach((value, index) => {
      const baseline = answerTop - 13 - index * 19;
      draw(value, x, baseline, 11, regular, ink);
      horizontalRule(x, baseline - 4, fieldWidth, rule);
    });
  }

  function drawSection(title, palette, rows, sectionNumber) {
    const bodyHeight = rows.reduce((total, row) => total + row.height, 0);
    const sectionHeight = headingHeight + 19 + bodyHeight;
    const radius = 9;
    roundedBox(margin, cursor, boxWidth, headingHeight, radius, { color: palette.tint }, { bottomLeft: 0, bottomRight: 0 });
    roundedBox(margin, cursor, boxWidth, sectionHeight, radius, { borderColor: palette.accent, borderWidth: .65 });
    roundedBox(margin + 9, cursor - 6, 15, 15, 3, { color: palette.accent });
    draw(String(sectionNumber), margin + 13.5, cursor - 17, 9, bold, white);
    draw(title, margin + 32, cursor - 18, 11, bold, palette.accent);
    let rowY = cursor - headingHeight - 13;
    for (const row of rows) {
      row.fields.forEach((field, index) => {
        drawField(field, margin + inset + index * (row.fieldWidth + gap), rowY, row.fieldWidth, palette.accent);
      });
      rowY -= row.height;
    }
    cursor -= sectionHeight + 14;
  }

  nextPage();
  for (const [index, { title, fields }] of sections.entries()) {
    if (fields[0].name === 'allergy') nextPage();
    const palette = colors[fields[0].name];
    const rows = groupFields(fields, answers).map(row => {
      const fullWidth = boxWidth - 2 * inset;
      const fieldWidth = row.canPair ? (fullWidth - gap) / 2 : fullWidth;
      const plannedFields = row.entries.map(entry => planField(entry, fieldWidth));
      return { fieldWidth, fields: plannedFields, height: Math.max(...plannedFields.map(field => field.height)) };
    });

    let from = 0;
    while (from < rows.length) {
      let end = from;
      let available = cursor - bottom - headingHeight - 19;
      while (end < rows.length && rows[end].height <= available) {
        available -= rows[end].height;
        end += 1;
      }
      if (end === from) {
        nextPage();
        continue;
      }
      drawSection(from === 0 ? title : `${title} (continuação)`, palette, rows.slice(from, end), index + 1);
      from = end;
      if (from < rows.length) nextPage();
    }
  }

  const pages = pdf.getPages();
  pages.forEach((currentPage, index) => {
    page = currentPage;
    horizontalRule(margin, 51, boxWidth, rule);
    draw('Pré-matrícula sujeita à confirmação da escola.', margin, 35, 9, regular, muted);
    const number = `Página ${index + 1} de ${pages.length}`;
    draw(number, width - margin - regular.widthOfTextAtSize(number, 9), 35, 9, regular, muted);
  });
  return pdf.save();
}
