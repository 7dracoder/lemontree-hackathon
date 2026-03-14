import { getRiskLabel } from '../utils/mlScoring'

export default function RiskBadge({ score }) {
  const { label, bg, text } = getRiskLabel(score)
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${text}`}>
      {label === 'High Risk' ? '🔴' : label === 'Medium Risk' ? '🟡' : '🟢'}
      {label}
    </span>
  )
}
