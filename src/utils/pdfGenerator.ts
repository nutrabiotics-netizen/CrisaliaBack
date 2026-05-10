import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';
import QRCode from 'qrcode';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = any;

const APP_NAME = 'Crisalia';
const MARGIN = 50;
const FOOTER_Y_OFFSET = 35;
const MIN_BOTTOM_GAP = 16; // espacio para no pisar el footer

/** Busca un archivo en varias ubicaciones posibles (backend y frontend) */
function findAssetFile(filename: string, subPath: string = 'assets'): string | null {
  const candidateRoots = [
    process.cwd(),
    path.resolve(process.cwd(), 'CrisaliaBack'),
    path.resolve(__dirname, '..', '..'),
    path.resolve(__dirname, '..', '..', '..'),
    path.resolve(__dirname, '..', '..', '..', '..')
  ];

  const frontendRoots = [
    path.resolve(process.cwd(), '..', 'CrisaliaFront', 'src', 'assets', 'images'),
    path.resolve(__dirname, '..', '..', '..', '..', 'CrisaliaFront', 'src', 'assets', 'images'),
    path.resolve(__dirname, '..', '..', '..', '..', '..', 'CrisaliaFront', 'src', 'assets', 'images')
  ];

  // Buscar en backend
  for (const root of candidateRoots) {
    const fullPath = path.join(root, subPath, filename);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  // Buscar en frontend (solo para imágenes)
  if (subPath.includes('images')) {
    for (const root of frontendRoots) {
      const fullPath = path.join(root, filename);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }

  return null;
}

/** Ruta del logo: busca en CrisaliaBack/assets/ y también en CrisaliaFront/src/assets/images/ */
function getLogoPath(): string | null {
  const candidates = ['logo.png', 'logo.jpg', 'LogoHorizontal.png'];
  for (const name of candidates) {
    const logoPath = findAssetFile(name, 'assets');
    if (logoPath) {
      console.log(`[PDF] Logo encontrado: ${logoPath}`);
      return logoPath;
    }
    // También buscar en frontend
    const frontendPath = findAssetFile(name, 'assets/images');
    if (frontendPath) {
      console.log(`[PDF] Logo encontrado en frontend: ${frontendPath}`);
      return frontendPath;
    }
  }
  console.warn('[PDF] Logo no encontrado');
  return null;
}

/** Descarga una imagen desde URL y devuelve un Buffer para usar en PDF. */
export async function fetchImageAsBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Crisalia-PDF/1.0' } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} al cargar imagen: ${url}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

/** URL única del logo para todos los PDFs (variable de entorno). Si no está definida, se usa logo local. */
const PDF_LOGO_URL = process.env.PDF_LOGO_URL || process.env.CRISALIA_PDF_LOGO_URL || '';

/** Obtiene el buffer del logo global (misma URL para todos los documentos). */
async function getGlobalLogoBuffer(): Promise<Buffer | null> {
  if (!PDF_LOGO_URL.trim()) return null;
  try {
    return await fetchImageAsBuffer(PDF_LOGO_URL.trim());
  } catch (e) {
    console.warn('[PDF] No se pudo cargar logo global (PDF_LOGO_URL):', e);
    return null;
  }
}



/** Genera un buffer PNG del código QR para la URL dada. */
async function generateQRBuffer(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { type: 'png', width: 120, margin: 1 });
}

function getPageWidth(doc: Doc): number {
  return doc?.page?.width || 595.28; // A4 width default
}

function getPageUsableBottom(doc: Doc): number {
  return (doc?.page?.height || 841.89) - FOOTER_Y_OFFSET - MIN_BOTTOM_GAP;
}

function ensureSpace(doc: Doc, neededHeight: number, headerTitle: string): void {
  const bottom = getPageUsableBottom(doc);
  if (doc.y + neededHeight <= bottom) return;
  doc.addPage({ margin: MARGIN });
  addDocumentHeader(doc, headerTitle);
}

/** Opciones opcionales para la cabecera del PDF (logo global o local). */
export type DocumentHeaderOptions = {
  logoBuffer?: Buffer | null;
};

/**
 * Cabecera de documento: logo (global por URL o archivo local) + título + línea.
 */
function addDocumentHeader(doc: Doc, documentTitle: string, options?: DocumentHeaderOptions): void {
  const pageWidth = getPageWidth(doc);
  const startY = doc.y;

  const logoPath = !options?.logoBuffer ? getLogoPath() : null;
  const logoWidth = 110;
  const logoHeight = 40;

  // === LOGO (prioridad: buffer global URL > archivo local) ===
  if (options?.logoBuffer) {
    try {
      doc.image(options.logoBuffer, MARGIN, startY, {
        width: logoWidth,
        fit: [logoWidth, logoHeight],
        align: 'left'
      });
    } catch (err) {
      console.warn('[PDF] No se pudo usar logo en cabecera:', err);
    }
  } else if (logoPath) {
    try {
      doc.image(logoPath, MARGIN, startY, {
        width: logoWidth,
        fit: [logoWidth, logoHeight],
        align: 'left'
      });
    } catch (err) {
      console.warn('[PDF] No se pudo cargar el logo');
    }
  }

  // === TÍTULO ===
  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .fillColor('#374151')
    .text(
      documentTitle,
      0,
      startY + 10,
      {
        width: pageWidth,
        align: 'center'
      }
    );

  // === SEPARADOR ===
  const separatorY = startY + logoHeight + 18;

  doc
    .moveTo(MARGIN, separatorY)
    .lineTo(pageWidth - MARGIN, separatorY)
    .strokeColor('#E5E7EB')
    .stroke();

  // === ESPACIO PARA CONTENIDO ===
  doc.y = separatorY + 14;
  doc.fillColor('#111827');
}

/**
 * Título de sección dentro del documento (ej. "Historia Clínica", "Medicamentos").
 */
function addSectionTitle(doc: Doc, title: string): void {
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#374151').text(title);
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(10).fillColor('#111827');
}

function addSectionMultiline(doc: Doc, label: string, value: string | undefined): void {
  if (value === undefined || value === null || value === '') return;
  doc.font('Helvetica-Bold').fontSize(10).text(`${label}:`);
  doc.font('Helvetica').text(String(value), { indent: 12 });
  doc.moveDown(0.5);
}

type TableColumn = { key: string; header: string; width: number; align?: 'left' | 'center' | 'right' };

function drawTable(
  doc: Doc,
  headerTitle: string,
  columns: TableColumn[],
  rows: Array<Record<string, any>>,
  options?: { rowHeight?: number; headerHeight?: number }
): void {
  const rowHeight = options?.rowHeight ?? 18;
  const headerHeight = options?.headerHeight ?? 20;
  const pageWidth = getPageWidth(doc);
  const x0 = MARGIN;
  const maxWidth = pageWidth - MARGIN * 2;
  const totalWidth = columns.reduce((sum, c) => sum + c.width, 0);
  const scale = totalWidth > maxWidth ? maxWidth / totalWidth : 1;
  const scaledCols = columns.map((c) => ({ ...c, width: Math.floor(c.width * scale) }));

  const drawHeaderRow = () => {
    ensureSpace(doc, headerHeight + 6, headerTitle);
    const y = doc.y;
    doc.save();
    doc.fillColor('#F3F4F6').rect(x0, y, maxWidth, headerHeight).fill();
    doc.strokeColor('#E5E7EB').rect(x0, y, maxWidth, headerHeight).stroke();
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(9);
    let x = x0;
    for (const col of scaledCols) {
      doc.text(String(col.header), x + 6, y + 6, { width: col.width - 12, align: col.align ?? 'left' });
      x += col.width;
    }
    doc.restore();
    doc.y = y + headerHeight + 4;
  };

  const drawDataRow = (row: Record<string, any>) => {
    ensureSpace(doc, rowHeight + 2, headerTitle);
    const y = doc.y;
    doc.save();
    doc.strokeColor('#E5E7EB').rect(x0, y, maxWidth, rowHeight).stroke();
    doc.font('Helvetica').fontSize(9).fillColor('#111827');
    let x = x0;
    for (const col of scaledCols) {
      const raw = row[col.key];
      const text = raw === undefined || raw === null ? '' : String(raw);
      doc.text(text, x + 6, y + 5, { width: col.width - 12, align: col.align ?? 'left', ellipsis: true });
      x += col.width;
    }
    doc.restore();
    doc.y = y + rowHeight;
  };

  drawHeaderRow();
  if (!rows || rows.length === 0) {
    drawDataRow({ [scaledCols[0].key]: '—' });
    doc.moveDown(0.5);
    return;
  }
  rows.forEach(drawDataRow);
  doc.moveDown(0.7);
}

function drawKeyValueTable(doc: Doc, headerTitle: string, rows: Array<{ label: string; value: any }>): void {
  drawTable(
    doc,
    headerTitle,
    [
      { key: 'label', header: '', width: 160 },
      { key: 'value', header: '', width: 420 }
    ],
    rows
      .filter((r) => r.value !== undefined && r.value !== null && String(r.value) !== '')
      .map((r) => ({ label: r.label, value: String(r.value) }))
  );
}

/**
 * Pie de página: "Generado por Crisalia - fecha" y número de página.
 * Se agrega automáticamente en cada página usando el evento 'pageAdded' de PDFKit.
 */
function setupPageFooter(doc: Doc): void {
  let pageNumber = 0;

  doc.on('pageAdded', () => {
    pageNumber++;
  });

  // Footer SOLO al final de cada página
  doc.on('end', () => {
    const range = doc.bufferedPageRange(); // { start, count }

    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);

      const bottomY = doc.page.height - FOOTER_Y_OFFSET;

      doc
        .fontSize(8)
        .fillColor('#6B7280')
        .font('Helvetica')
        .text(
          `Generado por ${APP_NAME} - ${new Date().toLocaleDateString('es-CO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
          })}`,
          MARGIN,
          bottomY
        );

      doc.text(
        `Página ${i + 1}`,
        MARGIN,
        bottomY,
        { width: getPageWidth(doc) - MARGIN * 2, align: 'right' }
      );
    }

    doc.fillColor('#111827');
  });
}



