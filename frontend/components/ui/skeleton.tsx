import { cn } from '@/lib/utils'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** hauteur explicite si besoin, sinon utilisez className */
  h?: string
  /** largeur explicite */
  w?: string
}

export function Skeleton({ className, h, w, style, ...props }: SkeletonProps) {
  return (
    <div
      className={cn('skeleton', className)}
      style={{ height: h, width: w, ...style }}
      aria-hidden="true"
      {...props}
    />
  )
}

/** Skeleton d'une ligne de texte */
export function SkeletonText({ className }: { className?: string }) {
  return <Skeleton className={cn('h-3 rounded', className)} />
}

/** Skeleton d'une card stat (dashboard) */
export function SkeletonStatCard() {
  return (
    <div className="card-elevated p-5 space-y-3">
      <div className="flex items-start justify-between">
        <Skeleton className="w-8 h-8 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-24" />
    </div>
  )
}

/** Skeleton d'une ligne de liste */
export function SkeletonListRow() {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
        <div className="space-y-1.5 flex-1 min-w-0">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-2.5 w-48" />
        </div>
      </div>
      <Skeleton className="h-5 w-16 rounded-full flex-shrink-0 ml-3" />
    </div>
  )
}

/** Skeleton d'un tableau complet */
export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div className="border border-border/60 rounded-xl overflow-hidden divide-y divide-border/60 bg-card/30">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonListRow key={i} />
      ))}
    </div>
  )
}
