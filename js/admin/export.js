function getSelectedExportFormat(selectId) {
  const select = document.getElementById(selectId);
  return (select?.value || 'excel').toLowerCase();
}

const REPORT_HEADER_BLUE = '0070C0';
const REPORT_HEADER_BLUE_RGB = [0, 112, 192];

function getExportResultFilters() {
  const kelas = document.getElementById('filter-result-kelas')?.value || '';
  const mapel = document.getElementById('filter-result-mapel')?.value || '';
  if (!kelas) {
    showNotification('Pilih Kelas', 'Silakan pilih kelas terlebih dahulu pada filter dropdown.', 'danger');
    return null;
  }
  if (!mapel) {
    showNotification('Pilih Mapel', 'Silakan pilih mata pelajaran terlebih dahulu pada filter dropdown.', 'danger');
    return null;
  }
  return { kelas, mapel };
}

function filterResultsForExport(kelas, mapel, excludeProses = true) {
  const filterMapel = String(mapel || '').trim();
  return ALL_RESULTS.filter((r) => {
    if (r.kelas !== kelas) return false;
    const mapelKey = typeof cleanMapelName === 'function' ? cleanMapelName(r.mapel || '') : String(r.mapel || '').trim();
    const mapelMatch = !filterMapel || mapelKey === filterMapel || String(r.mapel || '').trim() === filterMapel;
    if (!mapelMatch) return false;
    if (!excludeProses) return true;
    return typeof isExamResultRow === 'function' ? isExamResultRow(r) : r.status === 'Selesai';
  });
}

function formatReportDateId(date = new Date()) {
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getSafeExportSlug(text) {
  return String(text || '').replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
}

function buildReportExcelHeaderStyle() {
  return {
    font: { name: 'Arial', sz: 10, bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: REPORT_HEADER_BLUE } },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: '000000' } },
      bottom: { style: 'thin', color: { rgb: '000000' } },
      left: { style: 'thin', color: { rgb: '000000' } },
      right: { style: 'thin', color: { rgb: '000000' } }
    }
  };
}

function buildReportExcelCellStyle(align, isBold = false, color = null) {
  const style = {
    font: { name: 'Arial', sz: 10, bold: isBold },
    alignment: { horizontal: align, vertical: 'center' },
    border: {
      top: { style: 'thin', color: { rgb: '000000' } },
      bottom: { style: 'thin', color: { rgb: '000000' } },
      left: { style: 'thin', color: { rgb: '000000' } },
      right: { style: 'thin', color: { rgb: '000000' } }
    }
  };
  if (color) style.font.color = { rgb: color };
  return style;
}

function buildReportExcelTitleStyle(sz, bold) {
  return {
    font: { name: 'Arial', sz, bold },
    alignment: { horizontal: 'center', vertical: 'center' }
  };
}

function buildReportExcelMetaStyle() {
  return {
    font: { name: 'Arial', sz: 10, bold: true },
    alignment: { horizontal: 'left' }
  };
}

function buildReportExcelMetaValStyle() {
  return {
    font: { name: 'Arial', sz: 10 },
    alignment: { horizontal: 'left' }
  };
}

const HASIL_NILAI_ROWS_PER_PAGE = 20;
const HASIL_NILAI_MARGIN_MM = 20;
const HASIL_NILAI_MARGIN_TOP_MM = 10;
const HASIL_NILAI_MARGIN_INCH = 0.79;

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function applyHasilNilaiExcelPageSetup(ws) {
  ws['!pageSetup'] = {
    orientation: 'portrait',
    paperSize: 9,
    scale: 100,
    fitToPage: false,
    fitToWidth: 1,
    fitToHeight: 0
  };
  ws['!margins'] = {
    left: HASIL_NILAI_MARGIN_INCH,
    right: HASIL_NILAI_MARGIN_INCH,
    top: HASIL_NILAI_MARGIN_INCH,
    bottom: HASIL_NILAI_MARGIN_INCH,
    header: 0.3,
    footer: 0.3
  };
}

function applyAnalisisButirExcelPageSetup(ws) {
  ws['!pageSetup'] = {
    orientation: 'landscape',
    paperSize: 9,
    scale: 100,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0
  };
  ws['!margins'] = {
    left: 0.39,
    right: 0.39,
    top: 0.39,
    bottom: 0.39,
    header: 0.3,
    footer: 0.3
  };
}

