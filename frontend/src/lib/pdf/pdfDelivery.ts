/**
 * Entrega o arquivo PDF gerado:
 * - Em dispositivos móveis / tablets: aciona Web Share API (WhatsApp, E-mail, Google Drive) se suportado.
 * - Em computadores ou navegadores sem Web Share: aciona download direto do navegador (.save).
 */
export async function deliverPdf(
  doc: any,
  fileName: string
): Promise<{ method: 'share' | 'download'; success: boolean }> {
  const isMobileOrTablet =
    typeof navigator !== 'undefined' &&
    (/android|iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.maxTouchPoints && navigator.maxTouchPoints > 2));

  try {
    const blob = doc.output('blob') as Blob;

    if (isMobileOrTablet && typeof navigator.share === 'function') {
      try {
        const file = new File([blob], fileName, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: fileName.replace('.pdf', ''),
            text: 'Relatório Oficial de Auditoria RTRS - MS Sustentável'
          });
          return { method: 'share', success: true };
        }
      } catch (shareErr: any) {
        if (shareErr.name === 'AbortError') {
          // Usuário apenas fechou o painel de compartilhamento do sistema
          return { method: 'share', success: true };
        }
        console.warn('[PDF Delivery] Aviso no Web Share, recaindo para download:', shareErr);
      }
    }
  } catch (e) {
    console.warn('[PDF Delivery] Falha ao extrair blob para compartilhamento:', e);
  }

  // Download direto
  doc.save(fileName);
  return { method: 'download', success: true };
}

