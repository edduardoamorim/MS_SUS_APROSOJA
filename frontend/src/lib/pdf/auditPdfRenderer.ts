import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AuditReportData } from './types';
import { getAppLogoDataUrl, batchLoadEvidenceImages } from './imageLoader';

/**
 * Sanitiza strings para evitar quebra de codificação no PDF (usando fonte Helvetica padrão).
 */
function cleanText(val?: string | null): string {
  if (!val) return '';
  return String(val)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '--')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

/**
 * Renderizador principal do Relatório Oficial RTRS em PDF (jsPDF + autoTable).
 */
export async function generateAuditPdf(
  data: AuditReportData,
  onProgress?: (step: string, percent: number) => void
): Promise<jsPDF> {
  if (onProgress) onProgress('Preparando elementos visuais e logotipo...', 10);

  // 1. Carregar logo da aplicação
  const logoDataUrl = await getAppLogoDataUrl();

  // 2. Pré-carregar fotos de evidência para miniaturas e anexo fotográfico
  if (onProgress) onProgress('Carregando evidências fotográficas...', 20);
  const evidenceMap = await batchLoadEvidenceImages(
    data.criterios,
    (pct) => {
      if (onProgress) onProgress('Processando evidências fotográficas...', 20 + Math.round(pct * 0.3));
    },
    4
  );

  if (onProgress) onProgress('Gerando páginas do documento...', 55);

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2; // 182mm

  // =========================================================================
  // PÁGINA 1: CAPA, DADOS CADASTRAIS, PANORAMA & MATRIZ DE PRAZOS
  // =========================================================================

  // Topo institucional
  let curY = 14;

  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', marginX, curY, 38, 14);
    } catch {
      // Fallback texto se imagem falhar
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(5, 150, 105);
      doc.text('MS SUSTENTÁVEL', marginX, curY + 8);
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(5, 150, 105);
    doc.text('MS SUSTENTÁVEL', marginX, curY + 8);
  }

  // Títulos à direita / centro
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text('RELATÓRIO DE AUDITORIA & CONFORMIDADE RTRS', 56, curY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Vistoria Socioambiental In-Loco • Padrão Internacional RTRS para Soja Responsável', 56, curY + 11);

  curY += 20;

  // Linha divisória verde
  doc.setDrawColor(5, 150, 105);
  doc.setLineWidth(0.8);
  doc.line(marginX, curY, pageWidth - marginX, curY);

  curY += 6;

  // BLOCO 1: DADOS DA PROPRIEDADE & DO PRODUTOR (Card Cinza com borda)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, curY, contentWidth, 38, 2, 2, 'FD');

  // Título do Bloco
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(6, 78, 59);
  doc.text('1. IDENTIFICAÇÃO DA PROPRIEDADE & DO PRODUTOR', marginX + 4, curY + 6);

  // Coluna 1
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('Fazenda:', marginX + 4, curY + 13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(cleanText(data.propriedade.nome_fazenda), marginX + 22, curY + 13);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('Produtor:', marginX + 4, curY + 19);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(cleanText(data.propriedade.nome_produtor), marginX + 22, curY + 19);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('Município:', marginX + 4, curY + 25);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(cleanText(data.propriedade.municipio), marginX + 22, curY + 25);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('Etapa Atual:', marginX + 4, curY + 31);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(5, 150, 105);
  doc.text(cleanText(data.propriedade.etapa || 'Auditoria Oficial'), marginX + 25, curY + 31);

  // Coluna 2
  const col2X = marginX + 100;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('Código CAR:', col2X, curY + 13);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(cleanText(data.propriedade.codigo_car || 'Não informado'), col2X + 22, curY + 13);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('Código SIGEF:', col2X, curY + 19);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(cleanText(data.propriedade.codigo_sigef || 'Não informado'), col2X + 24, curY + 19);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('Data Vistoria:', col2X, curY + 25);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(cleanText(data.auditoria.data_vistoria), col2X + 22, curY + 25);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100, 116, 139);
  doc.text('Status:', col2X, curY + 31);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(37, 99, 235);
  doc.text(cleanText(data.auditoria.status), col2X + 15, curY + 31);

  curY += 43;

  // BLOCO 2: PANORAMA & SCORE GERAL DE CONFORMIDADE
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginX, curY, contentWidth, 38, 2, 2, 'FD');

  // Círculo / Box de Destaque do Score à esquerda
  const scoreBoxWidth = 46;
  doc.setFillColor(5, 150, 105);
  doc.roundedRect(marginX + 4, curY + 4, scoreBoxWidth, 30, 2, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text(`${data.estatisticas.scoreConformidade}%`, marginX + 4 + scoreBoxWidth / 2, curY + 18, { align: 'center' });

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('CONFORMIDADE RTRS', marginX + 4 + scoreBoxWidth / 2, curY + 25, { align: 'center' });

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Base: ${data.estatisticas.aplicaveis} aplicáveis`, marginX + 4 + scoreBoxWidth / 2, curY + 30, { align: 'center' });

  // Informações do lado direito do Score
  const infoX = marginX + scoreBoxWidth + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('2. SÍNTESE DO DIAGNÓSTICO DE CONFORMIDADE', infoX, curY + 8);

  // Classificação
  const isCritica = data.estatisticas.scoreConformidade < 80 || data.matrizPrazos.imediato.naoConformes > 0;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  if (isCritica) {
    doc.setTextColor(225, 29, 72);
  } else {
    doc.setTextColor(5, 150, 105);
  }
  doc.text(cleanText(data.estatisticas.classificacao), infoX, curY + 15);

  // Barra de Distribuição Visual
  const barY = curY + 20;
  const barW = contentWidth - scoreBoxWidth - 16;
  const barH = 5;

  const total = data.estatisticas.totalPerguntas || 115;
  const pctConf = data.estatisticas.conformes / total;
  const pctNaoConf = data.estatisticas.naoConformes / total;
  const pctNa = data.estatisticas.naoSeAplica / total;

  const wConf = barW * pctConf;
  const wNaoConf = barW * pctNaoConf;
  const wNa = barW * pctNa;

  // Segmento Verde
  doc.setFillColor(16, 185, 129);
  doc.rect(infoX, barY, wConf, barH, 'F');
  // Segmento Vermelho
  doc.setFillColor(239, 68, 68);
  doc.rect(infoX + wConf, barY, wNaoConf, barH, 'F');
  // Segmento Cinza
  doc.setFillColor(148, 163, 184);
  doc.rect(infoX + wConf + wNaoConf, barY, wNa, barH, 'F');

  // Legenda da barra
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');

  doc.setTextColor(16, 185, 129);
  doc.text(`• ${data.estatisticas.conformes} Conformes (${Math.round(pctConf * 100)}%)`, infoX, barY + 10);

  doc.setTextColor(239, 68, 68);
  doc.text(`• ${data.estatisticas.naoConformes} Não Conformes (${Math.round(pctNaoConf * 100)}%)`, infoX + 48, barY + 10);

  doc.setTextColor(100, 116, 139);
  doc.text(`• ${data.estatisticas.naoSeAplica} N/A (${Math.round(pctNa * 100)}%)`, infoX + 104, barY + 10);

  curY += 43;

  // BLOCO 3: MATRIZ DE PRAZOS & EXIGÊNCIAS (3 Cards Coloridos)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(6, 78, 59);
  doc.text('3. MATRIZ DE PRAZOS & EXIGÊNCIAS DE ADEQUAÇÃO', marginX, curY + 1);

  curY += 5;

  const cardW = (contentWidth - 6) / 3; // ~58.6mm
  const cardH = 34;

  // CARD 1: IMEDIATO 15 DIAS (Vermelho / Rosa)
  doc.setFillColor(255, 241, 242);
  doc.setDrawColor(254, 205, 211);
  doc.setLineWidth(0.4);
  doc.roundedRect(marginX, curY, cardW, cardH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(225, 29, 72);
  doc.text('PRAZO IMEDIATO • 15 DIAS', marginX + 4, curY + 6);
  doc.setFontSize(6.8);
  doc.setTextColor(159, 18, 57);
  doc.text('Urgente / Impeditivo p/ Certificação', marginX + 4, curY + 11);

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(225, 29, 72);
  doc.text(`${data.matrizPrazos.imediato.naoConformes}`, marginX + 4, curY + 22);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('não conformes', marginX + 16, curY + 21);

  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Total do grupo: ${data.matrizPrazos.imediato.total} critérios`, marginX + 4, curY + 29);

  // CARD 2: CURTO PRAZO 60 DIAS (Âmbar / Amarelo)
  const card2X = marginX + cardW + 3;
  doc.setFillColor(254, 252, 232);
  doc.setDrawColor(254, 240, 138);
  doc.roundedRect(card2X, curY, cardW, cardH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(180, 83, 9);
  doc.text('CURTO PRAZO • 60 DIAS', card2X + 4, curY + 6);
  doc.setFontSize(6.8);
  doc.setTextColor(146, 64, 14);
  doc.text('Adequação Técnica & Documental', card2X + 4, curY + 11);

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(180, 83, 9);
  doc.text(`${data.matrizPrazos.curtoPrazo.naoConformes}`, card2X + 4, curY + 22);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('não conformes', card2X + 16, curY + 21);

  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Total do grupo: ${data.matrizPrazos.curtoPrazo.total} critérios`, card2X + 4, curY + 29);

  // CARD 3: MÉDIO PRAZO 120 DIAS (Azul)
  const card3X = card2X + cardW + 3;
  doc.setFillColor(239, 246, 255);
  doc.setDrawColor(191, 219, 254);
  doc.roundedRect(card3X, curY, cardW, cardH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(29, 78, 216);
  doc.text('MÉDIO PRAZO • 120 DIAS', card3X + 4, curY + 6);
  doc.setFontSize(6.8);
  doc.setTextColor(30, 64, 175);
  doc.text('Melhoria Contínua & Monitoramento', card3X + 4, curY + 11);

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(29, 78, 216);
  doc.text(`${data.matrizPrazos.medioPrazo.naoConformes}`, card3X + 4, curY + 22);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('não conformes', card3X + 16, curY + 21);

  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`Total do grupo: ${data.matrizPrazos.medioPrazo.total} critérios`, card3X + 4, curY + 29);

  curY += 39;

  // BLOCO 4: RAIO-X DOS 5 PRINCÍPIOS RTRS
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(6, 78, 59);
  doc.text('4. RAIO-X DOS 5 PRINCÍPIOS OFICIAIS RTRS', marginX, curY + 1);

  curY += 4;

  const principiosTableBody = data.principios.map(p => [
    `Princípio ${p.numero}: ${p.nome}`,
    `${p.total}`,
    `${p.conformes}`,
    `${p.naoConformes}`,
    `${p.naoSeAplica}`,
    `${p.score}%`
  ]);

  autoTable(doc, {
    startY: curY,
    margin: { left: marginX, right: marginX },
    head: [['Pilar / Princípio RTRS', 'Total', 'Conformes', 'Não Conf.', 'N/A', 'Aderência']],
    body: principiosTableBody,
    theme: 'striped',
    headStyles: {
      fillColor: [5, 150, 105],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center'
    },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      valign: 'middle'
    },
    columnStyles: {
      0: { cellWidth: 90, halign: 'left' },
      1: { cellWidth: 16, halign: 'center' },
      2: { cellWidth: 18, halign: 'center', textColor: [16, 185, 129], fontStyle: 'bold' },
      3: { cellWidth: 18, halign: 'center', textColor: [239, 68, 68], fontStyle: 'bold' },
      4: { cellWidth: 18, halign: 'center', textColor: [100, 116, 139] },
      5: { cellWidth: 22, halign: 'center', fontStyle: 'bold' }
    }
  });

  // =========================================================================
  // PÁGINA 2: NÃO CONFORMIDADES APONTADAS EM CAMPO
  // =========================================================================
  if (data.naoConformidades.length > 0) {
    doc.addPage();
    let p2Y = 20;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text('NÃO CONFORMIDADES APONTADAS EM CAMPO', marginX, p2Y);

    p2Y += 7;

    const ncTableBody = data.naoConformidades.map(nc => [
      `Critério ${nc.criterio}\nPrazo: ${nc.prazo}`,
      cleanText(nc.enunciado),
      cleanText(nc.observacao) || 'Sem apontamento adicional registrado.'
    ]);

    autoTable(doc, {
      startY: p2Y,
      margin: { left: marginX, right: marginX },
      head: [['Critério & Prazo', 'Indicador RTRS', 'Anotação do Técnico']],
      body: ncTableBody,
      theme: 'grid',
      headStyles: {
        fillColor: [190, 18, 60],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'left'
      },
      styles: {
        fontSize: 7.5,
        cellPadding: 2.8,
        valign: 'top',
        overflow: 'linebreak'
      },
      columnStyles: {
        0: { cellWidth: 30, fontStyle: 'bold' },
        1: { cellWidth: 82 },
        2: { cellWidth: 70 }
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index === 0) {
          const val = String(hookData.cell.raw || '');
          if (val.includes('15 dias')) {
            hookData.cell.styles.textColor = [190, 18, 60];
          } else if (val.includes('60 dias')) {
            hookData.cell.styles.textColor = [180, 83, 9];
          } else {
            hookData.cell.styles.textColor = [37, 99, 235];
          }
        }
        if (hookData.section === 'body' && hookData.column.index === 2) {
          hookData.cell.styles.fillColor = [254, 252, 232];
          hookData.cell.styles.textColor = [69, 26, 3];
        }
      }
    });
  }

  // =========================================================================
  // PÁGINA 3+: TABELA COMPLETA COM OS 115 INDICADORES RTRS
  // =========================================================================
  doc.addPage();
  let p3Y = 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text('CHECKLIST COMPLETO DOS 115 INDICADORES RTRS', marginX, p3Y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    'Relação integral de todos os critérios aplicáveis do Padrão Internacional RTRS avaliados in-loco.',
    marginX,
    p3Y + 5
  );

  p3Y += 9;

  const fullTableBody = data.criterios.map(c => {
    const hasPhoto = evidenceMap.has(c.evidenciaUrl || '') || (c.evidenciaUrl && !c.evidenciaUrl.startsWith('blob:'));
    const obsText = c.observacao ? c.observacao : (hasPhoto ? '[Foto Anexada]' : '—');
    return [
      c.numero_criterio,
      cleanText(c.secao.replace(/^Princípio \d:\s*/, '')),
      cleanText(c.enunciado),
      c.ponderacao,
      c.status,
      cleanText(obsText)
    ];
  });

  autoTable(doc, {
    startY: p3Y,
    margin: { left: marginX, right: marginX },
    head: [['Crit.', 'Pilar / Tema', 'Indicador RTRS (O que é pedido)', 'Ponderação', 'Situação', 'Anotação do Técnico / Evidência']],
    body: fullTableBody,
    theme: 'grid',
    headStyles: {
      fillColor: [6, 78, 59],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'center'
    },
    styles: {
      fontSize: 7,
      cellPadding: 1.8,
      valign: 'middle'
    },
    columnStyles: {
      0: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 26 },
      2: { cellWidth: 68 },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 35 }
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body' && hookData.column.index === 4) {
        const val = String(hookData.cell.raw || '');
        if (val === 'Conforme') {
          hookData.cell.styles.textColor = [16, 185, 129];
        } else if (val === 'Não Conforme') {
          hookData.cell.styles.textColor = [239, 68, 68];
        } else {
          hookData.cell.styles.textColor = [148, 163, 184];
        }
      }
    }
  });

  // =========================================================================
  // PÁGINA FINAL: ANEXO FOTOGRÁFICO (se houver) & TERMO DE ASSINATURAS
  // =========================================================================
  const photoItems = data.criterios.filter(c => c.evidenciaUrl && evidenceMap.has(c.evidenciaUrl));
  let photoBottomY = 20;

  if (photoItems.length > 0) {
    doc.addPage();
    let photoY = 20;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text('ANEXO FOTOGRÁFICO DE EVIDÊNCIAS DE CAMPO', marginX, photoY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      'Registro fotográfico georreferenciado e comprovações anexadas durante a vistoria técnica in-loco.',
      marginX,
      photoY + 5
    );

    photoY += 12;

    const imgW = 86;
    const imgH = 50;
    const gapX = 10;
    const gapY = 8;
    let col = 0;

    for (let i = 0; i < photoItems.length; i++) {
      const pItem = photoItems[i];
      const base64 = evidenceMap.get(pItem.evidenciaUrl!)!;

      // Se estourar a página, cria nova página
      if (photoY + imgH + 16 > pageHeight - 20) {
        doc.addPage();
        photoY = 20;
        col = 0;
      }

      const currentX = marginX + col * (imgW + gapX);

      // Moldura da foto
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(currentX, photoY, imgW, imgH + 14, 1.5, 1.5, 'FD');

      try {
        doc.addImage(base64, 'JPEG', currentX + 1, photoY + 1, imgW - 2, imgH - 2);
      } catch (imgErr) {
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text('Foto indisponível', currentX + imgW / 2, photoY + imgH / 2, { align: 'center' });
      }

      // Legenda
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`Critério ${pItem.numero_criterio} (${pItem.status})`, currentX + 2, photoY + imgH + 4);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      const shortDesc = pItem.observacao || pItem.enunciado.substring(0, 55) + '...';
      doc.text(cleanText(shortDesc).substring(0, 60), currentX + 2, photoY + imgH + 9);

      if (col === 0) {
        col = 1;
        photoBottomY = photoY + imgH + 14;
      } else {
        col = 0;
        photoBottomY = photoY + imgH + 14;
        photoY += imgH + 14 + gapY;
      }
    }
  }

  // =========================================================================
  // TERMO DE DELIBERAÇÃO & ASSINATURAS INSTITUCIONAIS COM ESPAÇO AMPLO
  // =========================================================================
  const sigBlockHeight = 72;
  let sigY: number;

  if (photoItems.length > 0) {
    if (photoBottomY + sigBlockHeight + 18 > pageHeight - 15) {
      doc.addPage();
      sigY = 25;
    } else {
      sigY = photoBottomY + 12;
    }
  } else {
    const lastTableY = (doc as any).lastAutoTable?.finalY || 160;
    if (lastTableY + sigBlockHeight + 18 > pageHeight - 15) {
      doc.addPage();
      sigY = 25;
    } else {
      sigY = lastTableY + 12;
    }
  }

  // Termo institucional de conformidade
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(marginX, sigY, contentWidth, 14, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  const termo =
    `Declaramos que as avaliações socioambientais acima detalhadas retratam com fidedignidade as evidências e fatos verificados na propriedade rural ${cleanText(data.propriedade.nome_fazenda)}, em conformidade com o Padrão RTRS para Produção Responsável de Soja. Situação: ${data.auditoria.status}.`;
  doc.text(doc.splitTextToSize(termo, contentWidth - 8), marginX + 4, sigY + 5);

  sigY += 18;

  // Caixas de assinatura com vão vertical amplo para assinatura manual ou digital
  const sigCardW = (contentWidth - 10) / 2; // ~86mm
  const sigCardH = 46;
  const sigCol1X = marginX;
  const sigCol2X = marginX + sigCardW + 10;

  // CARD 1: TÉCNICO RESPONSÁVEL PELA VISTORIA
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(sigCol1X, sigY, sigCardW, sigCardH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text('TÉCNICO RESPONSÁVEL PELA VISTORIA', sigCol1X + sigCardW / 2, sigY + 5.5, { align: 'center' });

  // Espaço livre e amplo para assinatura / rubrica
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(203, 213, 225);
  doc.text('(Espaço para Assinatura / Rubrica)', sigCol1X + sigCardW / 2, sigY + 16, { align: 'center' });

  // Linha sólida de assinatura
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.4);
  doc.line(sigCol1X + 8, sigY + 27, sigCol1X + sigCardW - 8, sigY + 27);

  // Identificação do Técnico abaixo da linha
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(cleanText(data.auditoria.tecnico_nome), sigCol1X + sigCardW / 2, sigY + 32, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Auditor Técnico de Campo', sigCol1X + sigCardW / 2, sigY + 36.5, { align: 'center' });
  doc.text(`Data da Vistoria: ${data.auditoria.data_vistoria}`, sigCol1X + sigCardW / 2, sigY + 41, { align: 'center' });

  // CARD 2: PRODUTOR RURAL / REPRESENTANTE LEGAL
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(sigCol2X, sigY, sigCardW, sigCardH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);
  doc.text('PRODUTOR RURAL / CIÊNCIA DA AUDITORIA', sigCol2X + sigCardW / 2, sigY + 5.5, { align: 'center' });

  // Espaço livre e amplo para assinatura / rubrica
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.setTextColor(203, 213, 225);
  doc.text('(Espaço para Assinatura / Rubrica)', sigCol2X + sigCardW / 2, sigY + 16, { align: 'center' });

  // Linha sólida de assinatura
  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.4);
  doc.line(sigCol2X + 8, sigY + 27, sigCol2X + sigCardW - 8, sigY + 27);

  // Identificação do Produtor Rural abaixo da linha
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(cleanText(data.propriedade.nome_produtor), sigCol2X + sigCardW / 2, sigY + 32, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text('Produtor(a) Rural / Responsável Legal', sigCol2X + sigCardW / 2, sigY + 36.5, { align: 'center' });
  doc.text(`Fazenda: ${cleanText(data.propriedade.nome_fazenda)}`, sigCol2X + sigCardW / 2, sigY + 41, { align: 'center' });

  // =========================================================================
  // SEGUNDO PASSO: CABEÇALHOS E RODAPÉS DETERMINÍSTICOS ("Página X de Y")
  // =========================================================================
  const totalPages = doc.getNumberOfPages();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Cabeçalho a partir da página 2
    if (i > 1) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text('MS Sustentável • Relatório Oficial de Auditoria RTRS', marginX, 10);
      doc.text(`Fazenda: ${cleanText(data.propriedade.nome_fazenda)}`, pageWidth - marginX, 10, { align: 'right' });

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(marginX, 12, pageWidth - marginX, 12);
    }

    // Rodapé em todas as páginas
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(marginX, pageHeight - 11, pageWidth - marginX, pageHeight - 11);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text('MS Sustentável — Plataforma de Gestão Socioambiental e Certificação RTRS', marginX, pageHeight - 7);

    doc.setFont('helvetica', 'bold');
    doc.text(`Página ${i} de ${totalPages}`, pageWidth / 2, pageHeight - 7, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.text(`Emissão: ${data.auditoria.data_emissao}`, pageWidth - marginX, pageHeight - 7, { align: 'right' });
  }

  if (onProgress) onProgress('Relatório finalizado com sucesso!', 100);

  return doc;
}

