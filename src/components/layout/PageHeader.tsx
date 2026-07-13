interface PageHeaderProps {
  title: string
  subtitle?: string
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <header className="px-5 pt-12 pb-6 md:px-8 md:pt-14 md:pb-8 lg:px-10 lg:pt-10 safe-area-top">
      <p className="text-[10px] tracking-[0.2em] uppercase text-text-muted mb-2 font-medium">
        MoneyNote
      </p>
      <h1 className="font-heading text-2xl md:text-3xl lg:text-4xl text-primary-700">{title}</h1>
      {subtitle && (
        <p className="text-text-muted text-sm md:text-base mt-1">{subtitle}</p>
      )}
      <div className="h-px bg-primary-200/40 mt-4" />
    </header>
  )
}
