/**
 * GET /api/zip-demographics
 *
 * Returns zip-level demographic + coverage gap data for choropleth map.
 * Joins zip_coverage_gap with zip_demographics (columns needed for map only).
 *
 * Query params:
 *   zip         (optional) — return a single zip record
 *   state       (optional) — filter by first 3 chars of zip (rough state prefix)
 *   limit       (optional) — default 1000, max 5000
 *   sw_lat, sw_lon, ne_lat, ne_lon (optional) — bbox filter for visible map area
 *
 * Response: JSON array of objects with choropleth-relevant columns only:
 *   zip, zip_lat, zip_lon, coverage_gap, pantry_count_nearby,
 *   snap_rate, median_income, social_vulnerability_score,
 *   transit_score, limited_english_pct
 */

import { createClient } from '@supabase/supabase-js'

const CHOROPLETH_COLS = [
  'zip', 'zip_lat', 'zip_lon', 'coverage_gap', 'pantry_count_nearby',
  'snap_rate', 'median_income', 'social_vulnerability_score',
  'transit_score', 'limited_english_pct',
].join(',')

const DEFAULT_LIMIT = 1000
const MAX_LIMIT = 5000

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') {
    res.status(200).end()
    return
  }

  const { zip, state, limit: limitParam, sw_lat, sw_lon, ne_lat, ne_lon } = req.query

  const limit = Math.min(parseInt(limitParam) || DEFAULT_LIMIT, MAX_LIMIT)

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    )

    // Fetch coverage gap rows (with lat/lon for map)
    let gapQuery = supabase
      .from('zip_coverage_gap')
      .select('zip, zip_lat, zip_lon, coverage_gap, pantry_count_nearby')
      .limit(limit)

    if (zip) {
      gapQuery = gapQuery.eq('zip', zip.toString().padStart(5, '0'))
    }
    if (state) {
      // Rough state prefix filter — zip prefixes are not exact state boundaries
      // but close enough for map viewport filtering
      gapQuery = gapQuery.like('zip', `${state}%`)
    }
    if (sw_lat && sw_lon && ne_lat && ne_lon) {
      gapQuery = gapQuery
        .gte('zip_lat', parseFloat(sw_lat))
        .lte('zip_lat', parseFloat(ne_lat))
        .gte('zip_lon', parseFloat(sw_lon))
        .lte('zip_lon', parseFloat(ne_lon))
    }

    const { data: gapData, error: gapError } = await gapQuery
    if (gapError) throw gapError
    if (!gapData || gapData.length === 0) {
      res.status(200).json([])
      return
    }

    // Fetch matching demographic rows
    const zips = gapData.map(r => r.zip)
    const { data: demoData, error: demoError } = await supabase
      .from('zip_demographics')
      .select('zip, snap_rate, median_income, social_vulnerability_score, transit_score, limited_english_pct')
      .in('zip', zips)

    if (demoError) throw demoError

    // Join in memory
    const demoMap = Object.fromEntries((demoData || []).map(d => [d.zip, d]))
    const result = gapData.map(g => ({
      zip: g.zip,
      zip_lat: g.zip_lat,
      zip_lon: g.zip_lon,
      coverage_gap: g.coverage_gap,
      pantry_count_nearby: g.pantry_count_nearby,
      snap_rate: demoMap[g.zip]?.snap_rate ?? null,
      median_income: demoMap[g.zip]?.median_income ?? null,
      social_vulnerability_score: demoMap[g.zip]?.social_vulnerability_score ?? null,
      transit_score: demoMap[g.zip]?.transit_score ?? null,
      limited_english_pct: demoMap[g.zip]?.limited_english_pct ?? null,
    }))

    res.status(200).json(result)
  } catch (err) {
    res.status(500).json({
      error: 'Failed to load zip demographics',
      detail: err.message,
    })
  }
}
