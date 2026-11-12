import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'

export interface Crumb {
  label: string
  to?: string
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 overflow-x-auto">
      <ol className="flex items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
        {items.map((item, i) => {
          const last = i === items.length - 1
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1">
              {item.to && !last ? (
                <Link to={item.to} className="rounded hover:text-foreground hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={last ? 'max-w-[40ch] truncate font-medium text-foreground' : undefined}>
                  {item.label}
                </span>
              )}
              {!last ? <ChevronRight className="size-3" aria-hidden /> : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
