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
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-gray-400">
        <span>{label}</span>
        <span>{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value * 100}%` }} />
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
      const prompt = `You are a food access analyst. A community food pantry called "${resource.name}" in ${resource.city}, ${resource.state} has the following sentiment profile from ${analysis.count} visitor reviews:

VADER Scores:
- Compound: ${analysis.compound.toFixed(3)} (range -1 to 1)
- Positive: ${(analysis.pos * 100).toFixed(1)}%
- Negative: ${(analysis.neg * 100).toFixed(1)}%
- Neutral: ${(analysis.neu * 100).toFixed(1)}%
- Rating average: ${resource.ratingAverage ? resource.ratingAverage.toFixed(1) : 'N/A'} / 5

Sample review excerpts:
${sampleTexts}

Write a concise 3-paragraph report for a food bank manager covering: (1) overall visitor sentiment, (2) specific strengths and issues raised, (3) one actionable recommendation to improve service quality. Be practical and empathetic.`

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
    <div className="mt-4 space-y-3 border-t border-gray-700/50 pt-4">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
        <Sparkles size={12} className="text-yellow-400" /> Sentiment Analysis
      </h4>

      {/* Compound score */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <Icon size={14} className={color} />
            <span className={`text-sm font-semibold ${color}`}>{label}</span>
            <span className="text-xs text-gray-500 ml-auto">
              {analysis.compound >= 0 ? '+' : ''}{analysis.compound.toFixed(3)}
            </span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${analysis.compound >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
              style={{ width: `${Math.abs(analysis.compound) * 100}%`, marginLeft: analysis.compound < 0 ? `${(1 - Math.abs(analysis.compound)) * 100}%` : 0 }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-gray-600 mt-0.5">
            <span>−1 Negative</span>
            <span className="text-gray-500">{analysis.count} reviews scored</span>
            <span>+1 Positive</span>
          </div>
        </div>
      </div>

      {/* Pos / Neg / Neu bars */}
      <div className="space-y-1.5">
        <ScoreBar label="Positive" value={analysis.pos} color="bg-green-500" />
        <ScoreBar label="Negative" value={analysis.neg} color="bg-red-500" />
        <ScoreBar label="Neutral" value={analysis.neu} color="bg-gray-500" />
      </div>

      {/* Generate Report */}
      <button
        onClick={generateReport}
        disabled={loadingReport}
        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-yellow-400/10 border border-yellow-400/30 text-yellow-400 text-xs font-medium hover:bg-yellow-400/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loadingReport ? <Loader size={12} className="animate-spin" /> : <Sparkles size={12} />}
        {loadingReport ? 'Generating…' : 'Generate AI Report'}
      </button>

      {report && (
        <div className="bg-gray-800/60 border border-gray-700/40 rounded-xl p-3 text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">
          {report}
        </div>
      )}
    </div>
  )
}
