import React from 'react';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className = '', ...props }: SkeletonProps) {
  return (
    <div
      className={`bg-gradient-to-r from-slate-100 via-slate-200/80 to-slate-100 bg-[length:200%_100%] animate-shimmer rounded-xl ${className}`}
      {...props}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs animate-fade-in-up group relative overflow-hidden space-y-4">
      <div className="flex items-start justify-between">
        <div className="space-y-3 w-2/3">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-3 w-1/3 mt-1" />
        </div>
        <Skeleton className="h-12 w-12 rounded-2xl" />
      </div>
    </div>
  );
}

export function ListSkeleton() {
  return (
    <div className="bg-white rounded-3xl shadow-xs border border-slate-200/80 overflow-hidden w-full animate-fade-in-up">
      <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-4 w-1/6" />
      </div>
      <div className="p-6 space-y-4">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="p-6 pt-0 border-t border-slate-100 mt-2 flex gap-3">
        <Skeleton className="h-11 w-full rounded-2xl" />
      </div>
    </div>
  );
}

export function TableRowSkeleton() {
  return (
    <tr className="border-b border-slate-100 animate-fade-in-up">
      <td className="px-6 py-4"><Skeleton className="h-4 w-full" /></td>
      <td className="px-6 py-4"><Skeleton className="h-4 w-full" /></td>
      <td className="px-6 py-4"><Skeleton className="h-4 w-full" /></td>
      <td className="px-6 py-4"><Skeleton className="h-4 w-3/4" /></td>
      <td className="px-6 py-4"><Skeleton className="h-9 w-24 rounded-xl ml-auto" /></td>
    </tr>
  );
}
