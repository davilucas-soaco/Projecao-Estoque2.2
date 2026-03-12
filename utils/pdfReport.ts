import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ProductConsolidated, ComponentData, DateColumn } from '../types';
import {
  itemHasPedidoInSupervisaoCategorias,
  getSupervisaoCellForItem,
  ROUTE_SO_MOVEIS,
  SUPERVISAO_SO_MOVEIS,
  SUPERVISAO_ENTREGA_GT,
  SUPERVISAO_RETIRADA,
} from '../utils';

const PRIMARY = '#041126';
const SECONDARY = '#1E22AA';
const HIGHLIGHT = '#FFAD00';
const FONT_AMARELO = [248, 182, 53] as const;
const BG_AMARELO_CLARO = [255, 237, 214] as const;
const SPECIAL_HORIZON_DAYS = 13;
const SPECIAL_KEYS_FOR_HORIZON = new Set<string>([
  ROUTE_SO_MOVEIS,
  SUPERVISAO_SO_MOVEIS,
  SUPERVISAO_ENTREGA_GT,
  SUPERVISAO_RETIRADA,
]);

interface ColOption {
  key: string;
  label: string;
  isSoMoveis: boolean;
}

interface GeneratePdfOptions {
  data: ProductConsolidated[];
  visibleColumns: ColOption[];
  horizonLabel: string;
  companyLogo: string | null;
  currentUserName: string;
  reportTitle: string;
  orientation: 'p' | 'l';
}

