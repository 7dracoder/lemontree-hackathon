import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessageSquare, X, Send, Sparkles } from 'lucide-react'
import { fetchResources, fetchResourceById, fetchResourceReviews } from '../api/lemontree'
import { analyzeReviews } from '../utils/sentiment'
import { computeRiskScore, computeBarrierIndex } from '../utils/mlScoring'

async function chatCompletion({ messages, model = 'gpt-4o-mini', max_tokens = 500, tools, tool_choice }) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, model, max_tokens, tools, tool_choice }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error ?? res.statusText ?? 'AI request failed')
  }
  return res.json()
}

const BASE_PROMPT = `You are a food access analyst in the Lemontree Insights Dashboard.

Always use a tool before answering resource-specific questions. Three tools:
1) search_resources 
2) get_resource_details
3) get_resource_reviews

Consider the quantitative scores:  
1) Risk Score (0–100): <30 low, 30–59 medium, ≥60 high
2) Barrier Index (0–1): >0.6 high-barrier
3) Food Desert Clusters: Well Served → Moderate Access → Strained Resources → Food Desert. 
4) VADER Sentiment (−1 to 1): >0.5 positive, <−0.5 negative.

When referencing data from tool results, cite the relevant field names so the user can verify.
Do not use markdown or em dashes. Speak in typical prose.`

const VIEW_PROMPTS = {
  foodbank: `You are assisting a food bank operator.

  Focus on operational quality:
  visitor satisfaction, wait times, staffing capacity, review sentiment, and risk scores

  Highlight issues that affect day-to-day service delivery and suggest concrete improvements
  a pantry manager could act on.`,

  donor: `You are assisting a donor or funding organization. 
  
  Focus on impact metrics: 
  household reach, resource coverage gaps, which pantries serve the most people, 
  and where additional funding would have the greatest effect. 

  Frame findings in terms of donor ROI and community outcomes.`,

  government: `You are assisting a government or policy analyst. 

  Focus on systemic gaps: 
  food deserts, high-barrier regions, supply-demand mismatches, and underserved ZIP codes. 
  
  Highlight structural issues that require policy intervention or resource reallocation.`,
}

function getSystemPrompt(view) {
  const viewContext = VIEW_PROMPTS[view] ?? `You are viewing the Lemontree Insights Dashboard. Answer questions about food assistance resources across all perspectives.`
  return `${BASE_PROMPT}\n\n${viewContext}`
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_resources',
      description: 'Search food assistance resources. Use lat/lng for geographic searches (preferred for city queries -- provide approximate city center coordinates). Use text to search by resource or organization name. Combine both for best results.',
      parameters: {
        type: 'object',
        properties: {
          lat: { type: 'number', description: 'Latitude of city or location center, e.g. 35.2271 for Charlotte NC' },
          lng: { type: 'number', description: 'Longitude of city or location center, e.g. -80.8431 for Charlotte NC' },
          text: { type: 'string', description: 'Search by resource or organization name' },
          resourceTypeId: { type: 'string', description: 'Filter by type: FOOD_PANTRY or SOUP_KITCHEN' },
          take: { type: 'number', description: 'Number of results to return, default 10, max 50' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_resource_details',
      description: 'Get full details of a specific food resource by its ID, including hours, tags, contacts, and ML risk/barrier scores.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The resource ID' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_resource_reviews',
      description: 'Get visitor reviews and VADER sentiment analysis for a specific resource by its ID.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The resource ID' },
        },
        required: ['id'],
      },
    },
  },
]

async function executeTool(name, args) {
  console.log(`[AI Tool] ${name}`, args)
  if (name === 'search_resources') {
    const params = { take: args.take ?? 10 }
    if (args.lat != null) params.lat = args.lat
    if (args.lng != null) params.lng = args.lng
    if (args.text) params.text = args.text
    if (args.resourceTypeId) params.resourceTypeId = args.resourceTypeId
    const data = await fetchResources(params)
    const resources = data.resources ?? (Array.isArray(data) ? data : [])
    return resources.map(r => ({
      id: r.id,
      name: r.name,
      city: r.city,
      state: r.state,
      ratingAverage: r.ratingAverage,
      acceptingNewClients: r.acceptingNewClients,
      reviewCount: r._count?.reviews ?? 0,
      subscriptions: r._count?.resourceSubscriptions ?? 0,
      resourceType: r.resourceType?.name,
      confidence: r.confidence ?? null,
      riskScore: computeRiskScore(r),
      barrierIndex: computeBarrierIndex(r),
    }))
  }

  if (name === 'get_resource_details') {
    return await fetchResourceById(args.id)
  }

  if (name === 'get_resource_reviews') {
    const reviews = await fetchResourceReviews(args.id)
    const sentiment = analyzeReviews(reviews)
    return {
      reviews: reviews.slice(0, 10),
      sentiment: {
        compound: sentiment.compound,
        pos: sentiment.pos,
        neg: sentiment.neg,
        neu: sentiment.neu,
        count: sentiment.count,
      },
    }
  }

  return { error: `Unknown tool: ${name}` }
}

