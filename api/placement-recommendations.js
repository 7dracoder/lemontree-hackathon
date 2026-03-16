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
  res.setHeader('Cache-Control', 'no-store')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL || 'https://sweceszfqssyzqyzpggc.supabase.co',
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'sb_publishable_CQV7UAc_2uHNKSNq6kVvVw_4GmAxF0c'
    )

    const urlState = req.query?.state || new URL(req.url, 'http://localhost').searchParams.get('state')
    const state = urlState?.toUpperCase() || null

    let data, error
    if (state) {
      ;({ data, error } = await supabase
        .from('zip_placement_scores')
        .select('zip, placement_score, state, explanation, model_r2')
        .eq('state', state)
        .order('placement_score', { ascending: false })
        .limit(TOP_N))
      if (!error && data?.length) {
        const zips = data.map((r) => r.zip)
        const { data: geo } = await supabase
          .from('zip_coverage_gap')
          .select('zip, zip_lat, zip_lon, snap_households, coverage_gap, pantry_count_nearby')
          .in('zip', zips)
        const geoMap = Object.fromEntries((geo || []).map((g) => [g.zip, g]))
        data = data.map((r) => {
          const g = geoMap[r.zip]
          return {
            ...r,
            zip_lat: g?.zip_lat ?? null,
            zip_lon: g?.zip_lon ?? null,
            snap_households: g?.snap_households ?? null,
            coverage_gap: g?.coverage_gap ?? null,
            pantry_count_nearby: g?.pantry_count_nearby ?? null,
          }
        })
      }
    } else {
      ;({ data, error } = await supabase
        .from('pantry_placement_recommendations')
        .select('*')
        .order('placement_score', { ascending: false })
        .limit(TOP_N))
    }

    if (error) throw error

    // When state is specified but no rows: return empty (don't fall back to national)
    if (state && (!data || data.length === 0)) {
      res.status(200).json([])
      return
    }

    if (!data || data.length === 0) throw new Error('No rows returned from Supabase')

    res.status(200).json(data)
  } catch (err) {
    // Fallback to local JSON only when no state filter (national view)
    if (state) {
      res.status(200).json([])
      return
    }
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
