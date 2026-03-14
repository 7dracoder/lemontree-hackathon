import { useState, useRef, useEffect } from 'react'
import { MessageSquare, X, Send, Bot, Sparkles } from 'lucide-react'
import OpenAI from 'openai'

const SYSTEM_PROMPT = `You are an AI assistant embedded in the Lemontree Food Access Insights Dashboard.
Lemontree is a nonprofit that connects 350,000+ households to free food resources across the US.
The dashboard has 3 views:
- Food Bank View: satisfaction ratings, wait times, access barriers, service disruptions per pantry
- Donor View: households reached (subscriptions), resource coverage maps, offering breakdowns
- Government View: supply vs demand gaps, food desert clustering, access barrier index per region
The data comes from platform.foodhelpline.org/api/resources — 14,169 food resources nationwide.
Key fields: ratingAverage, waitTimeMinutesAverage, acceptingNewClients, confidence, flags, tags, occurrenceSkipRanges, _count.reviews, _count.resourceSubscriptions.
ML models: Risk Score (0-100), K-Means Food Desert Clustering (4 zones), Access Barrier Index (0-1).
Help users understand charts, interpret data, and draw insights. Be concise and practical.`

const client = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY ?? '',
  dangerouslyAllowBrowser: true,
})

export default function AIAssistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hi! I'm your Lemontree data assistant 🍋 Ask me anything about the dashboard, charts, or insights." },
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
      const res = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages.slice(-8), userMsg],
        max_tokens: 400,
      })
      setMessages(prev => [...prev, { role: 'assistant', content: res.choices[0].message.content }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error: ${e.message}. Check your VITE_OPENAI_API_KEY in .env` }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* FAB Button */}
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
          {/* Header */}
          <div className="flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-gray-800/80 to-gray-800/40 border-b border-gray-700/50">
            <div className="w-7 h-7 rounded-full bg-yellow-400/20 flex items-center justify-center">
              <Sparkles size={14} className="text-yellow-400" />
            </div>
            <div>
              <span className="font-semibold text-sm text-white block leading-tight">Lemontree AI</span>
              <span className="text-[10px] text-green-400 font-medium">● Online</span>
            </div>
          </div>

          {/* Messages */}
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

          {/* Input */}
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
