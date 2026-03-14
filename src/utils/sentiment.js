import Sentiment from 'vader-sentiment'

const analyzer = Sentiment.SentimentIntensityAnalyzer

/**
 * Run VADER on an array of review objects with a `text` field.
 * Returns aggregate scores plus per-review breakdown.
 */
export function analyzeReviews(reviews) {
  const withText = reviews.filter(r => r.text && r.text.trim().length > 0)

  if (withText.length === 0) {
    return { compound: 0, pos: 0, neg: 0, neu: 1, count: 0, scored: [] }
  }

  const scored = withText.map(r => ({
    ...r,
    scores: analyzer.polarity_scores(r.text),
  }))

  const avg = key => scored.reduce((s, r) => s + r.scores[key], 0) / scored.length

  return {
    compound: avg('compound'),
    pos: avg('pos'),
    neg: avg('neg'),
    neu: avg('neu'),
    count: scored.length,
    scored,
  }
}

/** Returns a label and color based on compound score (-1 to 1). */
export function sentimentLabel(compound) {
  if (compound >= 0.5) return { label: 'Very Positive', color: 'text-green-400' }
  if (compound >= 0.05) return { label: 'Positive', color: 'text-green-300' }
  if (compound > -0.05) return { label: 'Neutral', color: 'text-gray-400' }
  if (compound > -0.5) return { label: 'Negative', color: 'text-red-300' }
  return { label: 'Very Negative', color: 'text-red-400' }
}
