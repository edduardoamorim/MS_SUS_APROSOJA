export const getRemainingTimeLabel = (prazo: string | null | undefined, status: string) => {
  if (status === 'Resolvida') {
    return { 
      text: 'Resolvida', 
      className: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold' 
    };
  }
  if (!prazo) {
    return { 
      text: 'Sem prazo definido', 
      className: 'bg-slate-50 text-slate-600 border-slate-200 font-medium' 
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Split date to avoid UTC timezone offset issues and evaluate in local time
  const parts = prazo.split('T')[0].split('-');
  let deadline: Date;
  if (parts.length === 3) {
    deadline = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  } else {
    deadline = new Date(prazo);
  }
  deadline.setHours(0, 0, 0, 0);

  const diffTime = deadline.getTime() - today.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const days = Math.abs(diffDays);
    return {
      text: `Expirada há ${days} dia(s)`,
      className: 'bg-rose-100 text-rose-800 border-rose-200 font-bold dark:bg-rose-950/40 dark:border-rose-900/50'
    };
  } else if (diffDays === 0) {
    return {
      text: 'Expira hoje!',
      className: 'bg-amber-100 text-amber-800 border-amber-200 font-bold animate-pulse dark:bg-amber-950/40 dark:border-amber-900/50'
    };
  } else {
    return {
      text: `Falta(m) ${diffDays} dia(s)`,
      className: diffDays <= 3 
        ? 'bg-amber-50 text-amber-800 border-amber-200 font-semibold dark:bg-amber-950/20' 
        : 'bg-emerald-50 text-emerald-800 border-emerald-200 font-medium dark:bg-emerald-950/20'
    };
  }
};