function appendGuruMapelSignatureRows(data, startColIndex) {
  const pad = Array(Math.max(0, startColIndex)).fill({ v: '' });
  data.push([]);
  data.push([...pad, { v: `Kuningan, ${formatReportDateId()}`, s: { font: { name: 'Arial', sz: 10 }, alignment: { horizontal: 'left' } } }]);
  data.push([...pad, { v: 'Guru Mata Pelajaran', s: { font: { name: 'Arial', sz: 10 }, alignment: { horizontal: 'left' } } }]);
  data.push([]);
  data.push([]);
  data.push([...pad, { v: '', s: { border: { bottom: { style: 'thin', color: { rgb: '000000' } } } } }]);
  data.push([...pad, { v: 'NIP. ', s: { font: { name: 'Arial', sz: 10 }, alignment: { horizontal: 'left' } } }]);
}

function appendHasilNilaiExcelInfoRows(data, mapel, kelas, metaStyle, metaValStyle) {
  data.push([
    { v: "Mata Pelajaran", s: metaStyle },
    { v: `: ${mapel}`, s: metaValStyle },
    { v: "" },
    { v: "" }
  ]);
  data.push([
    { v: "Kelas", s: metaStyle },
    { v: `: ${kelas}`, s: metaValStyle },
    { v: "" },
    { v: "" }
  ]);
  data.push([]);
}

function appendHasilNilaiExcelTableHeader(data, headerStyle) {
  data.push([
    { v: "No", s: headerStyle },
    { v: "NIS", s: headerStyle },
    { v: "Nama Siswa", s: headerStyle },
    { v: "Nilai", s: headerStyle }
  ]);
}

function appendHasilNilaiExcelStatsFooter(data, rataRata, nilaiTertinggi, nilaiTerendah, metaStyle, metaValStyle) {
  const statTitleStyle = {
    font: { name: "Arial", sz: 10, bold: true, color: { rgb: "0070C0" } },
    alignment: { horizontal: "left", vertical: "center" }
  };
  data.push([]);
  data.push([
    { v: "Ringkasan Statistik", s: statTitleStyle },
    { v: "" },
    { v: "" },
    { v: "" }
  ]);
  data.push([
    { v: "Rata-rata Nilai", s: metaStyle },
    { v: Math.round(rataRata), t: 'n', s: metaValStyle },
    { v: "" },
    { v: "" }
  ]);
  data.push([
    { v: "Nilai Tertinggi", s: metaStyle },
    { v: nilaiTertinggi, t: 'n', s: metaValStyle },
    { v: "" },
    { v: "" }
  ]);
  data.push([
    { v: "Nilai Terendah", s: metaStyle },
    { v: nilaiTerendah, t: 'n', s: metaValStyle },
    { v: "" },
    { v: "" }
  ]);
}

function computeExportNilaiStats(rows) {
  const nilaiList = rows.map((r) => Number(r.nilai) || 0);
  return {
    rataRata: nilaiList.reduce((a, b) => a + b, 0) / (nilaiList.length || 1),
    nilaiTertinggi: nilaiList.length ? Math.max(...nilaiList) : 0,
    nilaiTerendah: nilaiList.length ? Math.min(...nilaiList) : 0
  };
}

function getItemAnalysisQuestionCount(studentAnalyses) {
  let max = 0;
  studentAnalyses.forEach((analysis) => {
    if (analysis.items?.length > max) max = analysis.items.length;
  });
  return Math.max(1, max);
}

function getItemAnalysisAnswerMark(item) {
  if (!item || item.status === 'kosong') return '-';
  if (item.status === 'benar') return '1';
  return '0';
}

function buildItemAnalysisPdfRows(studentAnalyses, questionCount) {
  return studentAnalyses.map((analysis, idx) => {
    const row = [
      idx + 1,
      analysis.student.nis || '-',
      analysis.student.nama || '-',
      analysis.student.kelas || '-',
      analysis.student.mapel || '-'
    ];
    for (let i = 0; i < questionCount; i++) {
      row.push(getItemAnalysisAnswerMark(analysis.items[i]));
    }
    row.push(analysis.summary.benar ?? 0, analysis.summary.salah ?? 0, analysis.student.nilai ?? 0);
    return row;
  });
}

