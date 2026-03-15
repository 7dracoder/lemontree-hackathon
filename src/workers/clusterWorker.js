/**
 * Web Worker: runs K-Means clustering off the main thread so the UI stays responsive.
 */
import { clusterResources } from '../utils/mlScoring.js'

self.onmessage = (e) => {
  const { resources, k = 4, runId } = e.data
  try {
    const result = clusterResources(resources, k)
    self.postMessage({ ok: true, result, runId })
  } catch (err) {
    self.postMessage({ ok: false, error: err?.message ?? String(err), runId })
  }
}
