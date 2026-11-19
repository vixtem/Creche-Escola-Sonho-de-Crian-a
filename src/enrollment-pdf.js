import {
  PDFDocument, concatTransformationMatrix, popGraphicsState, pushGraphicsState, rgb,
} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { ageOnDate, enrollmentYear, schoolUnits, sections, studyModes } from './enrollment-fields.js';
import { school } from './school.js';
import { combineLegacyAddress, enrollmentAddressFields, enrollmentDeclaration, enrollmentHours, imageConsentScope, staffEnrollmentSections, visibleEnrollmentFields } from './enrollment-details.js';
import { dateInSchool, formatDate, states } from './portal-api.js';

const width = 595.28;
const height = 841.89;
const margin = 24;
const boxWidth = width - margin * 2;
const inset = 11;
const gap = 12;
const headingHeight = 21;
const bottom = 41;
const blankLine = Symbol('blank line');
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
  unit: { accent: rgb(.03, .42, .37), tint: rgb(.88, .97, .95) },
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

export function createEnrollmentPdf(answers, fonts, options = {}) {
  return createSheet(answers, fonts, options);
}

async function createSheet(answers, fonts, {
  brand, photo, sample = false, year = enrollmentYear, schoolSections,
}) {
  const title = schoolSections ? 'Ficha de matrícula' : 'Ficha de pré-matrícula';
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${title} ${year} | Sonho de Criança`);
  pdf.setAuthor(school.fullName);
  pdf.setLanguage('pt-BR');
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fonts.regular, { subset: true });
  const bold = await pdf.embedFont(fonts.bold, { subset: true });
  const supportedCharacters = new Set(regular.getCharacterSet());
  const logo = brand ? await pdf.embedPng(brand) : null;
  const portrait = photo ? await pdf.embedJpg(photo) : null;
  let page;
  let cursor;

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
    draw(title, margin + 12, headerY + 29, 16, bold, white);
    draw(String(year), margin + 12, headerY + 12, 13, bold, white);
    const brandX = margin + titleWidth + 11;
    if (logo) {
      const dimensions = logo.scaleToFit(68, 42);
      page.drawImage(logo, { x: brandX, y: headerY + (headerHeight - dimensions.height) / 2, ...dimensions });
    }
    const textX = logo ? brandX + 76 : brandX;
    draw(school.fullName, textX, headerY + 32, 12, bold, navy);
    draw(`Educação Infantil · ${school.ageRange}`, textX, headerY + 15, 10.5, regular, muted);
    if (sample) draw('MODELO PREENCHIDO · DADOS FICTÍCIOS', margin, headerY - 12, 9, bold, muted);
    cursor = headerY - (sample ? 19 : 8);
  }

  function drawPhoto(top, accent, bodyWidth) {
    const x = margin + bodyWidth - inset - photoWidth;
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

  function answer(name) {
    return safe(answers[name]).trim().replace(/\s+/g, ' ');
  }

  function safe(value) {
    return Array.from(String(value ?? '').normalize('NFC'), character => character === '\n' || supportedCharacters.has(character.codePointAt(0))
      ? character : '\uFFFD').join('');
  }

  function buildLayout(size, rowGap, sectionGap, bodyPadding, widthScale = 1, foldLineBreaks = false, bodyWidth = boxWidth) {
    const sectionWidth = bodyWidth - 2 * inset;
    const personalWidth = sectionWidth - photoWidth - gap;
    const lineHeight = size + 1.4;
    const labelSize = Math.max(schoolSections ? 8 : 9.5, size - .5);

    function measureRow(cells) {
      const height = Math.max(...cells.map(({ labelLines, lines }) =>
        labelLines.length * (labelSize + 1) + 1 + lines.length * lineHeight));
      return { cells, height: height + rowGap };
    }

    function row(entries, availableWidth = sectionWidth) {
      const spare = availableWidth - gap * (entries.length - 1);
      let x = margin + inset;
      const cells = entries.map(([label, value, share = 1 / entries.length]) => {
        const cellWidth = spare * share;
        const content = value === blankLine ? '' : safe(value).trim() || 'Não informado';
        const paragraphs = foldLineBreaks ? [content] : content.split('\n');
        const lines = paragraphs.flatMap(part => wrap(part, regular, size, cellWidth / widthScale));
        const labelLines = wrap(label, bold, labelSize, cellWidth);
        const cell = { labelLines, lines, x, cellWidth };
        x += cellWidth + gap;
        return cell;
      });
      return measureRow(cells);
    }

    const birth = answer('birth').split('-').reverse().join('/');
    const blocks = [
      { key: 'child', rows: [
        row([['Nome completo', answer('child')]], personalWidth),
        row([['Nascimento', birth, .28], ['Idade', answer('age'), .20], ['Sexo', answer('sex'), .52]], personalWidth),
        row([['Endereço completo', answer('address')]], personalWidth),
        row([['Bairro', answer('district'), .72], ['CEP', answer('cep'), .28]], personalWidth),
      ] },
      { key: 'schedule', rows: [row([['Modalidade', studyModes[answers.schedule]]])] },
      { key: 'guardian', rows: [
        row([['Nome completo', answer('guardian'), .63], ['Vínculo com a criança', answer('relationship'), .37]]),
        row([['Telefone com DDD', answer('phone'), .27], ['E-mail da conta', answer('email'), .73]]),
      ] },
      { key: 'unit', rows: [row([['Unidade', schoolUnits[answers.unit]]])] },
    ].map((block, index) => ({ ...block, index, title: sections[index].title, photo: block.key === 'child' }));
    if (schoolSections) {
      const keys = Object.keys(colors);
      schoolSections.forEach(({ title, rows, base }, sectionIndex) => {
        const block = blocks.find(({ key }) => key === base);
        if (block) {
          if (block.photo) {
            const height = block.rows.reduce((total, item) => total + item.height, 0);
            block.rows.at(-1).height += Math.max(0, photoHeight + rowGap - height);
          }
          block.rows.push(...rows.map(entries => row(entries)));
        } else {
          blocks.push({ title, index: blocks.length, key: keys[sectionIndex % keys.length], rows: rows.map(entries => row(entries)) });
        }
      });
    }

    function blockHeight(rows, photo) {
      const rowsHeight = rows.reduce((total, item) => total + item.height, -rowGap);
      return headingHeight + 2 * bodyPadding + Math.max(photo ? photoHeight : 0, rowsHeight);
    }
    blocks.forEach(block => {
      block.height = blockHeight(block.rows, block.photo);
    });

    const total = blocks.reduce((sum, block) => sum + block.height, 0) + sectionGap * (blocks.length - 1);
    return { blocks, total, size, labelSize, lineHeight, sectionGap, bodyPadding, widthScale, bodyWidth, blockHeight, measureRow };
  }

  function drawSection(block, layout) {
    const palette = colors[block.key];
    const radius = 8;
    roundedBox(margin, cursor, layout.bodyWidth, headingHeight, radius, { color: palette.tint }, { bottomLeft: 0, bottomRight: 0 });
    roundedBox(margin, cursor, layout.bodyWidth, block.height, radius, { borderColor: palette.accent, borderWidth: .65 });
    roundedBox(margin + 8, cursor - 4, 13, 13, 3, { color: palette.accent });
    const number = String(block.index + 1);
    const badgeX = margin + (number.length === 1 ? 12 : 8 + (13 - bold.widthOfTextAtSize(number, 8.5)) / 2);
    draw(number, badgeX, cursor - 14, 8.5, bold, white);
    draw(block.title, margin + 28, cursor - 15, 12, bold, palette.accent);
    const { size, labelSize, lineHeight, bodyPadding, sectionGap, widthScale } = layout;
    let top = cursor - headingHeight - bodyPadding;
    if (block.photo) drawPhoto(top, palette.accent, layout.bodyWidth);

    for (const row of block.rows) {
      for (const { labelLines, lines, x, cellWidth } of row.cells) {
        if (!lines.length) continue;
        const labelStep = labelSize + 1;
        labelLines.forEach((label, index) => draw(label, x, top - labelSize - index * labelStep, labelSize, bold, muted));
        const y = top - labelLines.length * labelStep - 1 - size;
        lines.forEach((line, index) => drawAnswer(line, x, y - index * lineHeight, size, widthScale));
        horizontalRule(x, y - (lines.length - 1) * lineHeight - 2.7, cellWidth, rule, .4);
      }
      top -= row.height;
    }

    cursor -= block.height + sectionGap;
  }

  function addPage(withHeader = true) {
    page = pdf.addPage([width, height]);
    cursor = height - margin;
    if (withHeader) drawHeader();
  }

  function drawFooter(note, numbering) {
    horizontalRule(margin, 35, boxWidth, rule);
    draw(note, margin, 21, 9, regular, muted);
    if (numbering) {
      draw(numbering, width - margin - regular.widthOfTextAtSize(numbering, 9), 21, 9, regular, muted);
    }
  }

  function paginate(layout, firstPageSpace, continuationSpace) {
    const { blockHeight, measureRow, sectionGap } = layout;
    const sheets = [[]];
    let remaining = firstPageSpace;

    function nextSheet() {
      sheets.push([]);
      remaining = continuationSpace;
    }

    for (const block of layout.blocks) {
      const rows = [...block.rows];
      let continued = false;
      while (rows.length) {
        const hasPhoto = block.photo && !continued;
        if (sheets.at(-1).length && blockHeight([rows[0]], hasPhoto) > remaining) nextSheet();
        let fragment = [];
        while (rows.length && blockHeight([...fragment, rows[0]], hasPhoto) <= remaining) {
          fragment.push(rows.shift());
        }
        if (!fragment.length) {
          // Continue individual answers that exceed a full page.
          const row = rows[0];
          const lineLimit = Math.max(...row.cells.map(cell => cell.lines.length));
          const sliceCells = count => row.cells.map(cell => ({ ...cell, lines: cell.lines.slice(0, count) }));
          let lineCount = 1;
          while (lineCount < lineLimit && blockHeight([measureRow(sliceCells(lineCount + 1))], hasPhoto) <= remaining) {
            lineCount += 1;
          }
          fragment = [measureRow(sliceCells(lineCount))];
          rows[0] = measureRow(row.cells.map(cell => ({ ...cell, lines: cell.lines.slice(lineCount) })));
        }
        const title = continued ? `${block.title} (continuação)` : block.title;
        const height = blockHeight(fragment, hasPhoto);
        sheets.at(-1).push({ ...block, title, rows: fragment, photo: hasPhoto, height });
        remaining -= height + sectionGap;
        if (rows.length) nextSheet();
        continued = true;
      }
    }
    return sheets;
  }

  addPage();
  if (schoolSections) {
    const firstPageSpace = cursor - bottom;
    const continuationSpace = height - margin - bottom;
    const profiles = [
      [11.5, 4, 6, 7],
      [11, 4, 6, 7],
      [10.5, 3.5, 5, 6],
      [10, 3, 5, 6],
      [9.5, 2.5, 4, 5],
      [9, 2, 4, 4, 1, true],
      [8.5, 1.5, 3, 4, .88, true],
    ];
    let layout;
    let sheets;
    let scale = 1;
    for (const metrics of profiles) {
      layout = buildLayout(...metrics);
      sheets = paginate(layout, firstPageSpace, continuationSpace);
      if (sheets.length <= 2) break;
    }
    if (sheets.length > 2) {
      // Preserve text in exceptional records by scaling the body into the same two A4 pages.
      const compact = profiles.at(-1);
      do {
        scale /= 1.05;
        layout = buildLayout(...compact, boxWidth / scale);
        sheets = paginate(layout, firstPageSpace / scale, continuationSpace / scale);
      } while (sheets.length > 2);
    }

    sheets.forEach((blocks, index) => {
      if (index > 0) addPage(false);
      if (scale < 1) {
        page.pushOperators(pushGraphicsState(), concatTransformationMatrix(
          scale, 0, 0, scale, margin * (1 - scale), cursor * (1 - scale),
        ));
      }
      blocks.forEach(block => drawSection(block, layout));
      if (scale < 1) page.pushOperators(popGraphicsState());
      drawFooter(`${school.fullName} · Secretaria`, `${index + 1} / ${sheets.length}`);
    });
    return pdf.save();
  }

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
  layout.blocks.forEach(block => {
    drawSection({ ...block, height: block.height + 2 * extraPadding }, layout);
  });

  drawFooter('Pré-matrícula sujeita à confirmação da escola.');
  return pdf.save();
}

export function createSchoolEnrollmentPdf(item, record, fonts, brand) {
  const details = combineLegacyAddress(record?.details);
  const age = item.birth_date ? ageOnDate(item.birth_date, dateInSchool()) : null;
  const answers = {
    child: item.child_name,
    birth: item.birth_date,
    age: age === null ? '' : `${age} ${age === 1 ? 'ano' : 'anos'}`,
    sex: details.sex,
    address: details.address,
    district: details.district,
    cep: details.cep,
    schedule: item.schedule,
    guardian: item.guardian_name,
    relationship: item.guardian_relationship,
    phone: item.guardian_phone,
    email: item.guardian_email,
    unit: item.unit,
  };
  const values = { ...details, ...enrollmentHours(item.schedule), registration_date: formatDate(record?.registration_date), grade: record?.grade };
  const addressFields = new Set(enrollmentAddressFields.map(([name]) => name));
  const schoolSections = staffEnrollmentSections.map(({ title, fields, base }) => {
    const rows = [];
    let pair = [];
    const visible = visibleEnrollmentFields(fields, values).filter(({ name }) => !addressFields.has(name));
    for (let index = 0; index < visible.length; index += 1) {
      const { name, label, wide } = visible[index];
      const followUp = visible[index + 1];
      if (followUp?.name === `${name}Detail` && followUp.when?.[0] === name) {
        if (pair.length) rows.push(pair);
        pair = [];
        rows.push([[label, values[name], .31], [followUp.label, values[followUp.name], .69]]);
        index += 1;
      } else if (wide) {
        if (pair.length) rows.push(pair);
        pair = [];
        rows.push([[label, values[name]]]);
      } else {
        pair.push([label, values[name]]);
        if (pair.length === 2) {
          rows.push(pair);
          pair = [];
        }
      }
    }
    if (pair.length) rows.push(pair);
    return { title, rows, base };
  });
  schoolSections[schoolSections.length - 2].rows.push([['Escopo da autorização', imageConsentScope]]);
  schoolSections[schoolSections.length - 1].rows.push(
    [['Protocolo', item.protocol], ['Situação', states[item.status]]],
    [['Declaração do responsável', enrollmentDeclaration]],
    [['Assinatura do responsável', blankLine]],
  );
  return createSheet(answers, fonts, { brand, photo: record?.photo, year: item.school_year, schoolSections });
}