function measurePdfTextWidth(doc, text, fontSize, padding = 1.2) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(fontSize);
  return doc.getTextWidth(String(text ?? '')) + padding;
}

function measurePdfTextWidthBold(doc, text, fontSize, padding = 1.2) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(fontSize);
  return doc.getTextWidth(String(text ?? '')) + padding;
}

function maxPdfTextWidth(doc, texts, fontSize, bold = false) {
  const measure = bold ? measurePdfTextWidthBold : measurePdfTextWidth;
  const values = (texts || []).map((t) => String(t ?? ''));
  if (!values.length) return 0;
  return Math.max(...values.map((t) => measure(doc, t, fontSize)));
}

function applyItemAnalysisNamaFlexWidth(widths, contentWidth) {
  const NAMA_COL = 2;
  const otherWidth = widths.reduce((sum, w, i) => (i === NAMA_COL ? sum : sum + w), 0);
  widths[NAMA_COL] = Math.max(widths[NAMA_COL], contentWidth - otherWidth);
  return widths.reduce((a, b) => a + b, 0);
}

function computeItemAnalysisPdfLayout(doc, rows, questionCount, contentWidth) {
  const fixedHeaders = ['No', 'NIS', 'Nama Siswa', 'Kelas', 'Mata Pelajaran'];
  const summaryHeaders = ['Benar', 'Salah', 'Nilai'];
  let bodyFont = 6;
  let headFont = 6.5;
  const minBodyFont = 4;
  const minHeadFont = 4.5;

  const buildWidths = (bodyFs, headFs) => {
    const widths = [];

    for (let c = 0; c < 5; c++) {
      const bodyTexts = rows.map((r) => r[c]);
      widths[c] = Math.max(
        measurePdfTextWidthBold(doc, fixedHeaders[c], headFs),
        maxPdfTextWidth(doc, bodyTexts, bodyFs),
        c === 0 ? 5 : 6
      );
    }

    const nomorSoalWidth = measurePdfTextWidthBold(doc, 'Nomor Soal', headFs);
    let qWidth = Math.max(
      maxPdfTextWidth(doc, Array.from({ length: questionCount }, (_, i) => String(i + 1)), headFs, true),
      measurePdfTextWidth(doc, '0', bodyFs),
      measurePdfTextWidth(doc, '1', bodyFs),
      measurePdfTextWidth(doc, '-', bodyFs),
      4
    );

    const questionBlockWidth = qWidth * questionCount;
    if (questionBlockWidth < nomorSoalWidth) {
      qWidth = nomorSoalWidth / questionCount;
    }

    for (let i = 0; i < questionCount; i++) {
      widths[5 + i] = qWidth;
    }

    const summaryStart = 5 + questionCount;
    summaryHeaders.forEach((label, offset) => {
      const colIdx = summaryStart + offset;
      const bodyTexts = rows.map((r) => String(r[colIdx] ?? ''));
      widths[colIdx] = Math.max(
        measurePdfTextWidthBold(doc, label, headFs),
        maxPdfTextWidth(doc, bodyTexts, bodyFs),
        6
      );
    });

    return widths;
  };

  let widths = buildWidths(bodyFont, headFont);
  let total = widths.reduce((a, b) => a + b, 0);

  while (total > contentWidth && bodyFont > minBodyFont) {
    bodyFont -= 0.25;
    headFont = Math.max(minHeadFont, headFont - 0.25);
    widths = buildWidths(bodyFont, headFont);
    total = widths.reduce((a, b) => a + b, 0);
  }

  const useHorizontalBreak = total > contentWidth;
  if (!useHorizontalBreak) {
    total = applyItemAnalysisNamaFlexWidth(widths, contentWidth);
  }

  const columnStyles = {};
  widths.forEach((w, i) => {
    columnStyles[i] = {
      cellWidth: w,
      halign: 'center',
      valign: 'middle',
      overflow: 'hidden'
    };
  });
  columnStyles[2] = { ...columnStyles[2], halign: 'left', overflow: 'linebreak' };
  columnStyles[4] = { ...columnStyles[4], halign: 'left', overflow: 'linebreak' };
  columnStyles[5 + questionCount + 2] = {
    ...columnStyles[5 + questionCount + 2],
    fontStyle: 'bold'
  };

  return {
    columnStyles,
    tableWidth: total,
    bodyFont,
    headFont,
    useHorizontalBreak
  };
}

