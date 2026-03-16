/**
 * GET /api/placement-recommendations
 *
 * Returns top pantry placement recommendations ordered by placement_score desc.
 * Reads from Supabase pantry_placement_recommendations table (global top 5).
 * If ?state=NY provided, queries zip_placement_scores filtered by state instead.
 * Falls back to data/outputs/placement_recs.json if Supabase is unavailable.
 *
 * Query params: state (optional, 2-letter abbreviation e.g. "NY")
 * Response: JSON array of recommendation objects
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FALLBACK_PATH = path.join(__dirname, '..', 'data', 'outputs', 'placement_recs.json')
const TOP_N = 5

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )

    const state = req.query?.state?.toUpperCase() || null

    let data, error
    if (state) {
      ;({ data, error } = await supabase
        .from('zip_placement_scores')
        .select('zip, placement_score, state')
        .eq('state', state)
        .order('placement_score', { ascending: false })
        .limit(TOP_N))
      if (!error && data?.length) {
        const zips = data.map((r) => r.zip)
        const { data: geo } = await supabase
          .from('zip_coverage_gap')
          .select('zip, zip_lat, zip_lon')
          .in('zip', zips)
        const geoMap = Object.fromEntries((geo || []).map((g) => [g.zip, g]))
        data = data.map((r) => ({ ...r, zip_lat: geoMap[r.zip]?.zip_lat ?? null, zip_lon: geoMap[r.zip]?.zip_lon ?? null }))
      }
    } else {
      ;({ data, error } = await supabase
        .from('pantry_placement_recommendations')
        .select('*')
        .order('placement_score', { ascending: false })
        .limit(TOP_N))
    }

    if (error) throw error
    if (!data || data.length === 0) throw new Error('No rows returned from Supabase')

    res.status(200).json(data)
  } catch (err) {
    // Fallback to local JSON
    try {
      const raw = fs.readFileSync(FALLBACK_PATH, 'utf-8')
      const fallback = JSON.parse(raw)
      res.status(200).json(fallback.slice(0, TOP_N))
    } catch (fallbackErr) {
      res.status(500).json({
        error: 'Failed to load placement recommendations',
        detail: err.message,
      })
    }
  }
}
