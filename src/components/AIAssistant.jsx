import { useState, useRef, useEffect } from 'react'
import { MessageSquare, X, Send, Sparkles } from 'lucide-react'
import OpenAI from 'openai'
import { fetchResources, fetchResourceById, fetchResourceReviews } from '../api/lemontree'
import { analyzeReviews } from '../utils/sentiment'

const client = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY ?? '',
  dangerouslyAllowBrowser: true,
})

const SYSTEM_PROMPT = `You are a food access analyst in the Lemontree Insights Dashboard, used by food banks, donors, and government agencies to understand US food assistance resources.

Three dashboard views: Food Bank (operational quality, satisfaction, wait times), Donor (household reach, resource coverage, donor impact), Government (supply-demand gaps, food deserts, high-barrier regions).

Three tools: search_resources searches by the "text" field, which matches against resource names -- many resources include the city name, so searching "Charlotte" or "Gleaners" works well. get_resource_details fetches a specific resource by ID. get_resource_reviews fetches visitor reviews and sentiment. Always use a tool to fetch real data before answering resource-specific questions.

ML scores per resource: Risk Score (0–100): <30 low, 30–59 medium, ≥60 high. Barrier Index (0–1): >0.6 high-barrier. Food Desert Clusters: Well Served → Moderate Access → Strained Resources → Food Desert. VADER Sentiment (−1 to 1): >0.5 positive, <−0.5 negative.

When referencing data from tool results, cite the relevant field names so the user can verify. 
Give actionable recommendations where possible. 

Do not use markdown or em dashes. 

`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_resources',
      description: 'Search food resources by name. The text param matches resource names -- many include the city name so searching "Charlotte" or "Detroit" returns local resources. Filter by type with resourceTypeId.',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Search term matched against resource names. Can be a city name, org name, or keyword.' },
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
  if (name === 'search_resources') {
    const params = { take: args.take ?? 10 }
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
      resourceType: r.resourceType?.name,
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

async function runAgent(conversationMessages) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversationMessages.slice(-10),
  ]

  for (let i = 0; i < 5; i++) {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 500,
      tools: TOOLS,
      tool_choice: 'auto',
      messages,
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
      const content = await runAgent([...messages, userMsg])
      setMessages(prev => [...prev, { role: 'assistant', content }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message}. Check your VITE_OPENAI_API_KEY in .env` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 ${
          open
            ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 rotate-90'
            : 'bg-gradient-to-br from-yellow-400 to-yellow-500 text-gray-900 hover:shadow-yellow-400/30 hover:shadow-2xl hover:scale-105'
        }`}
      >
        {open ? <X size={20} /> : <MessageSquare size={20} />}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-96 max-h-[520px] flex flex-col glass rounded-2xl shadow-2xl shadow-black/40 animate-slide-right overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-gray-800/80 to-gray-800/40 border-b border-gray-700/50">
            <div className="w-7 h-7 rounded-full bg-yellow-400/20 flex items-center justify-center">
              <Sparkles size={14} className="text-yellow-400" />
            </div>
            <div>
              <span className="font-semibold text-sm text-white block leading-tight">Lemontree AI</span>
              <span className="text-[10px] text-green-400 font-medium">● Online</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                <div className={`max-w-[80%] text-sm px-3.5 py-2.5 leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-gradient-to-br from-yellow-400 to-yellow-500 text-gray-900 font-medium rounded-2xl rounded-br-md'
                    : 'bg-gray-800/80 text-gray-200 rounded-2xl rounded-bl-md border border-gray-700/30'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start animate-fade-in">
                <div className="bg-gray-800/80 text-gray-400 text-sm px-4 py-3 rounded-2xl rounded-bl-md border border-gray-700/30 flex gap-1.5">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="flex gap-2 p-3 border-t border-gray-800/50">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ask about the data..."
              className="flex-1 bg-gray-800/50 border border-gray-700/50 text-sm text-white px-3.5 py-2.5 rounded-xl focus:outline-none focus:border-yellow-400/50 placeholder-gray-600 transition-all"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-yellow-500 hover:from-yellow-300 hover:to-yellow-400 text-gray-900 rounded-xl flex items-center justify-center disabled:opacity-30 transition-all duration-200 disabled:cursor-not-allowed"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