function drawHasilNilaiPdfInfoSection(doc, mapel, kelas, marginLeft, marginTop) {
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Mata Pelajaran', marginLeft, marginTop);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${mapel}`, marginLeft + 32, marginTop);
  doc.setFont('helvetica', 'bold');
  doc.text('Kelas', marginLeft, marginTop + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${kelas}`, marginLeft + 32, marginTop + 5);
  return marginTop + 12;
}

function drawHasilNilaiPdfFooter(doc, marginLeft, marginRight, marginBottom, marginTop, pageWidth, pageHeight, startY, rataRata, nilaiTertinggi, nilaiTerendah) {
  const footerHeight = 42;
  let y = startY + 8;
  if (y + footerHeight > pageHeight - marginBottom) {
    doc.addPage();
    y = marginTop;
  }

  const sigX = pageWidth - marginRight - 62;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(0, 112, 192);
  doc.text('Ringkasan Statistik', marginLeft, y);
  doc.setTextColor(0, 0, 0);
  let statY = y + 5;
  doc.text('Rata-rata Nilai', marginLeft, statY);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${Math.round(rataRata)}`, marginLeft + 32, statY);
  statY += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.text('Nilai Tertinggi', marginLeft, statY);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${nilaiTertinggi}`, marginLeft + 32, statY);
  statY += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.text('Nilai Terendah', marginLeft, statY);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${nilaiTerendah}`, marginLeft + 32, statY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`Kuningan, ${formatReportDateId()}`, sigX, y);
  doc.text('Guru Mata Pelajaran', sigX, y + 5);
  doc.line(sigX, y + 22, sigX + 58, y + 22);
  doc.setFontSize(7);
  doc.text('NIP. ', sigX, y + 27);
}

function handleExportResultsReport() {
  const format = getSelectedExportFormat('filter-export-results-format');
  if (format === 'pdf') {
    handleExportResultsPdf();
  } else {
    handleExportResultsExcel();
  }
}

function handleExportResultsPdf() {
  if (typeof window.jspdf === 'undefined') return showNotification("Gagal", "Modul PDF sedang dimuat.", "danger");
  const filters = getExportResultFilters();
  if (!filters) return;
  const { kelas, mapel } = filters;
  const filtered = filterResultsForExport(kelas, mapel, true);
  if (!filtered.length) return showNotification("Kosong", `Tidak ada hasil ujian untuk kelas ${kelas} dan mapel ${mapel}.`, "info");

  filtered.sort((a, b) => (a.nama || '').localeCompare(b.nama || '', 'id'));
  const { rataRata, nilaiTertinggi, nilaiTerendah } = computeExportNilaiStats(filtered);

  const marginTop = HASIL_NILAI_MARGIN_TOP_MM;
  const marginSide = HASIL_NILAI_MARGIN_MM;
  const marginBottom = HASIL_NILAI_MARGIN_MM;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - marginSide * 2;
  const chunks = chunkArray(filtered, HASIL_NILAI_ROWS_PER_PAGE);

  chunks.forEach((chunk, pageIndex) => {
    if (pageIndex > 0) doc.addPage();
    const startY = drawHasilNilaiPdfInfoSection(doc, mapel, kelas, marginSide, marginTop);
    const rows = chunk.map((r, idx) => [
      pageIndex * HASIL_NILAI_ROWS_PER_PAGE + idx + 1,
      r.nis || '-',
      r.nama || '-',
      r.nilai ?? 0
    ]);

    if (typeof doc.autoTable === 'function') {
      doc.autoTable({
        startY,
        head: [['No', 'NIS', 'Nama Siswa', 'Nilai']],
        body: rows,
        styles: {
          fontSize: 7,
          cellPadding: 1.2,
          overflow: 'linebreak',
          lineColor: [209, 213, 219],
          lineWidth: 0.1,
          halign: 'center',
          valign: 'middle'
        },
        headStyles: {
          fillColor: REPORT_HEADER_BLUE_RGB,
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 7.5,
          halign: 'center',
          lineColor: [209, 213, 219],
          lineWidth: 0.1
        },
        columnStyles: {
          0: { cellWidth: contentWidth * 0.10, halign: 'center' },
          1: { cellWidth: contentWidth * 0.25, halign: 'center' },
          2: { cellWidth: contentWidth * 0.50, halign: 'left' },
          3: { cellWidth: contentWidth * 0.15, halign: 'center', fontStyle: 'bold', textColor: REPORT_HEADER_BLUE_RGB }
        },
        margin: { top: marginTop, bottom: marginBottom, left: marginSide, right: marginSide },
        theme: 'grid',
        tableWidth: contentWidth
      });
    }
  });

  const finalY = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? doc.lastAutoTable.finalY : marginTop + 20;
  drawHasilNilaiPdfFooter(doc, marginSide, marginSide, marginBottom, marginTop, pageWidth, pageHeight, finalY, rataRata, nilaiTertinggi, nilaiTerendah);

  const safeKelas = getSafeExportSlug(kelas);
  const safeMapel = getSafeExportSlug(mapel);
  doc.save(`Hasil_${safeKelas}_${safeMapel}_${Date.now()}.pdf`);
  showNotification("Berhasil", `Laporan hasil nilai kelas ${kelas} (${mapel}) berhasil diekspor ke PDF.`, "success");
}