/** Crea documento PDF con márgenes y eventos básicos. */
function createDocument(): { doc: Doc; chunks: Buffer[] } {
  const doc = new PDFDocument({
    margin: MARGIN,
    size: 'A4',
    autoFirstPage: true,
    bufferPages: true   // 🔥 CLAVE
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  return { doc, chunks };
}


/** Genera PDF de historia clínica (resumen). */
export async function generateHistoriaPdf(historia: any): Promise<Buffer> {
  const logoBuffer = await getGlobalLogoBuffer();

  // QR: si viene tokenPublico, generar QR apuntando al link público de la HC
  let qrBuffer: Buffer | null = null;
  if (historia.tokenPublico) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const hcUrl = `${frontendUrl}/hc-publica/${historia.tokenPublico}`;
    qrBuffer = await generateQRBuffer(hcUrl).catch(() => null);
  }

  return new Promise((resolve, reject) => {
    const { doc, chunks } = createDocument();
    setupPageFooter(doc);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const headerTitle = 'Historia Clínica';
    addDocumentHeader(doc, headerTitle, { logoBuffer });

    // QR en la esquina superior derecha (si existe)
    if (qrBuffer) {
      try {
        const pageWidth = getPageWidth(doc);
        doc.image(qrBuffer, pageWidth - MARGIN - 80, MARGIN, { width: 80 });
        doc.fontSize(7).fillColor('#6b7280').text('Ver HC digital', pageWidth - MARGIN - 80, MARGIN + 82, { width: 80, align: 'center' });
        doc.fillColor('#374151');
      } catch (e) {
        console.warn('[PDF] No se pudo insertar QR en HC:', e);
      }
    }

    addSectionTitle(doc, 'Datos del registro');
    drawKeyValueTable(doc, headerTitle, [
      { label: 'Paciente', value: historia.pacienteNombre },
      { label: 'Fecha registro', value: historia.fechaRegistro ? new Date(historia.fechaRegistro).toLocaleDateString('es-CO') : '' },
      { label: 'Tipo actividad', value: historia.tipoActividad },
      { label: 'Motivo consulta', value: historia.motivoConsulta }
    ]);

    if (historia.enfermedadActual) {
      addSectionTitle(doc, 'Enfermedad actual');
      ensureSpace(doc, 40, headerTitle);
      doc.font('Helvetica').fontSize(10).text(String(historia.enfermedadActual));
      doc.moveDown(0.6);
    }

    if (historia.analisisyplan) {
      addSectionTitle(doc, 'Análisis y plan');
      ensureSpace(doc, 40, headerTitle);
      doc.font('Helvetica').fontSize(10).text(String(historia.analisisyplan));
      doc.moveDown(0.6);
    }

    if (historia.diagnosticos && historia.diagnosticos.length > 0) {
      addSectionTitle(doc, 'Diagnósticos');
      drawTable(
        doc,
        headerTitle,
        [
          { key: 'codigo', header: 'Código', width: 120 },
          { key: 'descripcion', header: 'Descripción', width: 460 }
        ],
        historia.diagnosticos.map((d: any) => ({
          codigo: d.codigo || '',
          descripcion: d.descripcion || ''
        })),
        { rowHeight: 18 }
      );
    }

    if (historia.recomendaciones) {
      addSectionTitle(doc, 'Recomendaciones');
      ensureSpace(doc, 40, headerTitle);
      doc.font('Helvetica').fontSize(10).text(String(historia.recomendaciones));
      doc.moveDown(0.6);
    }

    doc.end();
  });
}

/** Genera PDF de fórmula médica. */
export async function generateFormulaPdf(formula: any): Promise<Buffer> {
  const logoBuffer = await getGlobalLogoBuffer();
  return new Promise((resolve, reject) => {
    const { doc, chunks } = createDocument();
    setupPageFooter(doc);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const headerTitle = 'Fórmula Médica';
    addDocumentHeader(doc, headerTitle, { logoBuffer });
    const pacienteNombre = formula.pacienteId?.nombre && formula.pacienteId?.apellido
      ? `${formula.pacienteId.nombre} ${formula.pacienteId.apellido}` : '';
    // addSectionTitle(doc, 'Datos');
    drawKeyValueTable(doc, headerTitle, [{ label: 'Paciente', value: pacienteNombre }]);
    if (formula.diagnosticos && formula.diagnosticos.length > 0) {
      addSectionTitle(doc, 'Diagnósticos');
      drawTable(
        doc,
        headerTitle,
        [
          { key: 'codigo', header: 'Código', width: 120 },
          { key: 'descripcion', header: 'Descripción', width: 460 }
        ],
        formula.diagnosticos.map((d: any) => ({ codigo: d.codigo || '', descripcion: d.descripcion || '' }))
      );
    }
    addSectionTitle(doc, 'Medicamentos');
    drawTable(
      doc,
      headerTitle,
      [
        { key: 'n', header: '#', width: 30, align: 'right' },
        { key: 'med', header: 'Medicamento', width: 180 },
        { key: 'conc', header: 'Concentración', width: 90 },
        { key: 'dosis', header: 'Dosis', width: 80 },
        { key: 'freq', header: 'Frecuencia', width: 90 },
        { key: 'ind', header: 'Indicaciones', width: 150 }
      ],
      (formula.medicamentos || []).map((m: any, i: number) => ({
        n: i + 1,
        med: m.denominacionComun || m.medicamento || '',
        conc: m.concentracion || '',
        dosis: m.dosis || '',
        freq: m.frecuencia || '',
        ind: m.indicaciones || ''
      })),
      { rowHeight: 18 }
    );
    addSectionMultiline(doc, 'Observaciones', formula.observaciones);
    doc.end();
  });
}

/** Genera PDF de incapacidad. */
export async function generateIncapacidadPdf(incapacidad: any): Promise<Buffer> {
  const logoBuffer = await getGlobalLogoBuffer();
  return new Promise((resolve, reject) => {
    const { doc, chunks } = createDocument();
    setupPageFooter(doc);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const headerTitle = 'Incapacidad Laboral';
    addDocumentHeader(doc, headerTitle, { logoBuffer });
    addSectionTitle(doc, 'Datos');
    drawKeyValueTable(doc, headerTitle, [
      {
        label: 'Paciente',
        value:
          incapacidad.pacienteId?.nombre && incapacidad.pacienteId?.apellido
            ? `${incapacidad.pacienteId.nombre} ${incapacidad.pacienteId.apellido}`
            : ''
      },
      { label: 'Lugar de expedición', value: incapacidad.lugarExpedicion },
      { label: 'Fecha de expedición', value: incapacidad.fechaExpedicion ? new Date(incapacidad.fechaExpedicion).toLocaleDateString('es-CO') : '' },
      { label: 'Fecha inicial', value: incapacidad.fechaInicial ? new Date(incapacidad.fechaInicial).toLocaleDateString('es-CO') : '' },
      { label: 'Días', value: incapacidad.dias !== undefined ? String(incapacidad.dias) : '' },
      { label: 'Fecha final', value: incapacidad.fechaFinal ? new Date(incapacidad.fechaFinal).toLocaleDateString('es-CO') : '' },
      { label: 'Diagnóstico principal', value: incapacidad.diagnosticoPrincipal?.descripcion || '' }
    ]);

    addSectionMultiline(doc, 'Observaciones', incapacidad.observaciones);
    doc.end();
  });
}

/** Genera PDF de interconsulta. */
export async function generateInterconsultaPdf(interconsulta: any): Promise<Buffer> {
  const logoBuffer = await getGlobalLogoBuffer();
  const servicioSolicita = typeof interconsulta.servicioQueSolicita === 'object'
    ? (interconsulta.servicioQueSolicita?.name || interconsulta.servicioQueSolicita?.nombre || '')
    : String(interconsulta.servicioQueSolicita || '');

  return new Promise((resolve, reject) => {
    const { doc, chunks } = createDocument();
    setupPageFooter(doc);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const headerTitle = 'Orden de Interconsulta';
    addDocumentHeader(doc, headerTitle, { logoBuffer });
    addSectionTitle(doc, 'Datos');
    drawKeyValueTable(doc, headerTitle, [
      { label: 'Servicio que solicita', value: servicioSolicita },
      { label: 'Motivo general', value: interconsulta.motivo }
    ]);
    addSectionTitle(doc, 'Servicios remitidos');
    drawTable(
      doc,
      headerTitle,
      [
        { key: 'n', header: '#', width: 30, align: 'right' },
        { key: 'servicio', header: 'Servicio / CUPS', width: 260 },
        { key: 'motivo', header: 'Motivo', width: 290 }
      ],
      (interconsulta.serviciosRemitidos || []).map((s: any, i: number) => ({
        n: i + 1,
        servicio: s.descripcionCups || s.servicio || '',
        motivo: s.motivo || ''
      }))
    );
    doc.end();
  });
}

/** Genera PDF de orden de exámenes de laboratorio. */
export async function generateExamenMedicoPdf(examen: any): Promise<Buffer> {
  const logoBuffer = await getGlobalLogoBuffer();
  return new Promise((resolve, reject) => {
    const { doc, chunks } = createDocument();
    setupPageFooter(doc);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const headerTitle = 'Orden de Exámenes de Laboratorio';
    addDocumentHeader(doc, headerTitle, { logoBuffer });

    const pacienteNombre =
      examen.pacienteId?.nombre && examen.pacienteId?.apellido
        ? `${examen.pacienteId.nombre} ${examen.pacienteId.apellido}`
        : '';

    addSectionTitle(doc, 'Datos');
    drawKeyValueTable(doc, headerTitle, [
      { label: 'Paciente', value: pacienteNombre },
      { label: 'Fecha', value: examen.createdAt ? new Date(examen.createdAt).toLocaleDateString('es-CO') : '' }
    ]);

    addSectionTitle(doc, 'Exámenes solicitados');
    drawTable(
      doc,
      headerTitle,
      [
        { key: 'n', header: '#', width: 30, align: 'right' },
        { key: 'codigo', header: 'Código CUPS', width: 120 },
        { key: 'descripcion', header: 'Descripción', width: 320 },
        { key: 'cantidad', header: 'Cant.', width: 50, align: 'right' },
        { key: 'observacion', header: 'Observación', width: 140 }
      ],
      (examen.examenes || []).map((e: any, i: number) => ({
        n: i + 1,
        codigo: e.codigoCups || '',
        descripcion: e.descripcionCups || '',
        cantidad: e.cantidad != null ? String(e.cantidad) : '',
        observacion: e.observacion || ''
      })),
      { rowHeight: 18 }
    );

    doc.end();
  });
}

/** Genera PDF de orden de ayudas diagnósticas. */
export async function generateAyudaDiagnosticaPdf(ayuda: any): Promise<Buffer> {
  const logoBuffer = await getGlobalLogoBuffer();
  return new Promise((resolve, reject) => {
    const { doc, chunks } = createDocument();
    setupPageFooter(doc);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const headerTitle = 'Orden de Ayudas Diagnósticas';
    addDocumentHeader(doc, headerTitle, { logoBuffer });

    const pacienteNombre =
      ayuda.pacienteId?.nombre && ayuda.pacienteId?.apellido
        ? `${ayuda.pacienteId.nombre} ${ayuda.pacienteId.apellido}`
        : '';

    addSectionTitle(doc, 'Datos');
    drawKeyValueTable(doc, headerTitle, [
      { label: 'Paciente', value: pacienteNombre },
      { label: 'Fecha', value: ayuda.createdAt ? new Date(ayuda.createdAt).toLocaleDateString('es-CO') : '' }
    ]);

    addSectionTitle(doc, 'Ayudas diagnósticas solicitadas');
    drawTable(
      doc,
      headerTitle,
      [
        { key: 'n', header: '#', width: 30, align: 'right' },
        { key: 'codigo', header: 'Código CUPS', width: 120 },
        { key: 'descripcion', header: 'Descripción', width: 320 },
        { key: 'cantidad', header: 'Cant.', width: 50, align: 'right' },
        { key: 'observacion', header: 'Observación', width: 140 }
      ],
      (ayuda.ayudasDiagnosticas || []).map((a: any, i: number) => ({
        n: i + 1,
        codigo: a.codigoCups || '',
        descripcion: a.descripcionCups || '',
        cantidad: a.cantidad != null ? String(a.cantidad) : '',
        observacion: a.observacion || ''
      })),
      { rowHeight: 18 }
    );

    doc.end();
  });
}

/** Genera PDF de apoyo terapéutico. */
export async function generateApoyoTerapeuticoPdf(apoyo: any): Promise<Buffer> {
  const logoBuffer = await getGlobalLogoBuffer();
  return new Promise((resolve, reject) => {
    const { doc, chunks } = createDocument();
    setupPageFooter(doc);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const headerTitle = 'Orden de Apoyo Terapéutico';
    addDocumentHeader(doc, headerTitle, { logoBuffer });

    const pacienteNombre =
      apoyo.pacienteId?.nombre && apoyo.pacienteId?.apellido
        ? `${apoyo.pacienteId.nombre} ${apoyo.pacienteId.apellido}`
        : '';

    addSectionTitle(doc, 'Datos');
    drawKeyValueTable(doc, headerTitle, [
      { label: 'Paciente', value: pacienteNombre },
      { label: 'Servicio que solicita', value: apoyo.servicioQueSolicita },
      { label: 'Fecha', value: apoyo.createdAt ? new Date(apoyo.createdAt).toLocaleDateString('es-CO') : '' },
      { label: 'Motivo general', value: apoyo.motivo }
    ]);

    addSectionTitle(doc, 'Servicios remitidos');
    drawTable(
      doc,
      headerTitle,
      [
        { key: 'n', header: '#', width: 30, align: 'right' },
        { key: 'codigo', header: 'Código CUPS', width: 120 },
        { key: 'descripcion', header: 'Descripción', width: 260 },
        { key: 'servicio', header: 'Servicio', width: 160 },
        { key: 'motivo', header: 'Motivo', width: 140 }
      ],
      (apoyo.serviciosRemitidos || []).map((s: any, i: number) => ({
        n: i + 1,
        codigo: s.codigoCups || '',
        descripcion: s.descripcionCups || '',
        servicio: s.servicio || '',
        motivo: s.motivo || ''
      })),
      { rowHeight: 18 }
    );

    doc.end();
  });
}

/** Datos del profesional para bloque de firma al final del resumen de cita. */
export type MedicoPdfFirma = {
  nombreCompleto: string;
  numeroColegiatura?: string;
  firmaImageBuffer?: Buffer | null;
};

/** Genera un PDF resumen de la cita (historia + fórmula + incapacidad + interconsulta en un solo PDF). */
export async function generateCitaResumenPdf(payload: {
  historia?: any;
  formula?: any;
  incapacidad?: any;
  interconsulta?: any;
  medico?: MedicoPdfFirma;
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { doc, chunks } = createDocument();
    setupPageFooter(doc);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const headerTitle = 'Resumen de la consulta';
    addDocumentHeader(doc, headerTitle);

    if (payload.historia) {
      addSectionTitle(doc, 'Historia Clínica');
      drawKeyValueTable(doc, headerTitle, [
        { label: 'Paciente', value: payload.historia.pacienteNombre },
        { label: 'Fecha registro', value: payload.historia.fechaRegistro ? new Date(payload.historia.fechaRegistro).toLocaleDateString('es-CO') : '' },
        { label: 'Tipo actividad', value: payload.historia.tipoActividad },
        { label: 'Motivo consulta', value: payload.historia.motivoConsulta }
      ]);

      if (payload.historia.analisisyplan) {
        addSectionTitle(doc, 'Análisis y plan');
        ensureSpace(doc, 40, headerTitle);
        doc.font('Helvetica').fontSize(10).text(String(payload.historia.analisisyplan));
        doc.moveDown(0.6);
      }

      if (payload.historia.diagnosticos?.length) {
        addSectionTitle(doc, 'Diagnósticos');
        drawTable(
          doc,
          headerTitle,
          [
            { key: 'codigo', header: 'Código', width: 120 },
            { key: 'descripcion', header: 'Descripción', width: 460 }
          ],
          payload.historia.diagnosticos.map((d: any) => ({ codigo: d.codigo || '', descripcion: d.descripcion || '' }))
        );
      }
    }

    if (payload.formula) {
      addSectionTitle(doc, 'Fórmula Médica');
      drawTable(
        doc,
        headerTitle,
        [
          { key: 'n', header: '#', width: 30, align: 'right' },
          { key: 'med', header: 'Medicamento', width: 200 },
          { key: 'conc', header: 'Conc.', width: 80 },
          { key: 'dosis', header: 'Dosis', width: 80 },
          { key: 'freq', header: 'Frecuencia', width: 110 },
          { key: 'ind', header: 'Indicaciones', width: 120 }
        ],
        (payload.formula.medicamentos || []).map((m: any, i: number) => ({
          n: i + 1,
          med: m.denominacionComun || m.medicamento || '',
          conc: m.concentracion || '',
          dosis: m.dosis || '',
          freq: m.frecuencia || '',
          ind: m.indicaciones || ''
        }))
      );
    }

    if (payload.incapacidad) {
      addSectionTitle(doc, 'Incapacidad');
      drawKeyValueTable(doc, headerTitle, [
        { label: 'Lugar de expedición', value: payload.incapacidad.lugarExpedicion },
        { label: 'Fecha inicial', value: payload.incapacidad.fechaInicial ? new Date(payload.incapacidad.fechaInicial).toLocaleDateString('es-CO') : '' },
        { label: 'Días', value: payload.incapacidad.dias !== undefined ? String(payload.incapacidad.dias) : '' },
        { label: 'Fecha final', value: payload.incapacidad.fechaFinal ? new Date(payload.incapacidad.fechaFinal).toLocaleDateString('es-CO') : '' },
        { label: 'Diagnóstico', value: payload.incapacidad.diagnosticoPrincipal?.descripcion || '' }
      ]);
    }

    if (payload.interconsulta) {
      addSectionTitle(doc, 'Interconsulta');
      const servicioSolicita = typeof payload.interconsulta.servicioQueSolicita === 'object'
        ? (payload.interconsulta.servicioQueSolicita?.name || payload.interconsulta.servicioQueSolicita?.nombre || '')
        : String(payload.interconsulta.servicioQueSolicita || '');
      drawKeyValueTable(doc, headerTitle, [
        { label: 'Servicio que solicita', value: servicioSolicita },
        { label: 'Motivo', value: payload.interconsulta.motivo }
      ]);
      addSectionTitle(doc, 'Servicios remitidos');
      drawTable(
        doc,
        headerTitle,
        [
          { key: 'n', header: '#', width: 30, align: 'right' },
          { key: 'servicio', header: 'Servicio / CUPS', width: 260 },
          { key: 'motivo', header: 'Motivo', width: 290 }
        ],
        (payload.interconsulta.serviciosRemitidos || []).map((s: any, i: number) => ({
          n: i + 1,
          servicio: s.descripcionCups || s.servicio || '',
          motivo: s.motivo || ''
        }))
      );
    }

    if (payload.medico?.nombreCompleto) {
      addSectionTitle(doc, 'Profesional de la salud');
      ensureSpace(doc, 100, headerTitle);
      if (payload.medico.firmaImageBuffer && payload.medico.firmaImageBuffer.length > 0) {
        try {
          const y0 = doc.y;
          doc.image(payload.medico.firmaImageBuffer, MARGIN, y0, {
            fit: [140, 56],
            align: 'left'
          });
          doc.y = y0 + 62;
        } catch (err) {
          console.warn('[PDF] No se pudo incrustar firma del médico:', err);
        }
      }
      doc.font('Helvetica').fontSize(10).fillColor('#111827').text(payload.medico.nombreCompleto);
      if (payload.medico.numeroColegiatura) {
        doc.font('Helvetica').fontSize(9).text(`Registro / TP: ${payload.medico.numeroColegiatura}`);
      }
      doc.moveDown(0.5);
      doc
        .font('Helvetica-Oblique')
        .fontSize(8)
        .fillColor('#4B5563')
        .text(
          'Documento generado electrónicamente en Crisal-iA. La firma reproduida tiene validez según la normativa aplicable y la política institucional.',
          { width: getPageWidth(doc) - MARGIN * 2 }
        );
    }

    // Nota: evitamos doc.addPage() manual para prevenir hojas en blanco.
    // El footer se agrega automáticamente con setupPageFooter
    doc.end();
  });
}
