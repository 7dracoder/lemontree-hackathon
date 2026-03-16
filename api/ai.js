import OpenAI from 'openai';

/**
 * Serverless proxy for OpenAI. Keeps OPENAI_API_KEY server-side.
 * POST body: { messages, model?, max_tokens?, tools?, tool_choice? }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
    return;
  }

  try {
    const { messages, model = 'gpt-4o-mini', max_tokens = 500, tools, tool_choice } = req.body ?? {};
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Body must include messages array.' });
      return;
    }

    const openai = new OpenAI({ apiKey: key });
    const options = { model, max_tokens, messages };
    if (tools != null) options.tools = tools;
    if (tool_choice != null) options.tool_choice = tool_choice;

    const completion = await openai.chat.completions.create(options);
    res.status(200).json(completion);
  } catch (e) {
    console.error('[api/ai]', e?.message ?? e);
    res.status(500).json({
      error: e?.message ?? 'OpenAI request failed',
      type: e?.type ?? 'unknown',
    });
  }
}