function handleExportResultsExcel() {
  if (typeof XLSX === 'undefined') return showNotification("Gagal", "Modul Excel sedang dimuat.", "danger");
  const filters = getExportResultFilters();
  if (!filters) return;
  const { kelas, mapel } = filters;
  const filtered = filterResultsForExport(kelas, mapel, true);
  if (!filtered.length) return showNotification("Kosong", `Tidak ada hasil ujian untuk kelas ${kelas} dan mapel ${mapel}.`, "info");

  filtered.sort((a, b) => (a.nama || '').localeCompare(b.nama || '', 'id'));
  const { rataRata, nilaiTertinggi, nilaiTerendah } = computeExportNilaiStats(filtered);

  const headerStyle = buildReportExcelHeaderStyle();
  const metaStyle = buildReportExcelMetaStyle();
  const metaValStyle = buildReportExcelMetaValStyle();
  const cellStyle = buildReportExcelCellStyle;
  const nilaiStyle = (align) => cellStyle(align, true, '0070C0');

  const data = [];
  const chunks = chunkArray(filtered, HASIL_NILAI_ROWS_PER_PAGE);

  chunks.forEach((chunk, pageIndex) => {
    if (pageIndex > 0) data.push([]);
    appendHasilNilaiExcelInfoRows(data, mapel, kelas, metaStyle, metaValStyle);
    appendHasilNilaiExcelTableHeader(data, headerStyle);
    chunk.forEach((r, idx) => {
      const globalIdx = pageIndex * HASIL_NILAI_ROWS_PER_PAGE + idx;
      data.push([
        { v: globalIdx + 1, t: 'n', s: cellStyle('center') },
        { v: r.nis || '-', t: 's', s: cellStyle('center') },
        { v: r.nama || '-', t: 's', s: cellStyle('left') },
        { v: r.nilai ?? 0, t: 'n', s: nilaiStyle('center') }
      ]);
    });
  });

  appendHasilNilaiExcelStatsFooter(data, rataRata, nilaiTertinggi, nilaiTerendah, metaStyle, metaValStyle);
  appendGuruMapelSignatureRows(data, 2);

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 6 },
    { wch: 18 },
    { wch: 42 },
    { wch: 10 }
  ];
  applyHasilNilaiExcelPageSetup(ws);

  const wb = XLSX.utils.book_new();
  const safeKelas = getSafeExportSlug(kelas);
  const safeMapel = getSafeExportSlug(mapel);
  XLSX.utils.book_append_sheet(wb, ws, "Hasil Nilai");
  XLSX.writeFile(wb, `Hasil_${safeKelas}_${safeMapel}_${Date.now()}.xlsx`);
  showNotification("Berhasil", `Laporan hasil nilai kelas ${kelas} (${mapel}) berhasil diekspor ke Excel.`, "success");
}

function handleExportItemAnalysisReport() {
  const format = getSelectedExportFormat('filter-export-item-analysis-format');
  if (format === 'pdf') {
    handleExportItemAnalysisPdf();
  } else {
    handleExportItemAnalysisExcel();
  }
}

