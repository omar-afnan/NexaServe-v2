import fetch from "node-fetch";

const VALID_PRIORITIES = ["Low", "Medium", "High", "Critical"];
const CONFIDENCE_THRESHOLD = 0.5;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

// If ML priority confidence is below 0.5, ask Ollama (llama3.2) to re-evaluate
// the priority based on title + description. Falls back to the ML priority if
// Ollama is unreachable, returns a non-conforming reply, or throws.
//
// Returns: { priority: string, source: 'ml' | 'llama_correction' }
export async function correctPriorityWithLlama({
  title,
  description,
  mlPriority,
  priorityConfidence,
  mlAvailable = true,
}) {
  const safeMlPriority = VALID_PRIORITIES.includes(mlPriority) ? mlPriority : "Medium";
  const baseSource = mlAvailable ? "ml" : "fallback";

  if (priorityConfidence == null || priorityConfidence >= CONFIDENCE_THRESHOLD) {
    return {
      priority: safeMlPriority,
      source: baseSource
    };
  }

  const prompt = `You are an IT support priority classifier. Classify the ticket below into exactly one priority level.

Guidelines:
- Critical: complete outages, security breaches, data loss, executive blockers, company-wide failures
- High: a single user fully blocked, urgent deadlines, hardware failure, login lockout
- Medium: an issue affecting work but with a workaround
- Low: minor issues, requests, questions, no time pressure

Ticket title: ${title}
Ticket description: ${description}

Respond with only one word: Low, Medium, High, or Critical.`;

  try {
    const response = await fetch(OLLAMA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false }),
    });
    if (!response.ok) {
      console.warn(`[Llama] Priority correction skipped: HTTP ${response.status}`);
      return {
        priority: safeMlPriority,
        source: baseSource
      };
    }
    
    const data = await response.json();
    const raw = (data.response || "").trim();
    const match = VALID_PRIORITIES.find(p => new RegExp(`\\b${p}\\b`, "i").test(raw));
    if (!match) {
      console.warn(`[Llama] Priority correction skipped: unparsable reply "${raw}"`);
      return {
        priority: safeMlPriority,
        source: baseSource
      };
    }


    console.log(`[Llama] Priority corrected: ML="${safeMlPriority}" (conf=${priorityConfidence}) -> Llama="${match}"`);
    return {
      
      priority: match,
      source: "llama_correction"
    };
  }
  catch (err) {
    console.warn("[Llama] Priority correction failed:", err.message);
    return {
      priority: safeMlPriority,
      source: baseSource
    };
  }
}
