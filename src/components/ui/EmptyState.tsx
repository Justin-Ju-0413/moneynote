interface EmptyStateProps {
  icon?: string
  title: string
  description?: string
}

export function EmptyState({ icon = '—', title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="text-3xl text-primary-400 mb-4 font-heading">{icon}</div>
      <h3 className="font-heading text-sm text-primary-600 mb-1">{title}</h3>
      {description && <p className="text-text-muted text-xs mt-1">{description}</p>}
    </div>
  )
}
