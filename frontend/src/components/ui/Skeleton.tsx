import React from 'react';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className = '', ...props }: SkeletonProps) {
  return (
    <div
      className={`shimmer-effect rounded-md ${className}`}
      {...props}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-card p-6 rounded-2xl border border-slate-100 shadow-sm animate-fade-in-up group relative overflow-hidden">
      <div className="flex items-start justify-between">
        <div className="space-y-4 w-2/3">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-3 w-1/3 mt-2" />
        </div>
        <Skeleton className="h-12 w-12 rounded-xl" />
      </div>
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden w-full animate-fade-in-up">
      <div className="px-5 py-4 bg-muted/50 border-b border-border flex justify-between">
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-4 w-1/6" />
      </div>
      <div className="p-6 space-y-4">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="p-6 pt-0 border-t border-border/30 mt-4 flex gap-2">
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <tr className="border-b border-border/50 animate-fade-in-up">
      <td className="px-6 py-4"><Skeleton className="h-4 w-full" /></td>
      <td className="px-6 py-4"><Skeleton className="h-4 w-full" /></td>
      <td className="px-6 py-4"><Skeleton className="h-4 w-full" /></td>
      <td className="px-6 py-4"><Skeleton className="h-4 w-3/4" /></td>
      <td className="px-6 py-4"><Skeleton className="h-8 w-24 rounded-md ml-auto" /></td>
    </tr>
  );
}