async function prepareItemAnalysisExportData(kelas, mapel) {
  const results = filterResultsForExport(kelas, mapel, true);
  if (!results.length) return null;
  results.sort((a, b) => (a.nama || '').localeCompare(b.nama || '', 'id'));

  const needJawaban = results
    .filter((r) => typeof resultHasAnswerMap !== 'function' || !resultHasAnswerMap(r))
    .map((r) => r.id);
  if (needJawaban.length && typeof hydrateResultJawabanByIds === 'function') {
    await hydrateResultJawabanByIds(needJawaban);
  }
  if (typeof ensurePacketsLoadedForResults === 'function') {
    await ensurePacketsLoadedForResults(results);
  }

  const freshResults = results.map((r) => ALL_RESULTS.find((x) => x.id === r.id) || r);
  const studentAnalyses = freshResults.map((r) => buildStudentItemAnalysis(r, ALL_SCHEDULES, ALL_PACKETS));
  const withAnswers = studentAnalyses.filter((a) => (a.summary?.benar || 0) + (a.summary?.salah || 0) > 0
    || (a.items || []).some((item) => item.studentAnswer));
  if (!withAnswers.length && studentAnalyses.every((a) => !(a.items || []).length)) {
    throw new Error('Data analisis butir belum tersedia. Pastikan paket soal termuat dan hasil ujian menyimpan jawaban.');
  }
  return { results: freshResults, studentAnalyses };
}

