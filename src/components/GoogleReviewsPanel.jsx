/**
 * GoogleReviewsPanel.jsx
 * ──────────────────────────────────────────────────────────────
 * Displays Google Places reviews for a pantry resource.
 * Sits alongside the existing ResourceReviews / SentimentPanel.
 *
 * Shows:
 *  • A "Load Google Reviews" button (lazy — preserves free-tier quota)
 *  • Google aggregate rating + total ratings count
 *  • Up to 5 individual review cards with star rating, author, date, text
 *  • A fuzzy-match warning when the Place result looks different from the resource
 *  • A "no API key" nudge when VITE_GOOGLE_PLACES_API_KEY is missing
 */

import { useState } from 'react'
import { Star, Globe, AlertTriangle, Loader, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import { useGoogleReviews } from '../hooks/useGoogleReviews'
import { analyzeReviews, sentimentLabel } from '../utils/sentiment'
import Sentiment from 'vader-sentiment'

const vader = Sentiment.SentimentIntensityAnalyzer

// ── Star display (read-only, supports half-stars via opacity) ─────────────
function StarRow({ rating, max = 5 }) {
  return (
    <span className="flex gap-0.5 items-center">
      {Array.from({ length: max }, (_, i) => {
        const filled = rating >= i + 1
        const half   = !filled && rating >= i + 0.5
        return (
          <span
            key={i}
            className="text-sm"
            style={{ color: filled || half ? '#facc15' : '#374151', opacity: half ? 0.6 : 1 }}
          >
            ★
          </span>
        )
      })}
    </span>
  )
}

// ── Individual review card ────────────────────────────────────────────────
function GoogleReviewCard({ review }) {
  const [expanded, setExpanded] = useState(false)
  const isLong  = review.text?.length > 180
  const shown   = isLong && !expanded ? review.text.slice(0, 180) + '…' : review.text

  // VADER sentiment badge for this review
  let sentColor = 'text-gray-400'
  let sentBadge = null
  if (review.text) {
    try {
      const scores = vader.polarity_scores(review.text)
      const { label, color } = sentimentLabel(scores.compound)
      sentColor = color
      sentBadge = label
    } catch (_) {}
  }

  return (
    <div className="bg-gray-800/60 rounded-xl p-3 space-y-2 border border-gray-700/50">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold text-white truncate max-w-[160px]">
            {review.author}
          </span>
          <StarRow rating={review.rating} />
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="text-[10px] text-gray-500">{review.relativeTime}</span>
          {sentBadge && (
            <span className={`text-[10px] font-medium ${sentColor}`}>{sentBadge}</span>
          )}
          {review.lang && review.lang !== 'en' && (
            <span className="text-[10px] text-amber-500/80 bg-amber-500/10 px-1.5 py-0.5 rounded">
              {review.lang.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Review text */}
      {review.text ? (
        <div>
          <p className="text-xs text-gray-300 leading-relaxed">{shown}</p>
          {isLong && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="flex items-center gap-0.5 text-[10px] text-yellow-400/70 hover:text-yellow-400 mt-1 transition-colors"
            >
              {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-600 italic">No review text</p>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────
export default function GoogleReviewsPanel({ resource }) {
  const {
    reviews, googleRating, totalRatings, placeName,
    matchWarning, status, error, fetchReviews, hasKey,
  } = useGoogleReviews(resource)

  if (!resource) return null

  // ── No API key configured ─────────────────────────────────────────────
  if (!hasKey) {
    return (
      <div className="mt-4 pt-4 border-t border-gray-700/50">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
          <Globe size={12} className="text-blue-400" /> Google Reviews
        </h4>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-300 space-y-1">
          <p className="font-medium">API key not configured</p>
          <p className="text-blue-400/70">
            Add <code className="bg-blue-900/40 px-1 rounded">VITE_GOOGLE_PLACES_API_KEY</code> to
            your <code className="bg-blue-900/40 px-1 rounded">.env</code> file to enable Google Places reviews.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-700/50 space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
          <Globe size={12} className="text-blue-400" /> Google Reviews
        </h4>
        {status === 'success' && placeName && (
          <a
            href={`https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeName)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-blue-400/60 hover:text-blue-400 flex items-center gap-0.5 transition-colors"
          >
            View on Maps <ExternalLink size={9} />
          </a>
        )}
      </div>

      {/* ── IDLE: fetch button ──────────────────────────────────────────── */}
      {status === 'idle' && (
        <button
          onClick={fetchReviews}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg
                     bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs
                     font-medium hover:bg-blue-500/20 transition-all"
        >
          <Globe size={12} />
          Load Google Reviews
        </button>
      )}

      {/* ── LOADING ─────────────────────────────────────────────────────── */}
      {status === 'loading' && (
        <div className="flex items-center justify-center gap-2 text-gray-500 text-xs py-3">
          <Loader size={13} className="animate-spin text-blue-400" />
          Searching Google Places…
        </div>
      )}

      {/* ── ERROR ───────────────────────────────────────────────────────── */}
      {status === 'error' && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 space-y-1.5">
          <p className="text-xs text-red-400 flex items-center gap-1.5">
            <AlertTriangle size={12} /> Could not load Google Reviews
          </p>
          <p className="text-[11px] text-red-400/60">{error}</p>
          <button
            onClick={fetchReviews}
            className="text-[11px] text-blue-400 hover:underline mt-1"
          >
            Try again
          </button>
        </div>
      )}

      {/* ── SUCCESS ─────────────────────────────────────────────────────── */}
      {status === 'success' && (
        <>
          {/* Fuzzy match warning */}
          {matchWarning && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5 flex items-start gap-2">
              <AlertTriangle size={12} className="text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-300/80 leading-relaxed">{matchWarning}</p>
            </div>
          )}

          {/* Aggregate rating row */}
          <div className="flex items-center gap-3 bg-gray-800/40 rounded-xl p-3 border border-gray-700/40">
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400">
                {googleRating != null ? googleRating.toFixed(1) : '—'}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">/ 5</div>
            </div>
            <div className="flex-1 space-y-1">
              <StarRow rating={googleRating ?? 0} />
              <p className="text-[11px] text-gray-500">
                {totalRatings.toLocaleString()} Google rating{totalRatings !== 1 ? 's' : ''}
              </p>
              {placeName && (
                <p className="text-[10px] text-gray-600 truncate">
                  Matched: <span className="text-gray-400">{placeName}</span>
                </p>
              )}
            </div>
          </div>

          {/* No reviews text */}
          {reviews.length === 0 && (
            <p className="text-xs text-gray-600 text-center py-1">
              No text reviews available on Google for this location.
            </p>
          )}

          {/* Review cards */}
          {reviews.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] text-gray-600 uppercase tracking-wider font-semibold">
                {reviews.length} recent review{reviews.length !== 1 ? 's' : ''} from Google
              </p>
              {reviews.map((r, i) => (
                <GoogleReviewCard key={i} review={r} />
              ))}
            </div>
          )}

          {/* Language note if mixed */}
          {reviews.some(r => r.lang && r.lang !== 'en') && (
            <p className="text-[10px] text-gray-600 text-center">
              Some reviews are in other languages — sentiment analysis may vary.
            </p>
          )}
        </>
      )}
    </div>
  )
}