import { useState, useEffect } from 'react'
import { Star, Clock, CheckCircle, XCircle, Camera, ChevronDown } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'

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
  if (review.deletedAt) return null
  return (
    <div className="bg-card p-4 space-y-2 border border-border">
      <div className="flex items-center justify-between border-b border-border pb-2 mb-2">
        <StarPicker value={review.rating ?? 0} readOnly />
        <span className="text-[10px] font-mono tracking-widest uppercase text-tertiary">
          {new Date(review.createdAt).toLocaleDateString()}
        </span>
      </div>
      {review.attended === false && (
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-bold text-status-error">
          <XCircle size={14} />
          {t('no')}
          {review.didNotAttendReason ? <span className="text-secondary font-normal truncate">{'// '}{review.didNotAttendReason}</span> : ''}
        </div>
      )}
      {review.attended === true && (
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-bold text-status-success">
          <CheckCircle size={14} /> {t('yes')}
        </div>
      )}
      {review.waitTimeMinutes != null && (
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-bold text-status-info">
          <Clock size={14} /> {review.waitTimeMinutes} {t('minutes')}
        </div>
      )}
      {review.text && (
        <p className="text-xs text-primary leading-relaxed font-mono whitespace-pre-wrap">{review.text}</p>
      )}
      {review.photoUrl && review.photoPublic && (
        <a
          href={review.photoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-[11px] text-accent uppercase tracking-wider font-bold hover:underline"
        >
          <Camera size={14} /> VIEW PHOTO
        </a>
      )}
      <div className="text-[10px] uppercase tracking-widest font-bold text-tertiary mt-2 pt-2 border-t border-border">
        {t('infoAccurate')}{' '}
        {review.informationAccurate === true ? <span className="text-status-success ml-1">✓</span> : review.informationAccurate === false ? <span className="text-status-error ml-1">✕</span> : '—'}
      </div>
    </div>
  )
}

