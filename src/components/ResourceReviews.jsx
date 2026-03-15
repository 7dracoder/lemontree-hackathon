import { useState, useEffect } from 'react'
import { Star, Clock, CheckCircle, XCircle, Camera } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'
import { supabase } from '../utils/supabase'

const DID_NOT_ATTEND_REASONS = [
  'Location was closed',
  'Arrived too late',
  'Too far to travel',
  'Requirements not met',
  'Other',
]

function StarPicker({ value, onChange, readOnly = false }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          disabled={readOnly}
          onClick={() => !readOnly && onChange?.(n)}
          onMouseEnter={() => !readOnly && setHover(n)}
          onMouseLeave={() => !readOnly && setHover(0)}
          className={`text-lg transition-transform ${
            n <= (hover || value) ? 'text-yellow-400' : 'text-gray-600'
          } ${readOnly ? 'cursor-default' : 'cursor-pointer hover:scale-110'}`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

function ReviewCard({ review }) {
  const { t } = useTranslation()
  // Skip soft-deleted reviews
  if (review.deletedAt) return null
  return (
    <div className="bg-gray-800 rounded-lg p-3 space-y-1.5 border border-gray-700">
      <div className="flex items-center justify-between">
        <StarPicker value={review.rating ?? 0} readOnly />
        <span className="text-xs text-gray-500">
          {new Date(review.createdAt).toLocaleDateString()}
        </span>
      </div>
      {review.attended === false && (
        <div className="flex items-center gap-1 text-xs text-red-400">
          <XCircle size={11} />
          {t('no')}
          {review.didNotAttendReason ? ` — ${review.didNotAttendReason}` : ''}
        </div>
      )}
      {review.attended === true && (
        <div className="flex items-center gap-1 text-xs text-green-400">
          <CheckCircle size={11} /> {t('yes')}
        </div>
      )}
      {review.waitTimeMinutes != null && (
        <div className="flex items-center gap-1 text-xs text-gray-400">
          <Clock size={11} /> {review.waitTimeMinutes} {t('minutes')}
        </div>
      )}
      {review.text && (
        <p className="text-sm text-gray-300 leading-relaxed">{review.text}</p>
      )}
      {review.photoUrl && review.photoPublic && (
        <a
          href={review.photoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-blue-400 underline"
        >
          <Camera size={11} /> View photo
        </a>
      )}
      <div className="text-xs text-gray-600">
        {t('infoAccurate')}{' '}
        {review.informationAccurate === true ? '✅' : review.informationAccurate === false ? '❌' : '—'}
      </div>
    </div>
  )
}

const SUPABASE_TABLE = 'resource_reviews'

function rowToReview(row) {
  if (!row) return null
  return {
    id: row.id,
    createdAt: row.created_at,
    deletedAt: row.deleted_at ?? null,
    rating: row.rating ?? 0,
    attended: row.attended ?? null,
    didNotAttendReason: row.did_not_attend_reason ?? null,
    waitTimeMinutes: row.wait_time_minutes ?? null,
    text: row.review_text ?? row.text ?? null,
    informationAccurate: row.information_accurate ?? null,
    shareTextWithResource: row.share_text_with_resource ?? false,
    photoUrl: row.photo_url ?? null,
    photoPublic: row.photo_public ?? null,
  }
}

export default function ResourceReviews({ resource }) {
  const { t } = useTranslation()
  const [showForm, setShowForm] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [persistedReviews, setPersistedReviews] = useState([])
  const [reviewsLoading, setReviewsLoading] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [form, setForm] = useState({
    rating: 0,
    attended: null,
    didNotAttendReason: '',
    waitTimeMinutes: '',
    text: '',
    informationAccurate: null,
    shareTextWithResource: false,
  })

  const resourceId = resource?.id ?? null

  useEffect(() => {
    if (!resourceId) {
      setPersistedReviews([])
      return
    }
    let cancelled = false
    setReviewsLoading(true)
    supabase
      .from(SUPABASE_TABLE)
      .select('*')
      .eq('resource_id', String(resourceId))
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        setReviewsLoading(false)
        if (error) {
          console.warn('Supabase reviews fetch failed:', error.message)
          setPersistedReviews([])
          return
        }
        setPersistedReviews((data ?? []).map(rowToReview))
      })
    return () => { cancelled = true }
  }, [resourceId])

  const ratingAvg = resource?.ratingAverage
  const apiReviewCount = resource?._count?.reviews ?? 0
  const reviewCount = apiReviewCount + persistedReviews.length

  const handleSubmit = async e => {
    e.preventDefault()
    setSubmitError(null)
    if (!form.rating || !resourceId) return
    const payload = {
      resource_id: String(resourceId),
      rating: form.rating,
      attended: form.attended,
      did_not_attend_reason: form.attended === false ? (form.didNotAttendReason || null) : null,
      wait_time_minutes: form.waitTimeMinutes ? parseInt(form.waitTimeMinutes, 10) : null,
      review_text: form.text?.trim() || null,
      information_accurate: form.informationAccurate,
      share_text_with_resource: form.shareTextWithResource ?? false,
    }
    const { data, error } = await supabase.from(SUPABASE_TABLE).insert(payload).select().single()
    if (error) {
      setSubmitError(error.message)
      return
    }
    setPersistedReviews(prev => [rowToReview(data), ...prev])
    setSubmitted(true)
    setShowForm(false)
    setForm({ rating: 0, attended: null, didNotAttendReason: '', waitTimeMinutes: '', text: '', informationAccurate: null, shareTextWithResource: false })
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-white text-sm flex items-center gap-2">
          ⭐ {t('reviews')}
          <span className="text-xs text-gray-400 font-normal">({reviewCount})</span>
        </h3>
        <button
          onClick={() => { setShowForm(f => !f); setSubmitted(false) }}
          className="text-xs px-3 py-1 rounded-full bg-yellow-400/20 text-yellow-400 hover:bg-yellow-400/30 transition-all"
        >
          + {t('submitReview')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-gray-800/60 rounded-lg p-2.5 text-center border border-gray-700">
          <div className="text-xl font-bold text-yellow-400">
            {ratingAvg ? ratingAvg.toFixed(1) : '—'}
          </div>
          <div className="text-xs text-gray-400">{t('ratingAverage')}</div>
          {ratingAvg && <StarPicker value={Math.round(ratingAvg)} readOnly />}
        </div>
        <div className="bg-gray-800/60 rounded-lg p-2.5 text-center border border-gray-700">
          <div className="text-xl font-bold text-blue-400">{reviewCount}</div>
          <div className="text-xs text-gray-400">{t('totalReviews')}</div>
        </div>
      </div>

      {/* Success message */}
      {submitted && (
        <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-3 text-center text-green-400 text-sm">
          {t('reviewSubmitted')}
        </div>
      )}

      {/* Submit error */}
      {submitError && (
        <div className="bg-red-500/20 border border-red-500/30 rounded-lg p-3 text-center text-red-400 text-sm">
          {submitError}
        </div>
      )}

      {/* Review Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-gray-800/80 border border-yellow-400/20 rounded-xl p-4 space-y-3"
        >
          <p className="text-sm font-medium text-white">{t('submitReview')}</p>

          {/* Star rating */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">{t('rating')} *</label>
            <StarPicker value={form.rating} onChange={r => setForm(f => ({ ...f, rating: r }))} />
          </div>

          {/* Got help */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">{t('didYouGetHelp')}</label>
            <div className="flex gap-2">
              {[true, false].map(v => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, attended: v }))}
                  className={`px-3 py-1 rounded-full text-xs transition-all ${
                    form.attended === v
                      ? 'bg-yellow-400 text-gray-900 font-medium'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {v ? t('yes') : t('no')}
                </button>
              ))}
            </div>
          </div>

          {/* Reason if not attended */}
          {form.attended === false && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">{t('reasonNotHelped')}</label>
              <select
                value={form.didNotAttendReason}
                onChange={e => setForm(f => ({ ...f, didNotAttendReason: e.target.value }))}
                className="w-full bg-gray-700 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 outline-none"
              >
                <option value="">Select…</option>
                {DID_NOT_ATTEND_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}

          {/* Wait time */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">{t('waitTime')}</label>
            <input
              type="number"
              min="0"
              value={form.waitTimeMinutes}
              onChange={e => setForm(f => ({ ...f, waitTimeMinutes: e.target.value }))}
              placeholder="e.g. 15"
              className="w-full bg-gray-700 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 outline-none"
            />
          </div>

          {/* Info accurate */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">{t('infoAccurate')}</label>
            <div className="flex gap-2">
              {[true, false].map(v => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, informationAccurate: v }))}
                  className={`px-3 py-1 rounded-full text-xs transition-all ${
                    form.informationAccurate === v
                      ? 'bg-yellow-400 text-gray-900 font-medium'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {v ? t('yes') : t('no')}
                </button>
              ))}
            </div>
          </div>

          {/* Comments */}
          <div>
            <label className="text-xs text-gray-400 block mb-1">{t('comments')}</label>
            <textarea
              value={form.text}
              onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
              rows={3}
              placeholder="Optional…"
              className="w-full bg-gray-700 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 outline-none resize-none"
            />
          </div>

          {/* Share with org */}
          <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={form.shareTextWithResource}
              onChange={e => setForm(f => ({ ...f, shareTextWithResource: e.target.checked }))}
              className="accent-yellow-400"
            />
            {t('shareWithResource')}
          </label>

          <button
            type="submit"
            disabled={!form.rating}
            className="w-full py-2 rounded-lg bg-yellow-400 text-gray-900 font-semibold text-sm hover:bg-yellow-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {t('submitBtn')}
          </button>
        </form>
      )}

      {/* Persisted reviews from Supabase */}
      {reviewsLoading && (
        <p className="text-xs text-gray-500 text-center py-2">Loading reviews…</p>
      )}
      {!reviewsLoading && persistedReviews.length > 0 && (
        <div className="space-y-2">
          {persistedReviews.map(r => <ReviewCard key={r.id} review={r} />)}
        </div>
      )}

      {!reviewsLoading && persistedReviews.length === 0 && reviewCount === 0 && !showForm && (
        <p className="text-xs text-gray-500 text-center py-2">{t('noReviews')}</p>
      )}
    </div>
  )
}
