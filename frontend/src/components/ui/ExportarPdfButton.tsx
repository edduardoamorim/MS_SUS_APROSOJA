import React, { useState } from 'react';
import { FileDown, Loader2, Lock, CheckCircle2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { isAuditoriaSubmetida } from '../../lib/pdf/types';

export interface ExportarPdfButtonProps {
  auditoriaId?: string | null;
  propriedadeId?: string | null;
  propriedadeNome?: string | null;
  status?: string | null;
  variant?: 'header' | 'primary' | 'outline' | 'secondary' | 'ghost';
  compactOnMobile?: boolean;
  className?: string;
  onSuccess?: () => void;
}

export const ExportarPdfButton: React.FC<ExportarPdfButtonProps> = ({
  auditoriaId,
  propriedadeId,
  propriedadeNome,
  status,
  variant = 'primary',
  compactOnMobile = true,
  className = '',
  onSuccess
}) => {
  const { user, role } = useAuth();
  const { success, error, warning } = useToast();
  const [loading, setLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string>('');
  const [percent, setPercent] = useState<number>(0);

  const submetida = isAuditoriaSubmetida(status);

  const handleExport = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (!submetida) {
      warning('O PDF só pode ser exportado após a submissão da vistoria pelo técnico (status: Aguardando Aprovação ou posterior).');
      return;
    }

    if (loading) return;

    setLoading(true);
    setProgressMsg('Iniciando...');
    setPercent(5);

    try {
      // Dynamic import para code-splitting
      const [
        { buildAuditReportData },
        { generateAuditPdf },
        { deliverPdf }
      ] = await Promise.all([
        import('../../lib/pdf/auditReportData'),
        import('../../lib/pdf/auditPdfRenderer'),
        import('../../lib/pdf/pdfDelivery')
      ]);

      setProgressMsg('Compilando dados...');
      setPercent(15);

      const currentUserInfo = {
        id: user?.id,
        nome: (user?.user_metadata as any)?.nome || (user?.user_metadata as any)?.full_name || user?.email?.split('@')[0] || 'Gestor',
        role: role || 'gestor'
      };

      const data = await buildAuditReportData(auditoriaId, propriedadeId, currentUserInfo);

      setProgressMsg('Gerando documento...');
      setPercent(30);

      const doc = await generateAuditPdf(data, (step, pct) => {
        setProgressMsg(step);
        setPercent(pct);
      });

      const cleanFarm = (data.propriedade.nome_fazenda || propriedadeNome || 'Fazenda')
        .replace(/[^a-zA-Z0-9]/g, '_')
        .substring(0, 30);
      const datePart = new Date().toISOString().split('T')[0];
      const fileName = `Relatorio_RTRS_${cleanFarm}_${datePart}.pdf`;

      setProgressMsg('Finalizando...');
      setPercent(95);

      const result = await deliverPdf(doc, fileName);

      setPercent(100);
      if (result.method === 'share') {
        success('Painel de compartilhamento aberto com sucesso!');
      } else {
        success(`Relatório PDF ${fileName} gerado e salvo com sucesso!`);
      }

      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error('[ExportarPdfButton] Erro ao exportar relatório:', err);
      error('Falha ao exportar PDF: ' + (err?.message || 'Erro inesperado na geração'));
    } finally {
      setLoading(false);
      setProgressMsg('');
      setPercent(0);
    }
  };

  // Estilização conforme variante
  let variantStyles = '';
  switch (variant) {
    case 'header':
      variantStyles = submetida
        ? 'bg-emerald-600/40 hover:bg-emerald-600/70 text-white border border-emerald-400/40 shadow-sm active:scale-95'
        : 'bg-emerald-950/40 text-emerald-300/40 border border-emerald-800/40 cursor-not-allowed';
      break;
    case 'outline':
      variantStyles = submetida
        ? 'border-2 border-emerald-600 text-emerald-700 bg-white hover:bg-emerald-50 active:scale-95'
        : 'border-2 border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed';
      break;
    case 'secondary':
      variantStyles = submetida
        ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 active:scale-95'
        : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed';
      break;
    case 'ghost':
      variantStyles = submetida
        ? 'text-emerald-700 hover:bg-emerald-50 active:scale-95'
        : 'text-gray-400 cursor-not-allowed';
      break;
    case 'primary':
    default:
      variantStyles = submetida
        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm active:scale-95'
        : 'bg-gray-200 text-gray-400 cursor-not-allowed';
      break;
  }

  const tooltipText = !submetida
    ? 'Disponível após submissão pelo técnico (status Aguardando Aprovação ou posterior)'
    : loading
    ? `${progressMsg} (${percent}%)`
    : 'Exportar Relatório Completo em PDF';

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={loading || !submetida}
      title={tooltipText}
      className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all select-none duration-150 ${variantStyles} ${className}`}
    >
      {loading ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span className={compactOnMobile ? 'hidden sm:inline' : ''}>
            {percent > 0 ? `${percent}%` : 'Gerando...'}
          </span>
          <span className={compactOnMobile ? 'sm:hidden' : 'hidden'}>
            {percent}%
          </span>
        </>
      ) : !submetida ? (
        <>
          <Lock className="w-3.5 h-3.5 opacity-70" />
          <span className={compactOnMobile ? 'hidden sm:inline' : ''}>PDF Indisponível</span>
          <span className={compactOnMobile ? 'sm:hidden' : 'hidden'}>PDF</span>
        </>
      ) : (
        <>
          <FileDown className="w-4 h-4 shrink-0" />
          <span className={compactOnMobile ? 'hidden sm:inline' : ''}>Exportar PDF</span>
          <span className={compactOnMobile ? 'sm:hidden' : 'hidden'}>PDF</span>
        </>
      )}
    </button>
  );
};

export default ExportarPdfButton;
