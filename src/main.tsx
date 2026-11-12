import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/index.css'

function Bootstrap() {
  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">GradPath</h1>
        <p className="text-muted-foreground mt-2">Learn with purpose. Master every course. Graduate with excellence.</p>
      </div>
    </main>
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found')
createRoot(root).render(
  <StrictMode>
    <Bootstrap />
  </StrictMode>,
)
