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
        className="glass-card flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-gray-300 hover:text-white text-xs font-medium transition-all"
      >
        <Download size={13} /> {t('exportCSV')}
      </button>
      <button
        onClick={exportPDF}
        disabled={loading}
        className="glass-card flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-gray-300 hover:text-white text-xs font-medium transition-all disabled:opacity-50"
      >
        <Download size={13} /> {loading ? '…' : t('exportPDF')}
      </button>
      {showFlyer && flyerCoords && (
        <button
          onClick={openFlyer}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20 text-xs font-medium transition-all border border-yellow-400/20"
        >
          <FileText size={13} /> {t('downloadFlyer')} ({lang.toUpperCase()})
        </button>
      )}
    </div>
  )
}
