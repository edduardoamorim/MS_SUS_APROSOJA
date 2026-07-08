import { Sparkles } from 'lucide-react';

interface AIInsightsPanelProps {
  title?: string;
  insights: string;
  isLoading: boolean;
}

export default function AIInsightsPanel({ title = "Briefing Executivo AI", insights, isLoading }: AIInsightsPanelProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/10 to-indigo-500/10 border border-primary/20 shadow-lg backdrop-blur-sm transition-all duration-500 hover:shadow-xl hover:-translate-y-0.5">
      
      {/* Decorative gradient orb */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl animate-soft-pulse"></div>
      
      <div className="relative p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-background rounded-lg border border-border shadow-sm">
            <Sparkles className="w-5 h-5 text-indigo-500" />
          </div>
          <h3 className="text-lg font-semibold text-foreground tracking-tight">{title}</h3>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <div className="h-4 bg-primary/20 rounded-md w-3/4 shimmer-effect"></div>
            <div className="h-4 bg-primary/20 rounded-md w-full shimmer-effect"></div>
            <div className="h-4 bg-primary/20 rounded-md w-5/6 shimmer-effect"></div>
          </div>
        ) : (
          <div className="text-sm font-medium text-muted-foreground leading-relaxed">
            {/* Split by newlines or markdown basic rendering if needed, 
                for now standard text rendering is fine for a 3-line briefing */}
            <p className="whitespace-pre-wrap">{insights}</p>
          </div>
        )}
      </div>
    </div>
  );
}
