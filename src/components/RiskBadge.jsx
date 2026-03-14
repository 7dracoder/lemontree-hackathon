import { getRiskLabel } from '../utils/mlScoring'

export default function RiskBadge({ score }) {
  const { label, border, text } = getRiskLabel(score)
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 border text-[10px] font-bold tracking-widest uppercase whitespace-nowrap ${border} ${text} bg-card`}>
      <span className={`w-1.5 h-1.5 rounded-none ${text.replace('text-', 'bg-')}`} />
      {label}
    </span>
  )
}