interface SpecialHorizonContext {
  allowedDateKeys: Set<string>;
  label: string;
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

type PdfRowItem = ProductConsolidated | ComponentData;

function compareByDescricaoAsc(a: PdfRowItem, b: PdfRowItem): number {
  const descA = String(a.descricao ?? '').trim();
  const descB = String(b.descricao ?? '').trim();
  const byDesc = descA.localeCompare(descB, 'pt-BR', { sensitivity: 'base' });
  if (byDesc !== 0) return byDesc;
  return String(a.codigo ?? '').localeCompare(String(b.codigo ?? ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
}

function formatDateShortBR(date: Date): string {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function isDateKeyInRange(key: string, start: Date, end: Date): boolean {
  if (!DATE_KEY_RE.test(key)) return false;
  const d = new Date(`${key}T00:00:00`);
  if (Number.isNaN(d.getTime())) return false;
  return d >= start && d <= end;
}

function buildSpecialHorizonContext(data: ProductConsolidated[]): SpecialHorizonContext {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(today.getDate() + SPECIAL_HORIZON_DAYS);
  const allowedDateKeys = new Set<string>();

  const addItemKeys = (item: ProductConsolidated | ComponentData) => {
    for (const key of Object.keys(item.routeData ?? {})) {
      if (key === 'ATRASADOS') {
        allowedDateKeys.add(key);
        continue;
      }
      if (DATE_KEY_RE.test(key)) {
        const d = new Date(`${key}T00:00:00`);
        if (!Number.isNaN(d.getTime()) && d <= end) {
          allowedDateKeys.add(key);
        }
        continue;
      }
      if (isDateKeyInRange(key, today, end)) {
        allowedDateKeys.add(key);
      }
    }
  };

  for (const item of data) {
    addItemKeys(item);
    if (item.isShelf && item.components) {
      for (const comp of item.components) addItemKeys(comp);
    }
  }

  return {
    allowedDateKeys,
    label: `${formatDateShortBR(today)} a ${formatDateShortBR(end)}`,
  };
}

/** Constrói allowedDateKeys para supervisão com base no horizonte ativo do relatório.
 * Quando maxHorizonEndDate é informado, usa-o como limite superior (última data das rotas/colunas selecionadas).
 * Caso contrário, usa hoje+13 como fallback. */
function buildSpecialHorizonContextFromDateColumns(
  dateColumns: DateColumn[],
  data: ProductConsolidated[],
  todayStartOverride?: Date,
  maxHorizonEndDate?: Date
): SpecialHorizonContext {
  const start = todayStartOverride ? new Date(todayStartOverride) : new Date();
  start.setHours(0, 0, 0, 0);
  const fallbackEnd = new Date(start);
  fallbackEnd.setDate(start.getDate() + SPECIAL_HORIZON_DAYS);
  fallbackEnd.setHours(0, 0, 0, 0);
  const end = maxHorizonEndDate
    ? (() => {
        const d = new Date(maxHorizonEndDate);
        d.setHours(0, 0, 0, 0);
        return d;
      })()
    : fallbackEnd;
  const allowedDateKeys = new Set<string>(['ATRASADOS']);

  for (const col of dateColumns) {
    if (col.isAtrasados) continue;
    if (col.date && col.date <= end) allowedDateKeys.add(col.key);
  }

  for (const item of data) {
    const addKeys = (obj: ProductConsolidated | ComponentData) => {
      for (const key of Object.keys(obj.routeData ?? {})) {
        if (key === 'ATRASADOS') {
          allowedDateKeys.add(key);
          continue;
        }
        if (DATE_KEY_RE.test(key)) {
          const d = new Date(`${key}T00:00:00`);
          if (!Number.isNaN(d.getTime()) && d <= end) allowedDateKeys.add(key);
        }
      }
    };
    addKeys(item);
    if (item.isShelf && item.components) {
      for (const comp of item.components) addKeys(comp);
    }
  }

  return {
    allowedDateKeys,
    label: `${formatDateShortBR(start)} a ${formatDateShortBR(end)}`,
  };
}

function isSpecialHorizonColumn(key: string): boolean {
  return SPECIAL_KEYS_FOR_HORIZON.has(key);
}

const formatCellNum = (v: unknown): string => {
  if (v === undefined || v === null) return '-';
  const n = Number(v);
  if (Number.isNaN(n) || n === 0) return '-';
  return String(Math.round(n));
};

/** Formata par P/F de supervisão: se P exibir '-', F também exibe '-' na mesma coluna. */
const formatSupervisaoPF = (pedido: number, falta: number): [string, string] => {
  const pStr = formatCellNum(pedido);
  if (pStr === '-') return ['-', '-'];
  const pNum = Math.max(0, Math.round(Number(pedido) || 0));
  const fNum = Math.round(Number(falta) || 0);
  const fClamped = pNum === 0 ? 0 : Math.max(fNum, -pNum);
  const fStr = formatCellNum(fClamped);
  return [pStr, fStr];
};

/** Quebra descrição em linhas para largura fixa (aprox. 35 caracteres por linha) */
const wrapDescription = (text: string, maxChars = 35): string[] => {
  if (!text || text.length <= maxChars) return [text || ''];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if (current.length + w.length + 1 <= maxChars) {
      current = current ? `${current} ${w}` : w;
    } else {
      if (current) lines.push(current);
      current = w.length > maxChars ? w.slice(0, maxChars) : w;
    }
  }
  if (current) lines.push(current);
  return lines;
};

/** Estima quantas colunas de data cabem por página (cada data = 2 subcolunas P e F) */
const getDateColsPerPage = (orientation: 'p' | 'l'): number => {
  const isLandscape = orientation === 'l';
  const pageWidth = isLandscape ? 842 : 595;
  const margin = 40;
  const usable = pageWidth - margin * 2;
  const fixedColsWidth = 180;
  const remaining = usable - fixedColsWidth;
  const twoColWidth = 44;
  return Math.max(1, Math.floor(remaining / twoColWidth));
};

const PDF_FILE_PREFIX = {
  base: 'Projecao_Estoque',
  v2: 'Projecao_Estoque_V2',
  v3: 'Projecao_Estoque_V3',
  v2Supervisao: 'Projecao_Estoque_V2_Supervisao',
} as const;

function buildPdfFileName(prefix: keyof typeof PDF_FILE_PREFIX): string {
  const day = new Date().toISOString().slice(0, 10);
  return `${PDF_FILE_PREFIX[prefix]}_${day}.pdf`;
}

export async function generateProjectionPdf(options: GeneratePdfOptions): Promise<void> {
  const {
    data,
    visibleColumns,
    horizonLabel,
    companyLogo,
    currentUserName,
    reportTitle,
    orientation,
  } = options;

  const doc = new jsPDF({
    orientation,
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const headerHeight = 85;
  let startY = margin;

  const addHeader = (continuationLabel?: string) => {
    doc.setFillColor(4, 17, 38);
    doc.rect(0, 0, pageWidth, headerHeight, 'F');

    let x = margin;
    if (companyLogo) {
      try {
        const imgW = 60;
        const imgH = 30;
        doc.addImage(companyLogo, 'PNG', x, 15, imgW, imgH);
        x += imgW + 15;
      } catch {
        x = margin;
      }
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(reportTitle + (continuationLabel ? ` — ${continuationLabel}` : ''), x, 35);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const now = new Date();
    const dateStr = now.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    doc.text(`Emissão: ${dateStr} | Usuário: ${currentUserName}`, x, 50);
    doc.setFontSize(8);
    doc.text(horizonLabel, x, 62);

    startY = headerHeight + 15;
  };

  addHeader();

  const dateColsPerPage = getDateColsPerPage(orientation);
  const colChunks: ColOption[][] = [];
  for (let i = 0; i < visibleColumns.length; i += dateColsPerPage) {
    colChunks.push(visibleColumns.slice(i, i + dateColsPerPage));
  }

  const selectedKeys = new Set(visibleColumns.map((c) => c.key));
  const dataFiltered = data.filter((item) => {
        const itemHasPedido = Object.entries(item.routeData).some(
          ([key, value]) => selectedKeys.has(key) && (value?.pedido || 0) > 0
        );
        if (itemHasPedido) return true;
        if (item.isShelf && item.components) {
          return item.components.some((comp) =>
            Object.entries(comp.routeData).some(
              ([key, value]) => selectedKeys.has(key) && (value?.pedido || 0) > 0
            )
          );
        }
        return false;
      });

  const flattenRows = (): Array<ProductConsolidated | ComponentData> => {
    const rows: Array<ProductConsolidated | ComponentData> = [];
    for (const item of dataFiltered) {
      rows.push(item);
      if (item.isShelf && item.components) {
        for (const comp of item.components) {
          rows.push(comp);
        }
      }
    }
    return rows;
  };

  const allRows = flattenRows().sort(compareByDescricaoAsc);

  for (let chunkIdx = 0; chunkIdx < colChunks.length; chunkIdx++) {
    const cols = colChunks[chunkIdx];
    const isFirstChunk = chunkIdx === 0;
    const isContinuation = chunkIdx > 0;

    if (isContinuation) {
      doc.addPage(orientation === 'l' ? 'a4' : 'a4', orientation);
      addHeader(`Continuação ${chunkIdx + 1}/${colChunks.length}`);
    }

    const head: (string | { content: string; colSpan: number })[][] = [
      [
        'Código',
        'Descrição',
        'Estoque',
        'Pedido',
        'Falta',
        ...cols.map((c) => ({ content: c.label, colSpan: 2 })),
      ],
      [
        '',
        '',
        '',
        '',
        '',
        ...cols.flatMap(() => ['P', 'F']),
      ],
    ];

    const body: string[][] = [];
    for (const item of allRows) {
      const isComponent = 'falta' in item && !('isShelf' in item);
      const codigo = isComponent ? `  └ ${item.codigo}` : item.codigo;
      const descLines = wrapDescription(item.descricao);
      const descCell = descLines.join('\n');
      const isShelf = 'isShelf' in item && (item as ProductConsolidated).isShelf === true;
      const estoque = isShelf ? '-' : String(item.estoqueAtual);
      const pedido = item.totalPedido === 0 ? '-' : String(item.totalPedido);
      const pendente =
        isShelf
          ? '-'
          : 'pendenteProducao' in item
            ? (item as ProductConsolidated).pendenteProducao
            : (item as ComponentData).falta;
      const falta = pendente !== '-' && pendente < 0 ? String(pendente) : '-';

      const row: string[] = [codigo, descCell, estoque, pedido, falta];
      for (const col of cols) {
        const rd = item.routeData[col.key] || { pedido: 0, falta: 0 };
        row.push(formatCellNum(rd.pedido), formatCellNum(rd.falta));
      }
      body.push(row);
    }

    autoTable(doc, {
      head,
      body,
      startY,
      margin: { left: margin, right: margin },
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: {
        fillColor: PRIMARY,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 6,
      },
      columnStyles: (() => {
        const s: Record<string, object> = {
          0: { cellWidth: 42, fontStyle: 'bold' },
          1: { cellWidth: 90 },
          2: { cellWidth: 28, halign: 'center' },
          3: { cellWidth: 28, halign: 'center' },
          4: { cellWidth: 28, halign: 'center' },
        };
        for (let i = 5; i < 5 + cols.length * 2; i++) {
          s[String(i)] = { cellWidth: 22, halign: 'center' };
        }
        return s;
      })(),
      didParseCell: ((cellData: { column: { index: number }; row: { index: number }; section: string; cell: { styles: Record<string, unknown> } }) => {
        const colIndex = cellData.column.index;
        if (colIndex >= 5) {
          cellData.cell.styles.halign = 'center';
        }
        if (cellData.section === 'body') {
          const rowIdx = cellData.row.index;
          const item = allRows[rowIdx];
          const isShelf = item && 'isShelf' in item && (item as ProductConsolidated).isShelf === true;
          if (item && !isShelf && colIndex === 2 && item.estoqueAtual < 0) {
            cellData.cell.styles.textColor = [220, 38, 38];
          }
          if (item && !isShelf && colIndex === 4) {
            const pend =
              'pendenteProducao' in item
                ? (item as ProductConsolidated).pendenteProducao
                : (item as ComponentData).falta;
            if (pend < 0) {
              cellData.cell.styles.textColor = [245, 158, 11];
            }
          }
          if (colIndex >= 5) {
            const routeIdx = Math.floor((colIndex - 5) / 2);
            const colKey = cols[routeIdx]?.key;
            if (colKey && item) {
              const rd = item.routeData[colKey];
              const faltaVal = rd?.falta ?? 0;
              if (faltaVal < 0 && colIndex % 2 === 1) {
                cellData.cell.styles.textColor = [245, 158, 11];
                cellData.cell.styles.fillColor = [255, 237, 213];
              }
            }
          }
        }
      }) as any,
      showHead: 'everyPage',
      pageBreak: 'auto',
      rowPageBreak: 'auto',
    });

    const finalY = (doc as any).lastAutoTable?.finalY ?? startY;
    if (finalY < pageHeight - 40 && chunkIdx < colChunks.length - 1) {
      startY = margin;
    }
  }

  const fileName = buildPdfFileName('base');
  doc.save(fileName);
}

interface GeneratePdfV2Options {
  data: ProductConsolidated[];
  visibleColumns: ColOption[];
  horizonLabel: string;
  companyLogo: string | null;
  currentUserName: string;
  reportTitle: string;
}

export async function generateProjectionPdfV2(options: GeneratePdfV2Options): Promise<void> {
  const { data, visibleColumns, horizonLabel, companyLogo, currentUserName, reportTitle } = options;

  const doc = new jsPDF({
    orientation: 'p',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 25;
  const headerHeight = 80;
  let startY = margin;

  const addHeader = () => {
    doc.setFillColor(4, 17, 38);
    doc.rect(0, 0, pageWidth, headerHeight, 'F');

    const logoWidth = 50;
    const logoHeight = 28;
    const logoTop = (headerHeight - logoHeight) / 2;
    const logoTextGap = 24;
    const textStartX = companyLogo ? margin + logoWidth + logoTextGap : margin;

    if (companyLogo) {
      try {
        doc.addImage(companyLogo, 'PNG', margin, logoTop, logoWidth, logoHeight);
      } catch {
        // ignora se falhar
      }
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(reportTitle, textStartX, logoTop + 8);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const now = new Date();
    doc.text(
      `Emissão: ${now.toLocaleString('pt-BR')} | Usuário: ${currentUserName} | ${horizonLabel}`,
      textStartX,
      logoTop + 22
    );
    if (appliedFilters && appliedFilters.trim()) {
      doc.text(appliedFilters.trim(), textStartX, logoTop + 34);
    }

    startY = headerHeight + 12;
  };

  addHeader();

  const specialHorizon = buildSpecialHorizonContext(data);
  const getCellForColumn = (item: ProductConsolidated | ComponentData, colKey: string) => {
    if (isSpecialHorizonColumn(colKey)) {
      return getSupervisaoCellForItem(item, colKey, {
        allowedDateKeys: specialHorizon.allowedDateKeys,
        limitSpecialToAllowedDates: true,
      });
    }
    const rd = item.routeData[colKey] || { pedido: 0, falta: 0 };
    return { pedido: rd.pedido ?? 0, falta: rd.falta ?? 0 };
  };

  const selectedKeys = new Set(visibleColumns.map((c) => c.key));
  const dataFiltered = data.filter((item) => {
    const itemHasPedido = Array.from(selectedKeys).some((key) => getCellForColumn(item, key).pedido > 0);
    if (itemHasPedido) return true;
    if (item.isShelf && item.components) {
      return item.components.some((comp) => Array.from(selectedKeys).some((key) => getCellForColumn(comp, key).pedido > 0));
    }
    return false;
  });

  const wrapDesc = (text: string, maxChars = 55): string => {
    if (!text || text.length <= maxChars) return text || '';
    const words = text.split(/\s+/);
    let current = '';
    const lines: string[] = [];
    for (const w of words) {
      if (current.length + w.length + 1 <= maxChars) {
        current = current ? `${current} ${w}` : w;
      } else {
        if (current) lines.push(current);
        current = w.length > maxChars ? w.slice(0, maxChars) : w;
      }
    }
    if (current) lines.push(current);
    return lines.join('\n');
  };

  const head = [['Código', 'Produto', 'Estoque', 'Pedido', 'Falta', 'Status']];

  for (const col of visibleColumns) {
    const itemsForCol: Array<ProductConsolidated | ComponentData> = [];
    for (const item of dataFiltered) {
      const rd = item.routeData[col.key];
      const pedido = rd?.pedido ?? 0;
      if (pedido > 0) {
        itemsForCol.push(item);
      }
      if (item.isShelf && item.components) {
        for (const comp of item.components) {
          const cRd = comp.routeData[col.key];
          if ((cRd?.pedido ?? 0) > 0) itemsForCol.push(comp);
        }
      }
    }

    if (itemsForCol.length === 0) continue;

    itemsForCol.sort(compareByDescricaoAsc);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(4, 17, 38);
    const isSpecial = isSpecialHorizonColumn(col.key);
    const colLabel = isSpecial ? `${col.label} (${specialHorizon.label})` : col.label;
    doc.text(colLabel, margin, startY);
    startY += 14;

    const body: string[][] = [];
    for (const item of itemsForCol) {
      const rd = getCellForColumn(item, col.key);
      const isComponent = 'falta' in item && !('isShelf' in item);
      const codigo = isComponent ? `  └ ${item.codigo}` : item.codigo;
      const produto = wrapDesc(item.descricao);
      const estoque = 'isShelf' in item && (item as ProductConsolidated).isShelf ? '-' : String(item.estoqueAtual);
      const pedido = formatCellNum(rd.pedido);
      const falta = formatCellNum(rd.falta);
      const faltaNum = rd.falta ?? 0;
      const status = faltaNum === 0 ? 'Em estoque' : 'Falta';
      body.push([codigo, produto, estoque, pedido, falta, status]);
    }

    const tableMargin = margin;
    const usableWidth = pageWidth - tableMargin * 2;
    const colWidths = {
      0: 48,
      1: Math.floor(usableWidth * 0.45),
      2: 36,
      3: 36,
      4: 36,
      5: 58,
    };
    const totalColWidth = colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + colWidths[4] + colWidths[5];
    colWidths[1] = colWidths[1] + (usableWidth - totalColWidth);

    autoTable(doc, {
      head,
      body,
      startY,
      margin: { left: tableMargin, right: tableMargin },
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: {
        fillColor: PRIMARY,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8,
      },
      columnStyles: {
        0: { cellWidth: colWidths[0], fontStyle: 'bold' },
        1: { cellWidth: colWidths[1] },
        2: { cellWidth: colWidths[2], halign: 'center' },
        3: { cellWidth: colWidths[3], halign: 'center' },
        4: { cellWidth: colWidths[4], halign: 'center' },
        5: { cellWidth: colWidths[5], halign: 'center' },
      },
      didParseCell: ((cellData: {
        column: { index: number };
        row: { index: number };
        section: string;
        cell: { styles: Record<string, unknown> };
      }) => {
        if (cellData.section === 'body') {
          const rowIdx = cellData.row.index;
          const item = itemsForCol[rowIdx];
          const rd = item ? getCellForColumn(item, col.key) : { pedido: 0, falta: 0 };
          const faltaVal = rd.falta ?? 0;
          if (cellData.column.index === 2 && item && !('isShelf' in item ? (item as ProductConsolidated).isShelf : false)) {
            if (item.estoqueAtual < 0) {
              cellData.cell.styles.textColor = [220, 38, 38];
            }
          }
          if (cellData.column.index === 4 && faltaVal < 0) {
            cellData.cell.styles.textColor = [220, 38, 38];
          }
          if (cellData.column.index === 5) {
            if (faltaVal === 0) {
              cellData.cell.styles.textColor = [34, 197, 94];
            } else {
              cellData.cell.styles.textColor = [220, 38, 38];
            }
          }
        }
      }) as any,
      showHead: 'everyPage',
      pageBreak: 'auto',
      rowPageBreak: 'auto',
    });

    startY = (doc as any).lastAutoTable?.finalY ?? startY;
    startY += 18;

    if (startY > pageHeight - 60) {
      doc.addPage('a4', 'p');
      addHeader();
      startY = headerHeight + 12;
    }
  }

  const fileName = buildPdfFileName('v2');
  doc.save(fileName);
}

interface GeneratePdfV3Options {
  data: ProductConsolidated[];
  visibleColumns: ColOption[];
  horizonLabel: string;
  companyLogo: string | null;
  currentUserName: string;
  reportTitle: string;
  orientation: 'p' | 'l';
  /** Linha opcional abaixo de Emissão/Usuário/Horizonte evidenciando filtros aplicados */
  appliedFilters?: string;
}

export async function generateProjectionPdfV3(options: GeneratePdfV3Options): Promise<void> {
  const {
    data,
    visibleColumns,
    horizonLabel,
    companyLogo,
    currentUserName,
    reportTitle,
    orientation,
    appliedFilters,
  } = options;

  const doc = new jsPDF({
    orientation,
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 25;
  const headerHeight = 92;
  let startY = margin;

  const addHeader = (continuationLabel?: string) => {
    doc.setFillColor(4, 17, 38);
    doc.rect(0, 0, pageWidth, headerHeight, 'F');

    const logoWidth = 50;
    const logoHeight = 28;
    const logoTop = (headerHeight - logoHeight) / 2 - 6;
    const logoTextGap = 24;
    const textStartX = companyLogo ? margin + logoWidth + logoTextGap : margin;

    if (companyLogo) {
      try {
        doc.addImage(companyLogo, 'PNG', margin, logoTop, logoWidth, logoHeight);
      } catch {
        // ignora erro da imagem
      }
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(reportTitle + (continuationLabel ? ` — ${continuationLabel}` : ''), textStartX, logoTop + 8);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const now = new Date();
    doc.text(
      `Emissão: ${now.toLocaleString('pt-BR')} | Usuário: ${currentUserName} | ${horizonLabel}`,
      textStartX,
      logoTop + 22
    );
    doc.setFontSize(7);
    const configText = (appliedFilters ?? '').trim();
    if (configText) {
      const configLines = configText.split('\n');
      let configY = logoTop + 34;
      for (const line of configLines) {
        doc.text(line, textStartX, configY);
        configY += 9;
      }
    } else {
      doc.text('Configurações do PDF: Nenhum', textStartX, logoTop + 34);
    }

    startY = headerHeight + 12;
  };

  addHeader();

  const specialHorizon = buildSpecialHorizonContext(data);
  const getCellForColumn = (item: ProductConsolidated | ComponentData, colKey: string) => {
    if (isSpecialHorizonColumn(colKey)) {
      return getSupervisaoCellForItem(item, colKey, {
        allowedDateKeys: specialHorizon.allowedDateKeys,
        limitSpecialToAllowedDates: true,
      });
    }
    const rd = item.routeData[colKey] || { pedido: 0, falta: 0 };
    return { pedido: rd.pedido ?? 0, falta: rd.falta ?? 0 };
  };

  const selectedKeys = new Set(visibleColumns.map((c) => c.key));
  const dataFiltered = data.filter((item) => {
    const itemHasPedido = Array.from(selectedKeys).some((key) => getCellForColumn(item, key).pedido > 0);
    if (itemHasPedido) return true;
    if (item.isShelf && item.components) {
      return item.components.some((comp) => Array.from(selectedKeys).some((key) => getCellForColumn(comp, key).pedido > 0));
    }
    return false;
  });

  const flattenRows = (): Array<ProductConsolidated | ComponentData> => {
    const rows: Array<ProductConsolidated | ComponentData> = [];
    for (const item of dataFiltered) {
      rows.push(item);
      if (item.isShelf && item.components) {
        for (const comp of item.components) rows.push(comp);
      }
    }
    return rows;
  };

  const allRows = flattenRows().sort(compareByDescricaoAsc);

  const isLandscape = orientation === 'l';
  const dateColsPerPage = Math.max(1, isLandscape ? visibleColumns.length : Math.min(visibleColumns.length, 10));
  const colChunks: ColOption[][] = [];
  for (let i = 0; i < visibleColumns.length; i += dateColsPerPage) {
    colChunks.push(visibleColumns.slice(i, i + dateColsPerPage));
  }

  for (let chunkIdx = 0; chunkIdx < colChunks.length; chunkIdx++) {
    const cols = colChunks[chunkIdx];
    if (chunkIdx > 0) {
      doc.addPage(orientation === 'l' ? 'a4' : 'a4', orientation);
      addHeader(`Continuação ${chunkIdx + 1}/${colChunks.length}`);
    }

    const head: (string | { content: string; colSpan: number })[][] = [
      [
        'Código',
        'Descrição',
        'Estoque',
        'Pedido',
        'Falta',
        ...cols.map((c) => ({
          content: isSpecialHorizonColumn(c.key) ? `${c.label}\n${specialHorizon.label}` : c.label,
          colSpan: 2,
        })),
      ],
      [
        '',
        '',
        '',
        '',
        '',
        ...cols.flatMap(() => ['P', 'F']),
      ],
    ];

    const body: string[][] = [];
    for (const item of allRows) {
      const isComponent = 'falta' in item && !('isShelf' in item);
      const codigo = isComponent ? `  └ ${item.codigo}` : item.codigo;
      const isShelf = 'isShelf' in item && (item as ProductConsolidated).isShelf === true;
      const estoque = isShelf ? '-' : String(item.estoqueAtual);
      const pedido = item.totalPedido === 0 ? '-' : String(item.totalPedido);
      const pendente =
        isShelf
          ? '-'
          : 'pendenteProducao' in item
            ? (item as ProductConsolidated).pendenteProducao
            : (item as ComponentData).falta;
      const falta = pendente !== '-' && pendente < 0 ? String(pendente) : '-';

      const row: string[] = [codigo, item.descricao, estoque, pedido, falta];
      for (const col of cols) {
        const rd = getCellForColumn(item, col.key);
        row.push(formatCellNum(rd.pedido), formatCellNum(rd.falta));
      }
      body.push(row);
    }

    const tableMargin = margin;
    const usableWidth = pageWidth - tableMargin * 2;
    const pairCount = Math.max(1, cols.length);

    const codeWidth = usableWidth * 0.1;
    const estoqueWidth = usableWidth * 0.07;
    const pedidoWidth = usableWidth * 0.07;
    const faltaWidth = usableWidth * 0.07;
    const baseRemaining = usableWidth - (codeWidth + estoqueWidth + pedidoWidth + faltaWidth);

    const descBias =
      pairCount <= 3 ? 0.62 :
      pairCount <= 7 ? 0.52 :
      0.42;

    const minDescWidth = usableWidth * 0.2;
    const minSubColWidth = usableWidth * 0.026;

    let descWidth = baseRemaining * descBias;
    let subColWidth = (baseRemaining - descWidth) / (pairCount * 2);

    if (subColWidth < minSubColWidth) {
      subColWidth = minSubColWidth;
      descWidth = Math.max(minDescWidth, baseRemaining - subColWidth * pairCount * 2);
    }
    if (descWidth < minDescWidth) {
      descWidth = minDescWidth;
      subColWidth = Math.max(minSubColWidth, (baseRemaining - descWidth) / (pairCount * 2));
    }

    const descChars = Math.max(18, Math.floor(descWidth / 5.1));
    const bodyResponsive = body.map((row) => {
      const wrapped = wrapDescription(row[1], descChars).join('\n');
      const next = [...row];
      next[1] = wrapped;
      return next;
    });

    autoTable(doc, {
      head,
      body: bodyResponsive,
      startY,
      margin: { left: tableMargin, right: tableMargin },
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: {
        fillColor: PRIMARY,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7,
      },
      columnStyles: (() => {
        const s: Record<string, object> = {
          0: { cellWidth: codeWidth, fontStyle: 'bold' },
          1: { cellWidth: descWidth },
          2: { cellWidth: estoqueWidth, halign: 'center' },
          3: { cellWidth: pedidoWidth, halign: 'center' },
          4: { cellWidth: faltaWidth, halign: 'center' },
        };
        for (let i = 5; i < 5 + pairCount * 2; i++) {
          s[String(i)] = { cellWidth: subColWidth, halign: 'center' };
        }
        return s;
      })(),
      didParseCell: ((cellData: { column: { index: number }; row: { index: number }; section: string; cell: { styles: Record<string, unknown> } }) => {
        const colIndex = cellData.column.index;
        if (colIndex >= 5) cellData.cell.styles.halign = 'center';
        if (cellData.section === 'body') {
          const rowIdx = cellData.row.index;
          const item = allRows[rowIdx];
          const isShelf = item && 'isShelf' in item && (item as ProductConsolidated).isShelf === true;
          if (item && !isShelf && colIndex === 2 && item.estoqueAtual < 0) {
            cellData.cell.styles.textColor = [220, 38, 38];
          }
          if (item && !isShelf && colIndex === 4) {
            const pend =
              'pendenteProducao' in item
                ? (item as ProductConsolidated).pendenteProducao
                : (item as ComponentData).falta;
            if (pend < 0) cellData.cell.styles.textColor = FONT_AMARELO;
          }
          if (colIndex >= 5) {
            const routeIdx = Math.floor((colIndex - 5) / 2);
            const colKey = cols[routeIdx]?.key;
            if (colKey && item) {
              const rd = getCellForColumn(item, colKey);
              const pedidoVal = rd.pedido ?? 0;
              const faltaVal = rd.falta ?? 0;
              if (colIndex % 2 === 0) {
                if (pedidoVal > 0) {
                  cellData.cell.styles.fillColor = BG_AMARELO_CLARO;
                  cellData.cell.styles.textColor = FONT_AMARELO;
                }
              } else if (faltaVal < 0) {
                cellData.cell.styles.textColor = FONT_AMARELO;
              }
            }
          }
        }
      }) as any,
      showHead: 'everyPage',
      pageBreak: 'auto',
      rowPageBreak: 'auto',
    });
  }

  const fileName = buildPdfFileName('v3');
  doc.save(fileName);
}

interface SupervisaoColOption {
  key: string;
  label: string;
}

interface GeneratePdfV3SupervisaoOptions {
  data: ProductConsolidated[];
  visibleColumns: SupervisaoColOption[];
  filtroResultado: 'faltantes' | 'estoque' | 'todos';
  horizonLabel: string;
  companyLogo: string | null;
  currentUserName: string;
  reportTitle: string;
  orientation: 'p' | 'l';
  dateColumns?: DateColumn[];
  todayStart?: Date;
  /** Linha opcional abaixo de Emissão/Usuário/Horizonte evidenciando filtros aplicados */
  appliedFilters?: string;
  /** Data final do horizonte de consumo para categorias especiais (Só Móveis, Entrega GT, Retirada). Se informada, limita o consumo à última data das rotas/colunas selecionadas. */
  maxHorizonEndDate?: Date;
}

export async function generateProjectionPdfV2Supervisao(options: GeneratePdfV3SupervisaoOptions): Promise<void> {
  const {
    data,
    visibleColumns,
    filtroResultado,
    horizonLabel,
    companyLogo,
    currentUserName,
    reportTitle,
    orientation,
    dateColumns,
    todayStart,
    appliedFilters,
    maxHorizonEndDate,
  } = options;

  const doc = new jsPDF({
    orientation,
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 25;
  const headerHeight = 92;
  let startY = margin;

  const addHeader = (continuationLabel?: string) => {
    doc.setFillColor(4, 17, 38);
    doc.rect(0, 0, pageWidth, headerHeight, 'F');

    const logoWidth = 50;
    const logoHeight = 28;
    const logoTop = (headerHeight - logoHeight) / 2 - 6;
    const logoTextGap = 24;
    const textStartX = companyLogo ? margin + logoWidth + logoTextGap : margin;

    if (companyLogo) {
      try {
        doc.addImage(companyLogo, 'PNG', margin, logoTop, logoWidth, logoHeight);
      } catch {
        // ignora erro da imagem
      }
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(reportTitle + (continuationLabel ? ` — ${continuationLabel}` : ''), textStartX, logoTop + 8);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const now = new Date();
    doc.text(
      `Emissão: ${now.toLocaleString('pt-BR')} | Usuário: ${currentUserName} | ${horizonLabel}`,
      textStartX,
      logoTop + 22
    );
    doc.setFontSize(7);
    const configText = (appliedFilters ?? '').trim() || 'Configurações do PDF: Nenhum';
    const configLines = configText.split('\n');
    const lineHeight = 9;
    configLines.forEach((line, i) => {
      doc.text(line.trim(), textStartX, logoTop + 34 + i * lineHeight);
    });

    startY = headerHeight + 12;
  };

  addHeader();

  const specialHorizon =
    dateColumns && dateColumns.length > 0
      ? buildSpecialHorizonContextFromDateColumns(dateColumns, data, todayStart, maxHorizonEndDate)
      : buildSpecialHorizonContext(data);
  const getSupervisaoCell = (item: ProductConsolidated | ComponentData, colKey: string) =>
    getSupervisaoCellForItem(item, colKey, {
      allowedDateKeys: specialHorizon.allowedDateKeys,
      limitSpecialToAllowedDates: isSpecialHorizonColumn(colKey),
    });

  const getCellMetrics = (cell: { pedido: number; falta: number }) => {
    const pedido = Math.max(0, Math.round(cell.pedido || 0));
    const falta = Math.min(0, Math.round(cell.falta || 0));
    const faltante = Math.max(0, -falta);
    const atendido = Math.max(0, pedido - faltante);
    return { pedido, falta, faltante, atendido };
  };

  const getDisplayedCell = (cell: { pedido: number; falta: number }) => {
    const m = getCellMetrics(cell);
    return { pedido: m.pedido, falta: m.falta };
  };

  const getStatusFromMetrics = (m: { faltante: number; atendido: number }) => {
    if (m.faltante > 0 && m.atendido > 0) return 'Parcial';
    if (m.faltante > 0) return 'Faltando';
    return 'Em Estoque';
  };

  const matchesResultadoFilter = (m: { faltante: number; atendido: number }) => {
    const status = getStatusFromMetrics(m);
    if (filtroResultado === 'faltantes') return status === 'Faltando' || status === 'Parcial';
    if (filtroResultado === 'estoque') return m.atendido > 0;
    return true;
  };

  const flattenRows = (): Array<ProductConsolidated | ComponentData> => {
    const rows: Array<ProductConsolidated | ComponentData> = [];
    for (const item of data) {
      rows.push(item);
      if (item.isShelf && item.components) {
        for (const comp of item.components) rows.push(comp);
      }
    }
    return rows;
  };

  const allRows = flattenRows();

  const cols = visibleColumns;
  const colChunks: SupervisaoColOption[][] = [];
  for (let i = 0; i < cols.length; i++) {
    colChunks.push(cols.slice(0, i + 1));
  }

  for (let chunkIdx = 0; chunkIdx < colChunks.length; chunkIdx++) {
    const chunkCols = colChunks[chunkIdx];
    const principalCol = chunkCols[chunkCols.length - 1];
    const colsBeforePrincipal = chunkCols.slice(0, -1);
    const pageSelectedKeys = new Set(chunkCols.map((c) => c.key));
    const dataFiltered = allRows
      .filter((item) => {
        if (
          !itemHasPedidoInSupervisaoCategorias(item, pageSelectedKeys, {
            allowedDateKeys: specialHorizon.allowedDateKeys,
            limitSpecialToAllowedDates: true,
          })
        ) {
          return false;
        }
        const principal = getCellMetrics(getSupervisaoCell(item, principalCol.key));
        if (!matchesResultadoFilter(principal)) return false;
        return true;
      })
      .sort(compareByDescricaoAsc);

    if (chunkIdx > 0) {
      doc.addPage(orientation === 'l' ? 'a4' : 'a4', orientation);
      addHeader(`Continuação ${chunkIdx + 1}/${colChunks.length}`);
    }

    const headRow1: (string | { content: string; colSpan: number })[] = [
      'Código',
      'Descrição',
      'Estoque',
      'Pedido',
      'Falta',
      ...colsBeforePrincipal.map((c) => ({
        content: isSpecialHorizonColumn(c.key) ? `${c.label}\n${specialHorizon.label}` : c.label,
        colSpan: 2,
      })),
    ];
    const headRow2: string[] = ['', '', '', '', '', ...colsBeforePrincipal.flatMap(() => ['P', 'F'])];
    headRow1.push(
      {
        content: isSpecialHorizonColumn(principalCol.key)
          ? `${principalCol.label}\n${specialHorizon.label}`
          : principalCol.label,
        colSpan: 2,
      },
      'Status'
    );
    headRow2.push('P', 'F', '');

    const head: (string | { content: string; colSpan: number })[][] = [headRow1, headRow2];

    const body: string[][] = [];
    for (const item of dataFiltered) {
      const isComponent = 'falta' in item && !('isShelf' in item);
      const codigo = isComponent ? `  └ ${item.codigo}` : item.codigo;
      const isShelf = 'isShelf' in item && (item as ProductConsolidated).isShelf === true;
      const estoque = isShelf ? '-' : String(item.estoqueAtual);
      const pedido = item.totalPedido === 0 ? '-' : String(item.totalPedido);
      const pendente =
        isShelf
          ? '-'
          : 'pendenteProducao' in item
            ? (item as ProductConsolidated).pendenteProducao
            : (item as ComponentData).falta;
      const falta = pendente !== '-' && pendente < 0 ? String(pendente) : '-';

      const cellPrincipal = getSupervisaoCell(item, principalCol.key);
      const principalCellDisplayed = getDisplayedCell(cellPrincipal);
      const principalMetricsDisplayed = getCellMetrics(principalCellDisplayed);
      const status = getStatusFromMetrics(principalMetricsDisplayed);

      const row: string[] = [codigo, item.descricao, estoque, pedido, falta];

      for (const col of colsBeforePrincipal) {
        const cell = getDisplayedCell(getSupervisaoCell(item, col.key));
        row.push(...formatSupervisaoPF(cell.pedido, cell.falta));
      }
      row.push(...formatSupervisaoPF(principalCellDisplayed.pedido, principalCellDisplayed.falta), status);
      // Blindagem final de apresentação: se P está vazio/traço, F da mesma coluna também deve ficar vazio/traço.
      const normalizedRow = [...row];
      let pfIdx = 5;
      for (let i = 0; i < colsBeforePrincipal.length; i++) {
        if (normalizedRow[pfIdx] === '-') normalizedRow[pfIdx + 1] = '-';
        pfIdx += 2;
      }
      if (normalizedRow[pfIdx] === '-') normalizedRow[pfIdx + 1] = '-';
      body.push(normalizedRow);
    }

    const tableMargin = margin;
    const usableWidth = pageWidth - tableMargin * 2;
    const pairCount = Math.max(1, chunkCols.length);

    const codeWidth = usableWidth * 0.08;
    const estoqueWidth = usableWidth * 0.055;
    const pedidoWidth = usableWidth * 0.055;
    const faltaWidth = usableWidth * 0.055;
    const statusWidth = usableWidth * 0.09;
    const baseRemaining = usableWidth - (codeWidth + estoqueWidth + pedidoWidth + faltaWidth + statusWidth);

    const descBias =
      pairCount <= 3 ? 0.5 :
      pairCount <= 7 ? 0.42 :
      0.35;

    const minDescWidth = usableWidth * 0.16;
    const minSubColWidth = usableWidth * 0.03;

    let descWidth = baseRemaining * descBias;
    let subColWidth = (baseRemaining - descWidth) / (pairCount * 2);

    if (subColWidth < minSubColWidth) {
      subColWidth = minSubColWidth;
      descWidth = Math.max(minDescWidth, baseRemaining - subColWidth * pairCount * 2);
    }
    if (descWidth < minDescWidth) {
      descWidth = minDescWidth;
      subColWidth = Math.max(minSubColWidth, (baseRemaining - descWidth) / (pairCount * 2));
    }

    const descChars = Math.max(18, Math.floor(descWidth / 5.1));
    const bodyResponsive = body.map((row) => {
      const wrapped = wrapDescription(row[1], descChars).join('\n');
      const next = [...row];
      next[1] = wrapped;
      return next;
    });

    const statusIndex = 5 + colsBeforePrincipal.length * 2 + 2;
    const colIndexToKey: Record<number, string> = {};

    const columnStyles: Record<string, object> = {
      0: { cellWidth: codeWidth, fontStyle: 'bold' },
      1: { cellWidth: descWidth },
      2: { cellWidth: estoqueWidth, halign: 'center' },
      3: { cellWidth: pedidoWidth, halign: 'center' },
      4: { cellWidth: faltaWidth, halign: 'center' },
    };
    columnStyles[String(statusIndex)] = { cellWidth: statusWidth, halign: 'center' };

    const orderedRouteCols = [...colsBeforePrincipal, principalCol];
    let colIdx = 5;
    for (let i = 0; i < orderedRouteCols.length; i++) {
      if (colIdx === statusIndex) colIdx++;
      const baseIdx = colIdx;
      columnStyles[String(baseIdx)] = { cellWidth: subColWidth, halign: 'center' };
      columnStyles[String(baseIdx + 1)] = { cellWidth: subColWidth, halign: 'center' };
      colIndexToKey[baseIdx] = orderedRouteCols[i].key;
      colIndexToKey[baseIdx + 1] = orderedRouteCols[i].key;
      colIdx += 2;
    }

    const routeStartIndex = 5;
    const isRouteCol = (idx: number) => colIndexToKey[idx] != null;
    const isPCol = (idx: number) =>
      isRouteCol(idx) && (idx === 5 || colIndexToKey[idx - 1] !== colIndexToKey[idx]);

    autoTable(doc, {
      head,
      body: bodyResponsive,
      startY,
      margin: { left: tableMargin, right: tableMargin },
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: {
        fillColor: PRIMARY,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7,
        halign: 'center',
        lineWidth: 0.5,
        lineColor: [60, 80, 120],
      },
      columnStyles,
      didParseCell: ((cellData: { column: { index: number }; row: { index: number }; section: string; cell: { styles: Record<string, unknown> } }) => {
        const colIndex = cellData.column.index;
        if (cellData.section === 'head') {
          cellData.cell.styles.halign = 'center';
          const rowIdx = cellData.row.index;
          const isRouteLabel = rowIdx === 0 && isPCol(colIndex);
          if (isRouteLabel) {
            cellData.cell.styles.fontSize = 6;
          }
        }
        if (colIndex >= routeStartIndex) cellData.cell.styles.halign = 'center';
        if (cellData.section === 'body') {
          const rowIdx = cellData.row.index;
          const item = dataFiltered[rowIdx];
          const isShelf = item && 'isShelf' in item && (item as ProductConsolidated).isShelf === true;
          if (item && !isShelf && colIndex === 2 && item.estoqueAtual < 0) {
            cellData.cell.styles.textColor = [220, 38, 38];
          }
          if (item && colIndex === statusIndex) {
            const principal = getCellMetrics(getDisplayedCell(getSupervisaoCell(item, principalCol.key)));
            if (principal.faltante > 0) {
              cellData.cell.styles.textColor = [220, 38, 38];
            } else {
              cellData.cell.styles.textColor = [34, 197, 94];
            }
          }
          if (item && !isShelf && colIndex === 4) {
            const pend =
              'pendenteProducao' in item
                ? (item as ProductConsolidated).pendenteProducao
                : (item as ComponentData).falta;
            if (typeof pend === 'number' && pend < 0) cellData.cell.styles.textColor = FONT_AMARELO;
          }
          if (colIndex >= routeStartIndex && item) {
            const colKey = colIndexToKey[colIndex];
            if (!colKey) return;
            const cell = getDisplayedCell(getSupervisaoCell(item, colKey));
            if (isPCol(colIndex) && cell.pedido > 0) {
              cellData.cell.styles.fillColor = BG_AMARELO_CLARO;
              cellData.cell.styles.textColor = FONT_AMARELO;
            } else if (cell.pedido > 0 && cell.falta < 0 && colIndexToKey[colIndex - 1] === colIndexToKey[colIndex]) {
              cellData.cell.styles.textColor = FONT_AMARELO;
            }
          }
        }
      }) as any,
      showHead: 'everyPage',
      pageBreak: 'auto',
      rowPageBreak: 'auto',
    });
  }

  const fileName = buildPdfFileName('v2Supervisao');
  doc.save(fileName);
}