export default function ResourceReviews({ resource }) {
  const { t } = useTranslation()
  const [showForm, setShowForm] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittedName, setSubmittedName] = useState('')
  const [localReviews, setLocalReviews] = useState([])
  const [form, setForm] = useState({
    rating: 0,
    attended: null,
    didNotAttendReason: '',
    waitTimeMinutes: '',
    text: '',
    informationAccurate: null,
    shareTextWithResource: false,
  })

  // Reset review state when the selected resource changes
  useEffect(() => {
    setSubmitted(false)
    setSubmittedName('')
    setShowForm(false)
    setLocalReviews([])
    setForm({ rating: 0, attended: null, didNotAttendReason: '', waitTimeMinutes: '', text: '', informationAccurate: null, shareTextWithResource: false })
  }, [resource?.id])

  const ratingAvg = resource?.ratingAverage
  const reviewCount = resource?._count?.reviews ?? 0

  const handleSubmit = e => {
    e.preventDefault()
    if (!form.rating) return
    // Build a ResourceReview object per the spec schema
    const review = {
      id: `local_${Date.now()}`,
      createdAt: new Date().toISOString(),
      deletedAt: null,
      rating: form.rating,
      attended: form.attended,
      didNotAttendReason: form.attended === false ? (form.didNotAttendReason || null) : null,
      waitTimeMinutes: form.waitTimeMinutes ? parseInt(form.waitTimeMinutes) : null,
      text: form.text || null,
      informationAccurate: form.informationAccurate,
      shareTextWithResource: form.shareTextWithResource,
      photoUrl: null,
      photoPublic: null,
      authorId: 'client_anonymous',
      resourceId: resource?.id ?? '',
      occurrenceId: null,
      userId: null,
      reviewedByUserId: null,
    }
    setLocalReviews(prev => [review, ...prev])
    setSubmittedName(resource?.name ?? 'this resource')
    setSubmitted(true)
    setShowForm(false)
    setForm({ rating: 0, attended: null, didNotAttendReason: '', waitTimeMinutes: '', text: '', informationAccurate: null, shareTextWithResource: false })
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h3 className="font-display font-bold text-primary text-sm flex items-center gap-2 uppercase tracking-wide">
          ⭐ {t('reviews')}
          <span className="text-[10px] text-tertiary font-mono">({reviewCount})</span>
        </h3>
        <button
          onClick={() => { setShowForm(f => !f); setSubmitted(false) }}
          className="text-[10px] uppercase tracking-widest font-bold px-3 py-1 border border-accent text-accent bg-accent/10 hover:bg-accent hover:text-page transition-colors"
        >
          + {t('submitReview')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card p-3 text-center border border-border">
          <div className="text-2xl font-display font-bold text-accent">
            {ratingAvg ? ratingAvg.toFixed(1) : '—'}
          </div>
          <div className="text-[10px] tracking-widest uppercase font-bold text-tertiary mt-1 mb-2">{t('ratingAverage')}</div>
          {ratingAvg && (
            <div className="flex justify-center">
              <StarPicker value={Math.round(ratingAvg)} readOnly />
            </div>
          )}
        </div>
        <div className="bg-card p-3 text-center border border-border flex flex-col justify-center">
          <div className="text-2xl font-display font-bold text-status-info">{reviewCount + localReviews.length}</div>
          <div className="text-[10px] tracking-widest uppercase font-bold text-tertiary mt-1">{t('totalReviews')}</div>
        </div>
      </div>

      {/* Success message */}
      {submitted && (
        <div className="bg-status-success/10 border border-status-success/30 p-3 text-center text-status-success text-[11px] font-bold uppercase tracking-wider">
          {t('reviewSubmitted')} — {submittedName}
        </div>
      )}

      {/* Review Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-card border border-accent p-5 space-y-4 shadow-2xl shadow-black/50"
        >
          <p className="text-[12px] font-bold tracking-widest uppercase text-primary border-b border-border pb-3">{t('submitReview')}</p>

          {/* Star rating */}
          <div>
            <label className="text-[10px] tracking-widest uppercase font-bold text-secondary block mb-2">{t('rating')} *</label>
            <StarPicker value={form.rating} onChange={r => setForm(f => ({ ...f, rating: r }))} />
          </div>

          {/* Got help */}
          <div>
            <label className="text-[10px] tracking-widest uppercase font-bold text-secondary block mb-2">{t('didYouGetHelp')}</label>
            <div className="flex gap-2">
              {[true, false].map(v => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, attended: v }))}
                  className={`px-4 py-1.5 text-[10px] tracking-widest font-bold uppercase transition-colors border ${
                    form.attended === v
                      ? 'bg-accent text-page border-accent'
                      : 'bg-surface text-secondary border-border hover:border-tertiary'
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
              <label className="text-[10px] tracking-widest uppercase font-bold text-secondary block mb-2">{t('reasonNotHelped')}</label>
              <select
                value={form.didNotAttendReason}
                onChange={e => setForm(f => ({ ...f, didNotAttendReason: e.target.value }))}
                className="w-full bg-surface text-primary text-[11px] font-mono p-3 border border-border focus:border-accent outline-none appearance-none rounded-none"
              >
                <option value="">SELECT REASON...</option>
                {DID_NOT_ATTEND_REASONS.map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
              </select>
            </div>
          )}

          {/* Wait time */}
          <div>
            <label className="text-[10px] tracking-widest uppercase font-bold text-secondary block mb-2">{t('waitTime')}</label>
            <input
              type="number"
              min="0"
              value={form.waitTimeMinutes}
              onChange={e => setForm(f => ({ ...f, waitTimeMinutes: e.target.value }))}
              placeholder="MINUTES"
              className="w-full bg-surface text-primary text-[11px] font-mono p-3 border border-border focus:border-accent outline-none placeholder:text-tertiary rounded-none"
            />
          </div>

          {/* Info accurate */}
          <div>
            <label className="text-[10px] tracking-widest uppercase font-bold text-secondary block mb-2">{t('infoAccurate')}</label>
            <div className="flex gap-2">
              {[true, false].map(v => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, informationAccurate: v }))}
                  className={`px-4 py-1.5 text-[10px] tracking-widest font-bold uppercase transition-colors border ${
                    form.informationAccurate === v
                      ? 'bg-accent text-page border-accent'
                      : 'bg-surface text-secondary border-border hover:border-tertiary'
                  }`}
                >
                  {v ? t('yes') : t('no')}
                </button>
              ))}
            </div>
          </div>

          {/* Comments */}
          <div>
            <label className="text-[10px] tracking-widest uppercase font-bold text-secondary block mb-2">{t('comments')}</label>
            <textarea
              value={form.text}
              onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
              rows={3}
              placeholder="OPTIONAL DETAILS..."
              className="w-full bg-surface text-primary text-[11px] font-mono p-3 border border-border focus:border-accent outline-none resize-none placeholder:text-tertiary rounded-none"
            />
          </div>

          {/* Share with org */}
          <label className="flex items-center gap-2 text-[10px] font-bold tracking-widest uppercase text-tertiary cursor-pointer hover:text-secondary group">
            <div className="w-4 h-4 border border-border bg-surface flex items-center justify-center group-hover:border-accent transition-colors">
              {form.shareTextWithResource && <div className="w-2 h-2 bg-accent" />}
            </div>
            <input
              type="checkbox"
              checked={form.shareTextWithResource}
              onChange={e => setForm(f => ({ ...f, shareTextWithResource: e.target.checked }))}
              className="hidden"
            />
            {t('shareWithResource')}
          </label>

          <button
            type="submit"
            disabled={!form.rating}
            className="w-full py-3 bg-accent text-page font-bold tracking-widest uppercase text-[11px] hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-accent mt-4"
          >
            {t('submitBtn')}
          </button>
        </form>
      )}

      {/* Local reviews (submitted this session) */}
      {localReviews.length > 0 && (
        <div className="space-y-3 mt-4">
          <h4 className="text-[10px] font-bold tracking-widest uppercase text-tertiary">SESSION REVIEWS</h4>
          {localReviews.map(r => <ReviewCard key={r.id} review={r} />)}
        </div>
      )}

      {localReviews.length === 0 && reviewCount === 0 && !showForm && (
        <p className="text-[10px] font-bold tracking-widest uppercase text-tertiary text-center py-4 border border-dashed border-border mt-4">
          {t('noReviews')}
        </p>
      )}
    </div>
  )
}
