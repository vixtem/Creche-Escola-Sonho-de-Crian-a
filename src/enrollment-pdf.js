import {
  PDFDocument, concatTransformationMatrix, popGraphicsState, pushGraphicsState, rgb,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { sections } from './enrollment-fields.js';
import { school } from './school.js';

const width = 595.28;
const height = 841.89;
const margin = 24;
const boxWidth = width - margin * 2;
const inset = 11;
const gap = 12;
const headingHeight = 21;
const bottom = 41;
const photoWidth = 3 * 72 / 2.54;
const photoHeight = 4 * 72 / 2.54;
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

function wrap(text, font, size, width, firstWidth = width) {
  const lines = [];
  const fits = value => font.widthOfTextAtSize(value, size) <= (lines.length ? width : firstWidth);
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (fits(candidate)) {
      line = candidate;
    } else if (font.widthOfTextAtSize(word, size) <= width) {
      lines.push(line);
      line = word;
    } else {
      if (line) line += ' ';
      for (const character of word) {
        if (line && !fits(line + character)) {
          lines.push(line.trimEnd());
          line = '';
        }
        line += character;
      }
    }
  }
  lines.push(line);
  return lines;
}

export async function createEnrollmentPdf(answers, fonts, { brand, photo, sample = false } = {}) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Ficha de pré-matrícula | Sonho de Criança');
  pdf.setAuthor(school.fullName);
  pdf.setLanguage('pt-BR');
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const bold = await pdf.embedFont(fonts.bold, { subset: true });
  const supportedCharacters = new Set(regular.getCharacterSet());
  const logo = brand ? await pdf.embedPng(brand) : null;
  const portrait = photo ? await pdf.embedJpg(photo) : null;
  const page = pdf.addPage([width, height]);
  let cursor = height - margin;

  function draw(text, x, y, size, font, color) {
    page.drawText(text, { x, y, size, font, color });
  }

  function drawAnswer(text, x, y, size, widthScale) {
    if (widthScale === 1) {
      draw(text, x, y, size, regular, ink);
      return;
    }
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(widthScale, 0, 0, 1, x, y));
    draw(text, 0, 0, size, regular, ink);
    page.pushOperators(popGraphicsState());
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

  function drawHeader() {
    const headerHeight = 55;
    const headerY = cursor - headerHeight;
    const titleWidth = 218;
    const radius = 9;
    roundedBox(margin, cursor, titleWidth, headerHeight, radius, { color: navy }, { topRight: 0, bottomRight: 0 });
    horizontalRule(margin + radius, headerY + 2, titleWidth - radius, rgb(1, .87, 0), 2.5);
    roundedBox(margin, cursor, boxWidth, headerHeight, radius, { borderColor: navy, borderWidth: .8 });
    draw('Ficha de pré-matrícula', margin + 12, headerY + 21, 17.5, bold, white);
    const brandX = margin + titleWidth + 11;
    if (logo) {
      const dimensions = logo.scaleToFit(41, 35);
      page.drawImage(logo, { x: brandX, y: headerY + (headerHeight - dimensions.height) / 2, ...dimensions });
    }
    const textX = logo ? brandX + 50 : brandX;
    draw(school.fullName, textX, headerY + 32, 12, bold, navy);
    draw(`Educação Infantil · ${school.ageRange}`, textX, headerY + 15, 10.5, regular, muted);
    if (sample) draw('MODELO PREENCHIDO · DADOS FICTÍCIOS', margin, headerY - 12, 9, bold, muted);
    cursor = headerY - (sample ? 19 : 8);
  }

  function drawPhoto(top, accent) {
    const x = margin + boxWidth - inset - photoWidth;
    if (portrait) {
      page.drawImage(portrait, { x, y: top - photoHeight, width: photoWidth, height: photoHeight });
    } else {
      const label = 'Foto 3×4';
      const optional = '(opcional)';
      const center = x + photoWidth / 2;
      draw(label, center - bold.widthOfTextAtSize(label, 10) / 2, top - 52, 10, bold, accent);
      draw(optional, center - regular.widthOfTextAtSize(optional, 9) / 2, top - 67, 9, regular, muted);
    }
    roundedBox(x, top, photoWidth, photoHeight, portrait ? 0 : 7, { borderColor: accent, borderWidth: .65 });
  }

  const sectionWidth = boxWidth - 2 * inset;
  const personalWidth = sectionWidth - photoWidth - gap;
  const titles = sections.map(section => section.title);

  function answer(name) {
    const value = (answers[name] || '').normalize('NFC').trim().replace(/\s+/g, ' ');
    return Array.from(value, character => supportedCharacters.has(character.codePointAt(0))
      ? character : '\uFFFD').join('');
  }

  function statement(name) {
    const status = answer(name);
    if (!status) return 'Não informado';
    const detail = status === 'Sim' ? answer(`${name}Details`) : '';
    return detail ? `${status} · ${detail}` : status;
  }

  function buildLayout(size, rowGap, sectionGap, bodyPadding, widthScale = 1) {
    const lineHeight = size + 1.4;
    const labelSize = Math.max(9.5, size - .5);

    function row(entries, availableWidth = sectionWidth) {
      const spare = availableWidth - gap * (entries.length - 1);
      let x = margin + inset;
      const cells = entries.map(([label, value, share = 1 / entries.length]) => {
        const cellWidth = spare * share;
        const lines = wrap(value || 'Não informado', regular, size, cellWidth / widthScale);
        const labelLines = wrap(label, bold, labelSize, cellWidth);
        const cell = { labelLines, lines, x, cellWidth };
        x += cellWidth + gap;
        return cell;
      });
      const height = Math.max(...cells.map(({ labelLines, lines }) =>
        labelLines.length * (labelSize + 1) + 1 + lines.length * lineHeight));
      return { cells, height: height + rowGap };
    }

    function notes(entries) {
      return entries.map(([label, value]) => {
        const heading = `${label}: `;
        const prefixWidth = bold.widthOfTextAtSize(heading, size);
        const lines = wrap(value, regular, size, sectionWidth / widthScale, (sectionWidth - prefixWidth) / widthScale);
        return { heading, prefixWidth, lines, height: lines.length * lineHeight + rowGap };
      });
    }

    const birth = answer('birth').split('-').reverse().join('/');
    const blocks = [
      { key: 'child', rows: [
        row([['Nome completo', answer('child')]], personalWidth),
        row([['Nascimento', birth, .28], ['Idade', answer('age'), .20], ['Sexo', answer('sex'), .52]], personalWidth),
        row([['Endereço completo', answer('address')]], personalWidth),
        row([['Bairro', answer('district'), .72], ['CEP', answer('cep'), .28]], personalWidth),
      ] },
      { key: 'schedule', notes: notes([['Modalidade desejada', answer('schedule') || 'Não informado']]) },
      { key: 'guardian', rows: [
        row([['Nome completo', answer('guardian'), .63], ['Vínculo com a criança', answer('relationship'), .37]]),
        row([['Telefone com DDD', answer('phone'), .27], ['E-mail', answer('email'), .73]]),
      ] },
      { key: 'allergy', notes: notes([
        ['Alergias', statement('allergy')],
        ['Doença crônica', statement('chronic')],
        ['Uso contínuo de medicamentos', statement('medication')],
        ['Deficiência ou necessidade educacional específica', statement('disability')],
      ]) },
      { key: 'food', notes: notes([['Restrição alimentar', statement('food')]]) },
      { key: 'priorSchool', rows: [
        row([['Frequenta ou já frequentou outra escola?', statement('priorSchool')], ['Já está desfraldada?', statement('toilet')]]),
        row([['Usa chupeta?', statement('pacifier')], ['Usa mamadeira?', statement('bottle')]]),
      ] },
    ].map(block => {
      const items = block.rows ?? block.notes;
      const rowsHeight = items.reduce((total, item) => total + item.height, 0) - rowGap;
      const minHeight = block.key === 'child' ? photoHeight : 0;
      const height = headingHeight + 2 * bodyPadding + Math.max(minHeight, rowsHeight);
      return { ...block, height };
    });

    const total = blocks.reduce((sum, block) => sum + block.height, 0) + sectionGap * (blocks.length - 1);
    return { blocks, total, size, labelSize, lineHeight, sectionGap, bodyPadding, widthScale };
  }

  function drawSection(block, index, layout) {
    const palette = colors[block.key];
    const radius = 8;
    roundedBox(margin, cursor, boxWidth, headingHeight, radius, { color: palette.tint }, { bottomLeft: 0, bottomRight: 0 });
    roundedBox(margin, cursor, boxWidth, block.height, radius, { borderColor: palette.accent, borderWidth: .65 });
    roundedBox(margin + 8, cursor - 4, 13, 13, 3, { color: palette.accent });
    draw(String(index + 1), margin + 12, cursor - 14, 8.5, bold, white);
    draw(titles[index], margin + 28, cursor - 15, 12, bold, palette.accent);
    const { size, labelSize, lineHeight, bodyPadding, sectionGap, widthScale } = layout;
    let top = cursor - headingHeight - bodyPadding;
    if (block.key === 'child') drawPhoto(top, palette.accent);

    for (const row of block.rows ?? []) {
      for (const { labelLines, lines, x, cellWidth } of row.cells) {
        const labelStep = labelSize + 1;
        labelLines.forEach((label, index) => draw(label, x, top - labelSize - index * labelStep, labelSize, bold, muted));
        const y = top - labelLines.length * labelStep - 1 - size;
        lines.forEach((line, index) => drawAnswer(line, x, y - index * lineHeight, size, widthScale));
        horizontalRule(x, y - (lines.length - 1) * lineHeight - 2.7, cellWidth, rule, .4);
      }
      top -= row.height;
    }

    for (const item of block.notes ?? []) {
      const x = margin + inset;
      const y = top - size;
      draw(item.heading, x, y, size, bold, muted);
      item.lines.forEach((line, index) => {
        drawAnswer(line, index === 0 ? x + item.prefixWidth : x, y - index * lineHeight, size, widthScale);
      });
      top -= item.height;
    }
    cursor -= block.height + sectionGap;
  }

  drawHeader();
  const available = cursor - bottom;
  // Preserve the type size first. Reduce spacing before adjusting very long answers.
  const layouts = [
    [12.5, 6, 8, 8],
    [12, 5, 7, 7],
    [11.5, 5, 7, 7],
    [11, 5, 7, 7],
    [11, 3, 6, 6],
    [10.5, 3, 6, 6],
    [10, 2, 5, 5],
    [9.5, 2, 4, 4],
    [9.5, 1.5, 4, 4, .92],
    [9.5, 1.5, 4, 4, .84],
    [9.5, 1.5, 4, 4, .76],
    [9.5, 1.5, 4, 4, .70],
  ];
  let layout;
  for (const metrics of layouts) {
    layout = buildLayout(...metrics);
    if (layout.total <= available) break;
  }
  if (layout.total > available) throw new Error('O conteúdo excede o espaço disponível na ficha.');
  // Distribute unused space across all sections while preserving a gap before the footer.
  const extraPadding = Math.min(9, Math.max(0, (available - layout.total - 12) / (2 * layout.blocks.length)));
  layout.bodyPadding += extraPadding;
  layout.blocks.forEach((block, index) => {
    drawSection({ ...block, height: block.height + 2 * extraPadding }, index, layout);
  });

  horizontalRule(margin, 35, boxWidth, rule);
  draw('Pré-matrícula sujeita à confirmação da escola.', margin, 21, 9, regular, muted);
  return pdf.save();
}
