import { useState, useEffect } from 'react'
import OpenAI from 'openai'
import { TrendingUp, TrendingDown, Minus, Sparkles, Loader } from 'lucide-react'
import { fetchResourceReviews } from '../api/lemontree'
import { analyzeReviews, sentimentLabel } from '../utils/sentiment'

const client = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY ?? '',
  dangerouslyAllowBrowser: true,
})

function ScoreBar({ label, value, color }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] font-semibold tracking-wider uppercase text-secondary">
        <span>{label}</span>
        <span>{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-card border border-border">
        <div className={`h-full ${color}`} style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  )
}

export default function SentimentPanel({ resource }) {
  const [reviews, setReviews] = useState([])
  const [analysis, setAnalysis] = useState(null)
  const [report, setReport] = useState('')
  const [loadingReviews, setLoadingReviews] = useState(false)
  const [loadingReport, setLoadingReport] = useState(false)

  useEffect(() => {
    if (!resource?.id) return
    setReviews([])
    setAnalysis(null)
    setReport('')
    setLoadingReviews(true)
    fetchResourceReviews(resource.id)
      .then(data => {
        setReviews(data)
        setAnalysis(analyzeReviews(data))
      })
      .finally(() => setLoadingReviews(false))
  }, [resource?.id])

  const generateReport = async () => {
    if (!analysis || loadingReport) return
    setLoadingReport(true)
    setReport('')
    try {
      const sampleTexts = analysis.scored.slice(0, 5).map(r => `- "${r.text}"`).join('\n')
      const prompt = `You are a food access analyst. A community food pantry called "${resource.name}" in 
      ${resource.city}, ${resource.state} has the following sentiment profile from ${analysis.count} visitor reviews:

VADER Scores:
- Compound: ${analysis.compound.toFixed(3)} (range -1 to 1)
- Positive: ${(analysis.pos * 100).toFixed(1)}%
- Negative: ${(analysis.neg * 100).toFixed(1)}%
- Neutral: ${(analysis.neu * 100).toFixed(1)}%
- Rating average: ${resource.ratingAverage ? resource.ratingAverage.toFixed(1) : 'N/A'} / 5

Sample review excerpts:
${sampleTexts}

Write a concise 2-paragraph report for a food bank manager covering: 
- overall visitor sentiment
- specific strengths and issues raised, 
- one actionable recommendation to improve service quality. Be practical and empathetic. 

No markdown.`

      const res = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      })
      setReport(res.choices[0].message.content)
    } catch (e) {
      setReport(`Error generating report: ${e.message}`)
    } finally {
      setLoadingReport(false)
    }
  }

  if (!resource) return null

  if (loadingReviews) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
        <Loader size={14} className="animate-spin" /> Loading sentiment…
      </div>
    )
  }

  if (!analysis || analysis.count === 0) {
    return (
      <p className="text-xs text-gray-600 py-2 text-center">No review text available for sentiment analysis.</p>
    )
  }

  const { label, color } = sentimentLabel(analysis.compound)
  const Icon = analysis.compound >= 0.05 ? TrendingUp : analysis.compound <= -0.05 ? TrendingDown : Minus

  return (
    <div className="mt-6 space-y-4 border-t border-border pt-4">
      <h4 className="text-[11px] font-bold text-secondary uppercase tracking-wider flex items-center gap-2">
        <Sparkles size={12} className="text-accent" /> Sentiment Analysis
      </h4>

      {/* Compound score */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <Icon size={14} className={color} />
            <span className={`text-[11px] font-bold tracking-wider uppercase ${color}`}>{label}</span>
            <span className="text-xs font-mono text-tertiary ml-auto">
              {analysis.compound >= 0 ? '+' : ''}{analysis.compound.toFixed(3)}
            </span>
          </div>
          <div className="h-2 bg-card border border-border">
            <div
              className={`h-full transition-all ${analysis.compound >= 0 ? 'bg-status-success' : 'bg-status-error'}`}
              style={{ width: `${Math.abs(analysis.compound) * 100}%`, marginLeft: analysis.compound < 0 ? `${(1 - Math.abs(analysis.compound)) * 100}%` : 0 }}
            />
          </div>
          <div className="flex justify-between text-[10px] uppercase tracking-wider font-semibold text-tertiary mt-1">
            <span>−1 NEG</span>
            <span className="text-secondary">{analysis.count} REVIEWS SCORED</span>
            <span>+1 POS</span>
          </div>
        </div>
      </div>

      {/* Pos / Neg / Neu bars */}
      <div className="space-y-2 mt-4">
        <ScoreBar label="Positive" value={analysis.pos} color="bg-status-success" />
        <ScoreBar label="Negative" value={analysis.neg} color="bg-status-error" />
        <ScoreBar label="Neutral" value={analysis.neu} color="bg-tertiary" />
      </div>

      {/* Generate Report */}
      <button
        onClick={generateReport}
        disabled={loadingReport}
        className="w-full mt-4 flex items-center justify-center gap-2 py-2 border border-accent bg-accent/10 text-accent text-[11px] uppercase tracking-wider font-bold hover:bg-accent/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loadingReport ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
        {loadingReport ? 'GENERATING...' : 'GENERATE AI REPORT'}
      </button>

      {report && (
        <div className="mt-3 bg-card border border-border p-3 text-xs tracking-wide text-primary leading-relaxed whitespace-pre-wrap font-mono shadow-inner shadow-black/50">
          <span className="text-accent font-bold mb-2 block">{'>> REPORT_GENERATED'}</span>
          {report}
        </div>
      )}
    </div>
  )
}