async function runAgent(conversationMessages, view) {
  const messages = [
    { role: 'system', content: getSystemPrompt(view) },
    ...conversationMessages.slice(-10),
  ]

  for (let i = 0; i < 5; i++) {
    const response = await chatCompletion({
      messages,
      model: 'gpt-4o-mini',
      max_tokens: 500,
      tools: TOOLS,
      tool_choice: 'auto',
    })

    const choice = response.choices[0]

    if (choice.finish_reason === 'stop') {
      return choice.message.content
    }

    if (choice.finish_reason === 'tool_calls') {
      messages.push(choice.message)
      for (const toolCall of choice.message.tool_calls) {
        let result
        try {
          const args = JSON.parse(toolCall.function.arguments)
          onToolCall?.(toolCall.function.name, args)
          result = await executeTool(toolCall.function.name, args)
        } catch (e) {
          result = { error: e.message }
        }
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result).slice(0, 3000),
        })
      }
      continue
    }

    return choice.message.content ?? 'No response.'
  }

  return 'I was unable to complete that request after several attempts.'
}

export default function AIAssistant() {
  const [params] = useSearchParams()
  const view = params.get('view')
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I'm your Lemontree data assistant. Ask me about food resources in any city, a specific pantry's details, or what visitors have said about a location." },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    if (!input.trim() || loading) return
    const userMsg = { role: 'user', content: input.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    try {
      const agentMessages = [...messages, userMsg].filter(m => m.role !== 'tool')
      const content = await runAgent(agentMessages, view)
      setMessages(prev => [...prev, { role: 'assistant', content }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}. The AI service may be misconfigured.` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className={`fixed bottom-6 right-6 z-50 w-12 h-12 flex items-center justify-center transition-all duration-200 border ${
          open
            ? 'bg-page text-secondary border-border hover:bg-surface hover:text-primary'
            : 'bg-accent text-page border-accent hover:bg-accent/90 shadow-none'
        }`}
      >
        {open ? <X size={20} /> : <MessageSquare size={20} />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[400px] max-h-[520px] flex flex-col bg-card border border-border shadow-2xl shadow-black/60 animate-fade-in-up">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-page">
            <div className="w-8 h-8 bg-accent/10 border border-accent flex items-center justify-center">
              <Sparkles size={14} className="text-accent" />
            </div>
            <div>
              <span className="font-display font-semibold text-sm tracking-wide uppercase text-primary block leading-tight">Lemontree AI</span>
              <span className="text-[10px] text-status-success font-semibold tracking-wider uppercase">● SYS_ONLINE</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                {m.role === 'tool' ? (
                  <div className="text-[10px] font-mono text-tertiary border border-border px-3 py-1.5 bg-surface tracking-wide max-w-full break-all">
                    ⚙ {m.content}
                  </div>
                ) : (
                  <div className={`max-w-[85%] text-xs tracking-wide px-4 py-3 leading-relaxed border ${
                    m.role === 'user'
                      ? 'bg-accent/10 border-accent text-accent'
                      : 'bg-page border-border text-primary'
                  }`}>
                    {m.content}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex justify-start animate-fade-in">
                <div className="bg-page border border-border px-4 py-3 flex gap-2">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="flex gap-2 p-4 border-t border-border bg-page">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="ENTER QUERY..."
              className="flex-1 bg-card border border-border text-xs tracking-wide uppercase text-primary px-4 py-3 focus:outline-none focus:border-accent placeholder:text-tertiary transition-colors"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="w-12 h-12 bg-accent text-page hover:bg-accent/90 border border-accent flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
