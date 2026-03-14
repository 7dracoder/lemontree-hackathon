import { useState } from 'react'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import Papa from 'papaparse'
import { Download, FileText } from 'lucide-react'
import { getResourcePDFUrl } from '../api/lemontree'
import { useTranslation } from '../hooks/useTranslation'

export default function ExportButton({ data, dashboardId, showFlyer = false, flyerCoords }) {
  const [loading, setLoading] = useState(false)
  const { t, lang } = useTranslation()

  const exportCSV = () => {
    const csv = Papa.unparse(
      data.map(r => ({
        name: r.name,
        city: r.city,
        state: r.state,
        zipCode: r.zipCode,
        type: lang === 'es' ? (r.resourceType?.name_es ?? r.resourceType?.name) : r.resourceType?.name,
        ratingAverage: r.ratingAverage,
        confidence: r.confidence,
        riskScore: r.riskScore,
        reviews: r._count?.reviews,
        subscriptions: r._count?.resourceSubscriptions,
        openByAppointment: r.openByAppointment,
        website: r.website,
        phone: r.contacts?.[0]?.phone ?? '',
      }))
    )
    // Add BOM (Byte Order Mark) to force Excel to read the CSV as UTF-8 so non-English chars work properly
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `lemontree-${dashboardId}-${Date.now()}.csv`
    a.click()
  }

  const exportPDF = async () => {
    setLoading(true)
    try {
      const el = document.getElementById(dashboardId)
      if (!el) return setLoading(false)
      
      // useCORS is required to fetch elements (like maps/images) that have cross-origin urls
      const canvas = await html2canvas(el, { 
        backgroundColor: '#030712', 
        scale: 1.5,
        useCORS: true,
        allowTaint: true
      })
      
      const pdf = new jsPDF('l', 'mm', 'a4')
      const w = pdf.internal.pageSize.getWidth()
      const h = (canvas.height * w) / canvas.width
      
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, w, h)
      pdf.save(`lemontree-${dashboardId}-${Date.now()}.pdf`)
    } catch (e) {
      console.error("PDF Export failed:", e)
      alert("Failed to export PDF properly. Ensure all map tiles and images are loaded.")
    }
    setLoading(false)
  }

  const openFlyer = () => {
    if (!flyerCoords) return
    const url = getResourcePDFUrl(flyerCoords.lat, flyerCoords.lng, {
      locationName: flyerCoords.locationName ?? 'Food Resources Near You',
      flyerLang: lang,
    })
    window.open(url, '_blank')
  }

  return (
    <div className="flex gap-2 flex-wrap">
      <button
        onClick={exportCSV}
        className="bg-card border border-border flex items-center gap-2 px-4 py-2 text-xs font-semibold tracking-wide uppercase text-secondary hover:text-primary hover:bg-surface hover:border-accent transition-all"
      >
        <Download size={14} /> {t('exportCSV')}
      </button>
      <button
        onClick={exportPDF}
        disabled={loading}
        className="bg-card border border-border flex items-center gap-2 px-4 py-2 text-xs font-semibold tracking-wide uppercase text-secondary hover:text-primary hover:bg-surface hover:border-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Download size={14} /> {loading ? 'WAIT' : t('exportPDF')}
      </button>
      {showFlyer && flyerCoords && (
        <button
          onClick={openFlyer}
          className="bg-accent/10 border border-accent flex items-center gap-2 px-4 py-2 text-xs font-semibold tracking-wide uppercase text-accent hover:bg-accent/20 transition-all"
        >
          <FileText size={14} /> {t('downloadFlyer')} ({lang.toUpperCase()})
        </button>
      )}
    </div>
  )
}