async function handleExportItemAnalysisPdf() {
  if (typeof window.jspdf === 'undefined') return showNotification("Gagal", "Modul PDF sedang dimuat.", "danger");
  const filters = getExportResultFilters();
  if (!filters) return;
  const { kelas, mapel } = filters;

  toggleLoader(true, 'Menyiapkan analisis butir soal...');
  try {
    const prepared = await prepareItemAnalysisExportData(kelas, mapel);
    if (!prepared) return showNotification("Kosong", `Tidak ada hasil ujian untuk kelas ${kelas} dan mapel ${mapel}.`, "info");
    const { studentAnalyses } = prepared;
    const questionCount = getItemAnalysisQuestionCount(studentAnalyses);
    if (!questionCount) {
      return showNotification("Kosong", "Data butir soal tidak tersedia untuk ekspor (paket soal / jawaban kosong).", "info");
    }
    const margin = 10;

  const headCellStyle = { overflow: 'visible', halign: 'center', valign: 'middle' };
  const headerRows = [
    [
      { content: 'No', rowSpan: 2, styles: headCellStyle },
      { content: 'NIS', rowSpan: 2, styles: headCellStyle },
      { content: 'Nama Siswa', rowSpan: 2, styles: { ...headCellStyle, halign: 'left' } },
      { content: 'Kelas', rowSpan: 2, styles: headCellStyle },
      { content: 'Mata Pelajaran', rowSpan: 2, styles: { ...headCellStyle, halign: 'left' } },
      { content: 'Nomor Soal', colSpan: questionCount, styles: headCellStyle },
      { content: 'Benar', rowSpan: 2, styles: headCellStyle },
      { content: 'Salah', rowSpan: 2, styles: headCellStyle },
      { content: 'Nilai', rowSpan: 2, styles: headCellStyle }
    ],
    Array.from({ length: questionCount }, (_, i) => ({
      content: String(i + 1),
      styles: headCellStyle
    }))
  ];
  const rows = buildItemAnalysisPdfRows(studentAnalyses, questionCount);

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('l', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  const tableLayout = computeItemAnalysisPdfLayout(doc, rows, questionCount, contentWidth);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('ANALISIS BUTIR SOAL UJIAN', pageWidth / 2, margin, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(16);
  doc.text('SMANDA CBT SYSTEM', pageWidth / 2, margin + 7, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Mata Pelajaran', margin, margin + 18);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${mapel}`, margin + 38, margin + 18);
  doc.setFont('helvetica', 'bold');
  doc.text('Kelas', margin, margin + 24);
  doc.setFont('helvetica', 'normal');
  doc.text(`: ${kelas}`, margin + 38, margin + 24);

  if (typeof doc.autoTable === 'function') {
    doc.autoTable({
      startY: margin + 30,
      head: headerRows,
      body: rows,
      styles: {
        fontSize: tableLayout.bodyFont,
        cellPadding: { top: 1, right: 0.6, bottom: 1, left: 0.6 },
        overflow: 'hidden',
        lineColor: [209, 213, 219],
        lineWidth: 0.1,
        halign: 'center',
        valign: 'middle'
      },
      headStyles: {
        fillColor: REPORT_HEADER_BLUE_RGB,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: tableLayout.headFont,
        halign: 'center',
        valign: 'middle',
        overflow: 'visible',
        cellPadding: { top: 1.2, right: 0.6, bottom: 1.2, left: 0.6 },
        lineColor: [209, 213, 219],
        lineWidth: 0.1
      },
      columnStyles: tableLayout.columnStyles,
      margin: { top: margin, bottom: margin, left: margin, right: margin },
      theme: 'grid',
      tableWidth: tableLayout.tableWidth,
      showHead: 'everyPage',
      horizontalPageBreak: tableLayout.useHorizontalBreak,
      horizontalPageBreakRepeat: [0, 1, 2, 3, 4],
      didParseCell: (data) => {
        if (data.section === 'head') {
          data.cell.styles.overflow = 'visible';
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fontSize = tableLayout.headFont;
        }
      }
    });
  }

  const finalY = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? doc.lastAutoTable.finalY + 12 : margin + 50;
  const sigX = pageWidth - margin - 70;
  let sigY = finalY;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Kuningan, ${formatReportDateId()}`, sigX, sigY);
  sigY += 5;
  doc.text('Guru Mata Pelajaran', sigX, sigY);
  sigY += 20;
  doc.line(sigX, sigY, sigX + 65, sigY);
  sigY += 5;
  doc.setFontSize(9);
  doc.text('NIP. ', sigX, sigY);

  const safeKelas = getSafeExportSlug(kelas);
  const safeMapel = getSafeExportSlug(mapel);
  doc.save(`Analisis_Butir_Soal_${safeKelas}_${safeMapel}_${Date.now()}.pdf`);
  showNotification("Berhasil", `Analisis butir soal kelas ${kelas} (${mapel}) berhasil diekspor ke PDF.`, "success");
  } catch (e) {
    console.error('handleExportItemAnalysisPdf failed', e);
    showNotification("Gagal", e.message || "Gagal mengekspor analisis butir.", "danger");
  } finally {
    toggleLoader(false);
  }
}

async function handleExportItemAnalysisExcel() {
  if (typeof XLSX === 'undefined') return showNotification("Gagal", "Modul Excel sedang dimuat.", "danger");
  const filters = getExportResultFilters();
  if (!filters) return;
  const { kelas, mapel } = filters;

  toggleLoader(true, 'Menyiapkan analisis butir soal...');
  try {
    const prepared = await prepareItemAnalysisExportData(kelas, mapel);
    if (!prepared) return showNotification("Kosong", `Tidak ada hasil ujian untuk kelas ${kelas} dan mapel ${mapel}.`, "info");
    const { studentAnalyses } = prepared;
    const questionCount = getItemAnalysisQuestionCount(studentAnalyses);
    if (!questionCount) {
      return showNotification("Kosong", "Data butir soal tidak tersedia untuk ekspor (paket soal / jawaban kosong).", "info");
    }

  const headerStyle = buildReportExcelHeaderStyle();
  const titleStyle = buildReportExcelTitleStyle;
  const metaStyle = buildReportExcelMetaStyle();
  const metaValStyle = buildReportExcelMetaValStyle();
  const cellStyle = buildReportExcelCellStyle;

  const totalCols = 5 + questionCount + 3;

  const headerRow1 = [
    { v: "No", s: headerStyle },
    { v: "NIS", s: headerStyle },
    { v: "Nama Siswa", s: headerStyle },
    { v: "Kelas", s: headerStyle },
    { v: "Mata Pelajaran", s: headerStyle },
    { v: "Nomor Soal", s: headerStyle }
  ];
  for (let i = 1; i < questionCount; i++) headerRow1.push({ v: "", s: headerStyle });
  headerRow1.push({ v: "Benar", s: headerStyle });
  headerRow1.push({ v: "Salah", s: headerStyle });
  headerRow1.push({ v: "Nilai", s: headerStyle });

  const headerRow2 = [
    { v: "", s: headerStyle },
    { v: "", s: headerStyle },
    { v: "", s: headerStyle },
    { v: "", s: headerStyle },
    { v: "", s: headerStyle }
  ];
  for (let i = 1; i <= questionCount; i++) {
    headerRow2.push({ v: i, t: 'n', s: headerStyle });
  }
  headerRow2.push({ v: "", s: headerStyle });
  headerRow2.push({ v: "", s: headerStyle });
  headerRow2.push({ v: "", s: headerStyle });

  const data = [
    [{ v: "ANALISIS BUTIR SOAL UJIAN", s: titleStyle(20, true) }],
    [{ v: "SMANDA CBT SYSTEM", s: titleStyle(16, false) }],
    [],
    [{ v: "Mata Pelajaran", s: metaStyle }, { v: `: ${mapel}`, s: metaValStyle }],
    [{ v: "Kelas", s: metaStyle }, { v: `: ${kelas}`, s: metaValStyle }],
    [],
    headerRow1,
    headerRow2
  ];

  studentAnalyses.forEach((analysis, idx) => {
    const row = [
      { v: idx + 1, t: 'n', s: cellStyle('center') },
      { v: analysis.student.nis || '-', t: 's', s: cellStyle('center') },
      { v: analysis.student.nama || '-', t: 's', s: cellStyle('left') },
      { v: analysis.student.kelas || '-', t: 's', s: cellStyle('center') },
      { v: analysis.student.mapel || '-', t: 's', s: cellStyle('left') }
    ];

    for (let i = 0; i < questionCount; i++) {
      const mark = getItemAnalysisAnswerMark(analysis.items[i]);
      if (mark === '1') {
        row.push({ v: '1', t: 's', s: cellStyle('center', true) });
      } else if (mark === '0') {
        row.push({ v: '0', t: 's', s: cellStyle('center', true, 'C00000') });
      } else {
        row.push({ v: '-', t: 's', s: cellStyle('center') });
      }
    }

    row.push({ v: analysis.summary.benar ?? 0, t: 'n', s: cellStyle('center') });
    row.push({ v: analysis.summary.salah ?? 0, t: 'n', s: cellStyle('center') });
    row.push({ v: analysis.student.nilai ?? 0, t: 'n', s: cellStyle('center', true) });

    data.push(row);
  });

  appendGuruMapelSignatureRows(data, Math.max(0, totalCols - 3));

  const ws = XLSX.utils.aoa_to_sheet(data);
  const merges = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } },
    { s: { r: 6, c: 0 }, e: { r: 7, c: 0 } },
    { s: { r: 6, c: 1 }, e: { r: 7, c: 1 } },
    { s: { r: 6, c: 2 }, e: { r: 7, c: 2 } },
    { s: { r: 6, c: 3 }, e: { r: 7, c: 3 } },
    { s: { r: 6, c: 4 }, e: { r: 7, c: 4 } },
    { s: { r: 6, c: 5 }, e: { r: 6, c: 5 + questionCount - 1 } },
    { s: { r: 6, c: 5 + questionCount }, e: { r: 7, c: 5 + questionCount } },
    { s: { r: 6, c: 5 + questionCount + 1 }, e: { r: 7, c: 5 + questionCount + 1 } },
    { s: { r: 6, c: 5 + questionCount + 2 }, e: { r: 7, c: 5 + questionCount + 2 } }
  ];
  ws['!merges'] = merges;

  const colWidths = [{ wch: 6 }, { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 25 }];
  for (let i = 0; i < questionCount; i++) colWidths.push({ wch: 4 });
  colWidths.push({ wch: 8 }, { wch: 8 }, { wch: 8 });
  ws['!cols'] = colWidths;
  applyAnalisisButirExcelPageSetup(ws);

  const wb = XLSX.utils.book_new();
  const safeKelas = getSafeExportSlug(kelas);
  const safeMapel = getSafeExportSlug(mapel);
  XLSX.utils.book_append_sheet(wb, ws, "Analisis Soal");
  XLSX.writeFile(wb, `Analisis_Butir_Soal_${safeKelas}_${safeMapel}_${Date.now()}.xlsx`);
  showNotification("Berhasil", `Analisis butir soal kelas ${kelas} (${mapel}) berhasil diekspor (${prepared.results.length} siswa).`, "success");
  } catch (e) {
    console.error('handleExportItemAnalysisExcel failed', e);
    showNotification("Gagal", e.message || "Gagal mengekspor analisis butir.", "danger");
  } finally {
    toggleLoader(false);
  }
}
