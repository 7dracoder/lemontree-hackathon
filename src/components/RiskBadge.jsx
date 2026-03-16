import { getRiskLabel } from '../utils/mlScoring'

const RISK_TOOLTIP = 'Reliability Score (0–100). Higher = less reliable data or harder access. Inputs: data confidence, upcoming sessions, closure periods, review count, appointment-only.'

export default function RiskBadge({ score }) {
  const { label, border, text } = getRiskLabel(score)
  return (
    <span title={RISK_TOOLTIP} className={`inline-flex items-center gap-1.5 px-2 py-0.5 border text-[10px] font-bold tracking-widest uppercase whitespace-nowrap ${border} ${text} bg-card cursor-help`}>
      <span className={`w-1.5 h-1.5 rounded-none ${text.replace('text-', 'bg-')}`} />
      {label}
    </span>
  )
}
