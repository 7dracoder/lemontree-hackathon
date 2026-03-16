import { useState } from 'react'
import { HelpCircle } from 'lucide-react'

export default function MetricTooltip({ text }) {
  const [show, setShow] = useState(false)

  return (
    <span className="relative inline-flex items-center ml-1.5">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(s => !s)}
        className="text-tertiary hover:text-accent transition-colors cursor-help"
        aria-label="Metric info"
      >
        <HelpCircle size={12} />
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-56 px-3 py-2 bg-card border border-accent text-[10px] text-primary tracking-wide leading-relaxed font-mono shadow-xl shadow-black/40 pointer-events-none whitespace-normal">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-accent" />
        </div>
      )}
    </span>
  )
}
