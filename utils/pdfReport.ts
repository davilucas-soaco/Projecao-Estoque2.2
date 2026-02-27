import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ProductConsolidated, ComponentData } from '../types';

const PRIMARY = '#041126';
const SECONDARY = '#1E22AA';
const HIGHLIGHT = '#FFAD00';

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

const formatCellNum = (v: unknown): string => {
  if (v === undefined || v === null) return '-';
  const n = Number(v);
  if (Number.isNaN(n) || n === 0) return '-';
  return n % 1 === 0 ? String(Math.round(n)) : String(Math.round(n * 100) / 100);
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

  const allRows = flattenRows();

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

  const fileName = `Projecao_Estoque_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}
