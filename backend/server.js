import dotenv from "dotenv";
dotenv.config();

import express from "express";

import bodyParser from "body-parser";

import cors from "cors";

import fetch from "node-fetch";

import bcrypt from "bcryptjs";

import {
  customAlphabet
} from 'nanoid';

import db from "./database.js";

import { autoAssignTicket } from "./autoAssign.js";

import AuthController from "./AuthController.js";

import {
  authenticateJWT,
  authorizeRoles
} from "./auth.js";

const app = express();

const corsOptions = {
  origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  credentials: true,

  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(bodyParser.json());

// In-memory per-user conversation context storage
const userConversations = new Map();

// Ollama fallback state per user: { active: bool, attempts: number }
const ollamaState = new Map();

const OLLAMA_DISSATISFIED_PHRASES = [
  "that didn't help", "that did not help", "didn't work", "did not work",
  "still not working", "still broken", "not helpful", "doesn't work",
  "doesnt work", "not working still", "same problem", "same issue",
  "still have the problem", "still having the issue", "no luck",
  "that didn't fix", "that did not fix", "still stuck", "nothing changed"
];

async function callOllama(prompt) {
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'llama3.2', prompt, stream: false }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return (data.response || '').trim() || null;
  } catch (_) {
    return null;
  }
}

async function validateWithOllama(chatterBotReply, userMessage) {
  const prompt = `You are evaluating an IT support chatbot response.

User message: "${userMessage}"
Chatbot response: "${chatterBotReply}"

Is this response a genuinely helpful IT support answer that directly addresses the user's issue? Reply with only YES or NO.`;

  const result = await callOllama(prompt);
  if (!result) return true; // if Ollama is down, pass through
  return result.toUpperCase().startsWith('YES');
}

async function generateOllamaResponse(userMessage, conversationHistory) {
  const historyText = conversationHistory.length > 1
    ? `Previous messages: ${conversationHistory.slice(0, -1).join(' | ')}\n`
    : '';
  const prompt = `You are an expert IT support specialist. Give a clear, step-by-step troubleshooting response for this IT issue. Be concise and practical. Do not use emojis.

${historyText}User issue: "${userMessage}"

Provide specific troubleshooting steps:`;

  return await callOllama(prompt);
}

// Audit Log Helper Function
function logAudit(db, { userId, userName, userRole, action, ticketId = null, details = null, ipAddress = null, userAgent = null }) {
  const query = `
    INSERT INTO auditLogs (user_id, userName, userRole, action, ticket_id, details, ipAddress, userAgent, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `;
  db.run(query, [userId, userName, userRole, action, ticketId, details, ipAddress, userAgent], function(err) {
    if (err) {
      console.error("Error logging audit:", err.message);
    }
  });
}


function logLlamaCall(db, { userId, userMessage, chatterbotResponse, llamaResponse, triggerReason }) {
  db.run(
    `INSERT INTO llama_logs (user_id, ticket_id, user_message, chatterbot_response, llama_response, was_resolved, trigger_reason)
     VALUES (?, NULL, ?, ?, ?, 0, ?)`,
    [userId, userMessage, chatterbotResponse || null, llamaResponse, triggerReason],
    function(err) {
      if (err) console.error("[llama_logs] Insert error:", err.message);
    }
  );
}

function markLlamaResolved(db, userId) {
  db.run(
    `UPDATE llama_logs SET was_resolved = 1
     WHERE user_id = ? AND ticket_id IS NULL AND was_resolved = 0
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
    function(err) {
      if (err) console.error("[llama_logs] Resolve update error:", err.message);
    }
  );
}

function markLlamaTicketCreated(db, userId, ticketId) {
  db.run(
    `UPDATE llama_logs SET ticket_id = ?, was_resolved = 0
     WHERE user_id = ? AND ticket_id IS NULL AND was_resolved = 0
     ORDER BY created_at DESC LIMIT 1`,
    [ticketId, userId],
    function(err) {
      if (err) console.error("[llama_logs] Ticket link error:", err.message);
    }
  );
}

// ticket id generator
const generateTicketId = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 10);

async function fetchMlPrediction(title, description) {
  try {
    const response = await fetch('http://localhost:5006/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (_) {
    return null;
  }
}

app.get("/", (req, res) => {
  res.send("Backend is running!");
});

const authController = new AuthController();
app.use("/auth", authController.getRouter());

// chatbot

// Fallback category detection only if the python server crashes or is unreachable
function detectCategoryFallback(message) {
  const msgLower = message.toLowerCase();
  
  const categories = {
    'Network': ['wifi', 'wi-fi', 'internet', 'network', 'connection', 'router', 'modem', 'ethernet', 'wireless', 'connectivity', 'vpn', 'dns' , 'network down', 'vpn outage', 'connection outage', 'internet down'],
   
    'Software': ['software', 'app', 'application', 'program', 'install', 'crash', 'crashed', 'crashing', 'error', 'bug', 'update', 'freezing', 'frozen', 'slow', 'not responding', 'blue screen', 'blue-screen', 'blue screen of death', 'bsod', 'database', 'server down', 'system down', 'app crashed', 'zoom', 'teams', 'microsoft teams', 'excel', 'word', 'powerpoint', 'chrome', 'firefox', 'edge', 'browser', 'adobe', 'slack', 'not opening', 'command prompt', 'cmd', 'task manager', 'file explorer', 'windows update', 'performance', 'lagging',
   'payment', 'transaction', 'system failure', 'payment failure'
    ],


    'Hardware': [
      'hardware', 'computer', 'pc', 'desktop', 'laptop', 'printer', 'print', 'monitor', 'screen', 'black screen', 'no power', 'won\'t turn on', 'not turning on',
      'keyboard', 'mouse', 'webcam', 'speaker', 'usb', 'cable', 'device', 'charger', 'battery', 'power', 'broken', 'damaged', 'peripheral'
    ],

    'Password': [
      'password', 'login', 'log in', 'signin', 'sign in', 'forgot', 'forgot password', 'reset', 'locked', 'locked out', "can't login", "cannot login", 'access', 'account', 'credentials', 'unlock', 'password reset'
    ],
    
    'Email': ['email', 'e-mail', 'mail', 'outlook', 'gmail', 'inbox', 'send email', 'receive email', 'email server', 'email down', 'emails down', 'cannot send emails', 'cant send emails', 'can\'t send emails', 'email not working', 'email issue', 'email problem']
  };
  
  for (const [category, keywords] of Object.entries(categories)) {
    for (const keyword of keywords) {
      if (msgLower.includes(keyword)) {
        return category;
      }
    }
  }
  return 'Other';
}

// Fallback priority detection
function detectPriorityFallback(message) {
  const msgLower = message.toLowerCase();

  const lowPriorityPhrases = [
    'tomorrow', 'tommorow', 'later', 'when you can', 'no rush', 'not urgent',
    'whenever', 'next week', 'soon', 'at some point', 'just asking',
    'no hurry', 'take your time', 'not a priority', 'can wait',
    'minor', 'small issue', 'not important', 'low priority'
  ];
  
  for (const phrase of lowPriorityPhrases) {
    if (msgLower.includes(phrase)) {
      return 'Low';
    }
  }
  // critical  priority tickets
const criticalKeywords = ['critical', 'emergency',
  'complete outage', 'entire office', 'entire team', 'all users affected',
  'system down', 'server down', 'complete failure', 'total failure',
  'everyone affected', 'company wide', 'department down', 'nothing works' , 'all departments', 'all departments affected', 'multiple departments' , 'all departments', 'all departments affected',
'no one can', 'nobody can', 'for all users',
'company-wide', 'company wide' ,  "ceo", "executive", "board meeting", "investor", "before presentation",
    "data breach", "security breach", "ransomware", "compromised",
    "phishing", "hacked", "unauthorized access"
];



  // High priority situations
  const highKeywords = [
    'not turning on', 'wont turn on', "won't turn on", 'laptop dead', 
    'computer dead', 'no power', 'black screen',
    'urgent',  'asap', 'immediately',
    'crashed', 'broken', 'down', 'not working at all', 
    "can't work", 'cannot work', 'cant work', 'blocked', 'deadline', 
    'important meeting', 'need it now', 'need them now', 'right now',
    'frustrated', 'affecting my work', 'blue screen', 'bsod', 'system crash' , 'not booting', 'wont boot', "won't boot", 'client meeting', 'customer meeting',
    'presentation', 'demo', 'need access' , 'locked out', 'locked', 'cannot log in', "can't log in", 'cant log in',
    'not booting', 'wont boot', "won't boot", 
    'client meeting', 'customer meeting', 'presentation',
    'failing to send', 'keeps disconnecting', 'disconnecting',
    'repeatedly', 'keeps happening'
  ];

  
  // MEDIUM Problems affecting work
  const mediumKeywords = [
   'not working', 'issue', 'problem', 'error', 'bug',
    'help', 'slow', 'stuck', 'failed', 'wrong',
    'freezing', 'frozen', 'crashing', 'not responding', 'trouble', 'difficult',
    'not printing', 'not sending', 'not receiving', 'not loading', 'not opening','loud noise', 'fan noise', 'overheating', 'very hot', 'running hot',
    'making noise', 'flickering', 'glitching', 'lagging', 'acting up', 'acting weird', 'not connecting', 'not syncing', 'not saving', 'offline', 'wont work', 'not starting', 'wont start',
    "won't  start", 'not turning on', 'running slow', 'very slow', 'unstable', 'not receiving', 'shows offline', 'since last update',
    'crashing when', 'failure', 'system failure', 'expired',
    'licence expired', 'unusable', 'no signal', 'cannot access application'
  ];
  // Check CRITICAL first
if (criticalKeywords.some(w => msgLower.includes(w))) {
  return 'Critical';
}
  // Check HIGH first
  if (highKeywords.some(w => msgLower.includes(w))) {
    return 'High';
  }
  
  // Check MEDIUM
  if (mediumKeywords.some(w => msgLower.includes(w))) {
    return 'Medium';
  }
  
  // Everything else is LOW questions, inquiries
  return 'Low';
}

// Category specific responses uses js as fallback if Python service unavailable
const FALLBACK_RESPONSES = {
  'Network': ' **Network Troubleshooting:**\n1. Restart your router/modem\n2. Check if WiFi is enabled\n3. Forget and reconnect to network\n4. Move closer to router\n\nType "create ticket" for support.',
  'Software': ' **Software Troubleshooting:**\n1. Close and reopen the application\n2. Restart your computer\n3. Check for software updates\n4. Reinstall if needed\n\nType "create ticket" for support.',
  'Hardware': ' **Hardware Troubleshooting:**\n1. Check all connections/cables\n2. Restart the device\n3. Try a different port\n4. Check for physical damage\n\nType "create ticket" for support.',
  'Password': ' **Password Reset:**\n1. Go to login page\n2. Click "Forgot Password"\n3. Check email for reset link\n4. Create a strong new password\n\nType "create ticket" for support.',
  'Email': ' **Email Troubleshooting:**\n1. Check internet connection\n2. Restart email client\n3. Verify email settings\n4. Clear cache\n\nType "create ticket" for support.',
  'Other': ' Please describe your issue in more detail, or type "create ticket" for immediate support.'
};

app.post("/chatbot", authenticateJWT, async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.user.user_id;

    console.log("User message:", message);

    if (!ollamaState.has(userId)) {
      ollamaState.set(userId, { active: false, attempts: 0 });
    }
    const ollama = ollamaState.get(userId);

    // cap at 10 to avoid memory overflow
    if (!userConversations.has(userId)) {
      userConversations.set(userId, []);
    }
    const conversation = userConversations.get(userId);
    // push the latest message
    conversation.push(message);
    if (conversation.length > 10) {
      conversation.shift();
    }

    // use full context not just latest message
    const conversationContext = conversation.join(' ');
    const detectionText = (conversationContext || message).trim();

    // If Ollama is already the active responder for this session, handle directly
    if (ollama.active && !message.toLowerCase().includes('create ticket')) {
      const isDissatisfied = OLLAMA_DISSATISFIED_PHRASES.some(p => message.toLowerCase().includes(p));

      if (isDissatisfied || ollama.attempts > 0) {
        ollama.attempts += 1;
        console.log(`[Ollama] Attempt ${ollama.attempts} for user ${userId}`);

        if (ollama.attempts >= 2) {
          // Auto-create ticket after 2 failed Ollama attempts
          console.log("[Ollama] 2 attempts exhausted - auto-creating ticket");
          const fallbackCategory = detectCategoryFallback(detectionText);
          const fallbackPriority = detectPriorityFallback(detectionText);
          const prevMessages = conversation.slice(0, -1);
          let titleSource = prevMessages.find(m => !['create ticket','open ticket','make ticket'].some(p => m.toLowerCase().includes(p))) || message;
          const title = titleSource.substring(0, 50) + (titleSource.length > 50 ? '...' : '');
          const description = `User reported: "${titleSource}". Ollama fallback exhausted after 2 attempts.`;
          const mlData = await fetchMlPrediction(title, description);
          const finalCategory = (mlData && mlData.category) ? mlData.category : fallbackCategory;
          const finalPriority = (mlData && mlData.priority) ? mlData.priority : fallbackPriority;
          const category_confidence = mlData ? (mlData.category_confidence ?? null) : null;
          const priority_confidence = mlData ? (mlData.priority_confidence ?? null) : null;
          const solution = FALLBACK_RESPONSES[finalCategory] || FALLBACK_RESPONSES['Other'];
          const ticket_id = generateTicketId();
          ollamaState.set(userId, { active: false, attempts: 0 });
          userConversations.set(userId, []);

          return new Promise((resolve) => {
            db.run(
              `INSERT INTO tickets (ticket_id, title, description, category, priority, status, created_by, solution, category_confidence, priority_confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [ticket_id, title, description, finalCategory, finalPriority, 'Open', userId, solution, category_confidence, priority_confidence],
              function (err) {
                if (err) return resolve(res.status(500).json({ error: err.message }));
                markLlamaTicketCreated(db, userId, ticket_id);
                autoAssignTicket(ticket_id);
                if (finalPriority === 'High' || finalPriority === 'Critical') {
                  setTimeout(() => {
                    db.all("SELECT userId FROM users WHERE role = 'support' OR role = 'admin'", [], (notifErr, staffMembers) => {
                      if (!notifErr && staffMembers) {
                        staffMembers.forEach(staff => {
                          db.run("INSERT INTO notifications (user_id, ticket_id, message, type, is_read, created_at) VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)",
                            [staff.userId, ticket_id, `New ${finalPriority} Priority Ticket: "${title}" has been created`, 'priority_alert']);
                        });
                      }
                    });
                  }, 100);
                }
                resolve(res.json({
                  ticketCreated: true, ticketId: ticket_id, priority: finalPriority, category: finalCategory,
                  category_confidence, priority_confidence, solution,
                  reply: "I wasn't able to resolve your issue after multiple attempts. I've automatically created a support ticket and a technician will follow up with you shortly."
                }));
              }
            );
          });
        }

        // Still within attempts  let Ollama try again
        const ollamaReply = await generateOllamaResponse(message, conversation);
        if (ollamaReply) {
          logLlamaCall(db, { userId, userMessage: message, chatterbotResponse: null, llamaResponse: ollamaReply, triggerReason: 'user_dissatisfied' });
          return res.json({ reply: ollamaReply, ticketCreated: false, source: 'ollama' });
        }
      }

      // User seems satisfied or Ollama is unavailable fall through to ChatterBot
    }

    // Check for "create ticket" FIRST before anything else runs
    if (message.toLowerCase().includes('create ticket')) {
      console.log("Create ticket detected - using conversation context for category/priority");

      const ctFallbackCategory = detectCategoryFallback(detectionText);
      const ctFallbackPriority = detectPriorityFallback(detectionText);

      // Prefer category/priority from prior conversation (excluding the current command)
      const prevContext = conversation.slice(0, -1).join(' ');
      const ctContextCategory = detectCategoryFallback(prevContext);
      const ctContextPriority = detectPriorityFallback(prevContext);

      const resolvedCategory = (ctContextCategory && ctContextCategory !== 'Other')
        ? ctContextCategory
        : (ctFallbackCategory && ctFallbackCategory !== 'Other' ? ctFallbackCategory : 'Other');

      const priorityRank = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
      const ctContextRank = priorityRank[ctContextPriority] || 1;
      const ctFallbackRank = priorityRank[ctFallbackPriority] || 1;
      const resolvedPriority = ctContextRank >= ctFallbackRank ? ctContextPriority : ctFallbackPriority;

      const validPriorities = ['Low', 'Medium', 'High', 'Critical'];
      const normalizedPriority = validPriorities.includes(resolvedPriority) ? resolvedPriority : 'Medium';

      // Use the previous message as title source, not the "create ticket" command
      let titleSource = message;
      for (let i = conversation.length - 2; i >= 0; i--) {
        const candidate = (conversation[i] || '').trim();
        if (!candidate) continue;
        const low = candidate.toLowerCase();
        if (['create ticket','open ticket','make ticket','open a ticket','escalate'].some(p => low === p || low.includes(p))) continue;
        titleSource = candidate;
        break;
      }

      const title = titleSource.substring(0, 50) + (titleSource.length > 50 ? '...' : '');
      const descSource = titleSource;
      let description;
      if (resolvedCategory === 'Network') description = `User reported a network/connectivity issue: "${descSource}"`;
      else if (resolvedCategory === 'Software') description = `User reported a software problem: "${descSource}"`;
      else if (resolvedCategory === 'Hardware') description = `User reported a hardware issue: "${descSource}"`;
      else if (resolvedCategory === 'Password') description = `User needs password/account assistance: "${descSource}"`;
      else if (resolvedCategory === 'Email') description = `User reported an email issue: "${descSource}"`;
      else description = `User request: "${descSource}"`;

      const solution = FALLBACK_RESPONSES[resolvedCategory] || FALLBACK_RESPONSES["Other"];

      userConversations.set(userId, []);
      ollamaState.set(userId, { active: false, attempts: 0 });
      console.log("Conversation context cleared for user", userId);
      console.log("Create ticket - Category:", resolvedCategory, "Priority:", normalizedPriority);

      const mlData = await fetchMlPrediction(title, description);
      const finalCategory = (mlData && mlData.category) ? mlData.category : resolvedCategory;
      const finalPriority = (mlData && mlData.priority) ? mlData.priority : normalizedPriority;
      const category_confidence = mlData ? (mlData.category_confidence ?? null) : null;
      const priority_confidence = mlData ? (mlData.priority_confidence ?? null) : null;

      const ticket_id = generateTicketId();
      const query = `INSERT INTO tickets (ticket_id, title, description, category, priority, status, created_by, solution, category_confidence, priority_confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      db.run(query, [ticket_id, title, description, finalCategory, finalPriority, 'Open', userId, solution, category_confidence, priority_confidence], function (err) {
        if (err) {
          console.error("Ticket creation error:", err);
          return res.status(500).json({ error: err.message });
        }
        console.log("Ticket created:", ticket_id, "Category:", finalCategory, "Priority:", finalPriority);
        markLlamaTicketCreated(db, userId, ticket_id);
        autoAssignTicket(ticket_id);
        if (finalPriority === "High" || finalPriority === "Critical") {
          setTimeout(() => {
            db.all("SELECT userId FROM users WHERE role = 'support' OR role = 'admin'", [], (notifErr, staffMembers) => {
              if (!notifErr && staffMembers) {
                staffMembers.forEach(staff => {
                  const alertMessage = `New ${finalPriority} Priority Ticket: "${title}" has been created`;
                  db.run("INSERT INTO notifications (user_id, ticket_id, message, type, is_read, created_at) VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)",
                    [staff.userId, ticket_id, alertMessage, 'priority_alert']);
                });
              }
            });
          }, 100);
        }
        return res.json({ ticketCreated: true, ticketId: ticket_id, priority: finalPriority, category: finalCategory, category_confidence, priority_confidence, solution });
      });
      return;
    }

    // Detect category and priority using Node.js fallback based on conversation context
    const fallbackCategory = detectCategoryFallback(detectionText);
    const fallbackPriority = detectPriorityFallback(detectionText);
    console.log("Conversation context:", conversationContext);
    console.log("Fallback category detection:", fallbackCategory);
    console.log("Fallback priority detection:", fallbackPriority);

    let data;

    try {
        const authHeader = req.headers.authorization
      // Send message to ChatterBot service Python
      const chatbotResponse = await fetch('http://localhost:5005/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader || ''
         },
        body: JSON.stringify({ message: message })
      });

      if (!chatbotResponse.ok) {
        throw new Error('ChatterBot service unavailable');
      }

      data = await chatbotResponse.json();
      console.log("ChatterBot response:", data);

      // don't clobber a strong Python match
      if (
        fallbackCategory && fallbackCategory !== 'Other' &&
        (
          !data.category ||
          data.category === 'Other' ||
          // If Python's category is not in allowedCategories, treat as weak
          !['Network','Software','Hardware','Password','Email'].includes(data.category)
        )
      ) {
        console.log(`Overriding Python category '${data.category}' with fallback '${fallbackCategory}'`);
        data.category = fallbackCategory;
        data.reply = FALLBACK_RESPONSES[fallbackCategory] || data.reply;
      }

    

      if (data.reply && typeof data.reply === 'string') {
        try {
          // Remove extended pictographic characters (emojis) using Unicode property
          data.reply = data.reply.replace(/\p{Extended_Pictographic}/gu, '').replace(/[\u2600-\u27BF]/g, '').trim();
        } catch (e) {
          // If the runtime doesn't support Unicode property escapes or regex fails,
          // fall back to removing a safer, smaller range.
          data.reply = data.reply.replace(/[\u2600-\u27BF]/g, '').trim();
        }
      }

    } catch (pythonError) {
      // Python service unavailable use Node.js fallback
      console.log("ChatterBot unavailable, using fallback");
      data = {
        reply: FALLBACK_RESPONSES[fallbackCategory],
        should_create_ticket: false,
        category: fallbackCategory,
        priority: fallbackPriority
      };
    }

    // ensure DB only stores valid enum values
    let normalizedPriority = data && data.priority ? String(data.priority).trim() : '';
    
    const validPriorities = ['Low', 'Medium', 'High', 'Critical'];

    if (!normalizedPriority || !validPriorities.includes(normalizedPriority)) {

      console.warn(`Invalid priority detected: "${normalizedPriority}", defaulting to Medium`);
      
      normalizedPriority = 'Medium'; // Default fallback
    }
    
    console.log("Normalized priority:", normalizedPriority);

    const allowedCategories = ['Network', 'Software', 'Hardware', 'Password', 'Email', 'Other'];
    const categoryMapping = {
      network: 'Network',
      'wi-fi': 'Network',
      software: 'Software',
      app: 'Software',
      hardware: 'Hardware',
      password: 'Password',
      login: 'Password',
      email: 'Email',
      mail: 'Email',
      other: 'Other'
    };

    let normalizedCategory = data && data.category ? String(data.category).trim() : '';
    if (normalizedCategory) {
      const key = normalizedCategory.toLowerCase();
      if (categoryMapping[key]) {
        normalizedCategory = categoryMapping[key];
      } else if (!allowedCategories.includes(normalizedCategory)) {
        // Try capitalizing single-word values
        normalizedCategory = normalizedCategory.charAt(0).toUpperCase() + normalizedCategory.slice(1).toLowerCase();
        if (!allowedCategories.includes(normalizedCategory)) {
          // fallback to node detection if available
          normalizedCategory = (fallbackCategory && fallbackCategory !== 'Other') ? fallbackCategory : 'Other';
        }
      }
    } else {
      normalizedCategory = (fallbackCategory && fallbackCategory !== 'Other') ? fallbackCategory : 'Other';
    }

    data.category = normalizedCategory;
    data.priority = normalizedPriority;

    console.log("Final response - Category:", data.category, "Priority:", normalizedPriority);

    // Check if ticket should be created
    if (data.should_create_ticket) {
      // Check if this is an escalated ticket
      const isEscalated = data.is_escalated || false;
      
      // Set title based on escalation
      let titleSource = message;

      // If the user sent a command like 'create ticket', prefer the previous
      // non-command user message from the conversation context as the title.
      const userConv = userConversations.get(userId) || [];
      if (message.toLowerCase().trim() === 'create ticket' || message.toLowerCase().includes('create ticket')) {
        // Look backwards through conversation excluding the last message (which is the command)
        for (let i = userConv.length - 2; i >= 0; i--) {
          const candidate = (userConv[i] || '').trim();
          if (!candidate) continue;
          const low = candidate.toLowerCase();
          // skip common command-like phrases
          if (['create ticket','open ticket','make ticket','open a ticket','escalate'].some(p => low === p || low.includes(p))) continue;
          // pick the first suitable candidate
          titleSource = candidate;
          break;
        }
      }

      // Build final title with escalation prefix if needed
      let title;
      if (isEscalated) {
        title = 'ESCALATED: ' + titleSource.substring(0, 40);
        if (titleSource.length > 40) title = title + '...';
      } else {
        title = titleSource.substring(0, 50);
        if (titleSource.length > 50) title = title + '...';
      }
      
      // Generate a better description based on category
      let description;
      // Use the same titleSource to build a more meaningful description when possible
      const descSource = (titleSource && titleSource !== message) ? titleSource : message;
      if (data.category === 'Network') {
        description = `User reported a network/connectivity issue: "${descSource}"`;
      } else if (data.category === 'Software') {
        description = `User reported a software problem: "${descSource}"`;
      } else if (data.category === 'Hardware') {
        description = `User reported a hardware issue: "${descSource}"`;
      } else if (data.category === 'Password') {
        description = `User needs password/account assistance: "${descSource}"`;
      } else if (data.category === 'Email') {
        description = `User reported an email issue: "${descSource}"`;
      } else {
        description = `User request: "${descSource}"`;
      }
      
      const mlData2 = await fetchMlPrediction(title, description);
      const finalCategory2 = (mlData2 && mlData2.category) ? mlData2.category : data.category;
      const finalPriority2 = (mlData2 && mlData2.priority) ? mlData2.priority : normalizedPriority;
      const category_confidence2 = mlData2 ? (mlData2.category_confidence ?? null) : null;
      const priority_confidence2 = mlData2 ? (mlData2.priority_confidence ?? null) : null;

      const ticket_id = generateTicketId();
      const query = `INSERT INTO tickets (ticket_id, title, description, category, priority, status, created_by, solution, category_confidence, priority_confidence)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      db.run(query, [ticket_id, title, description, finalCategory2, finalPriority2, 'Open', userId, data.reply, category_confidence2, priority_confidence2], function (err) {
        if (err) {
          console.error("Ticket creation error:", err);
          return res.status(500).json(
            {
              error: err.message
            }
          );
        }

        console.log("Ticket created:", ticket_id, "Category:", finalCategory2, "Priority:", finalPriority2);
        markLlamaTicketCreated(db, userId, ticket_id);
        autoAssignTicket(ticket_id);

        // timeout to avoid db lock
        if (finalPriority2 === "High" || finalPriority2 === "Critical") {
          setTimeout(() => {
            db.all("SELECT userId FROM users WHERE role = 'support' OR role = 'admin'", [], (notifErr, staffMembers) => {
              if (!notifErr && staffMembers) {
                staffMembers.forEach(staff => {
                  const alertMessage = `New ${finalPriority2} Priority Ticket: "${title}" has been created`;
                  db.run(
                    "INSERT INTO notifications (user_id, ticket_id, message, type, is_read, created_at) VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)",
                    [staff.userId, ticket_id, alertMessage, 'priority_alert']
                  );
                });
                console.log(`[CHATBOT] Notification sent to ${staffMembers.length} staff members for ticket ${ticket_id}`);
              }
            });
          }, 100);
        }

        res.json({
          ticketCreated: true,
          ticketId: ticket_id,
          priority: finalPriority2,
          category: finalCategory2,
          category_confidence: category_confidence2,
          priority_confidence: priority_confidence2,
          solution: data.reply,
          hardware_subcategory: data.hardware_subcategory || null,
          software_subcategory: data.software_subcategory || null,
          waiting_for: data.waiting_for || null,
          is_escalated: data.is_escalated || false
        });

      });
    } else {
      // Check if user is expressing dissatisfaction with a prior ChatterBot response
      const isDissatisfied = OLLAMA_DISSATISFIED_PHRASES.some(p => message.toLowerCase().includes(p));

      if (isDissatisfied) {
        console.log(`[Ollama] User dissatisfied — activating Ollama fallback for user ${userId}`);
        ollama.active = true;
        ollama.attempts = 1;
        const ollamaReply = await generateOllamaResponse(message, conversation);
        if (ollamaReply) {
          logLlamaCall(db, { userId, userMessage: message, chatterbotResponse: data.reply, llamaResponse: ollamaReply, triggerReason: 'user_dissatisfied' });
          return res.json({
            reply: ollamaReply,
            ticketCreated: false,
            category: data.category,
            priority: normalizedPriority,
            source: 'ollama'
          });
        }
        // Ollama unavailable — fall through to ChatterBot reply below
        ollama.active = false;
        ollama.attempts = 0;
      } else {
        // Validate ChatterBot's response with Ollama before sending
        const isGoodResponse = await validateWithOllama(data.reply, message);
        if (!isGoodResponse) {
          console.log("[Ollama] ChatterBot response deemed unhelpful — replacing with Ollama response");
          const ollamaReply = await generateOllamaResponse(message, conversation);
          if (ollamaReply) {
            logLlamaCall(db, { userId, userMessage: message, chatterbotResponse: data.reply, llamaResponse: ollamaReply, triggerReason: 'validation_failed' });
            return res.json({
              reply: ollamaReply,
              ticketCreated: false,
              category: data.category,
              priority: normalizedPriority,
              source: 'ollama'
            });
          }
        }
      }

      markLlamaResolved(db, userId);
      res.json({
        reply: data.reply,
        ticketCreated: false,
        category: data.category,
        priority: normalizedPriority,
        hardware_subcategory: data.hardware_subcategory || null,
        software_subcategory: data.software_subcategory || null,
        waiting_for: data.waiting_for || null,
        is_escalated: data.is_escalated || false
      });
    }

  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({
      error: 'Chatbot service unavailable. Please ensure ChatterBot is running on port 5005.',
      reply: 'Sorry, I\'m having technical difficulties. Please try again later.'
    });
  }
});
// Creating a ticket for authenticated user
app.post("/tickets", authenticateJWT, (req, res) => {
  const { title, description, category, priority } = req.body;
  const created_by = req.user.user_id;
  const status = "Open";
  
  const ticket_id = generateTicketId();

  const allowedCategories = [
    'Network',
    'Software',
    'Hardware',
    'Password',
    'Email',
    'Other'
  ];
  const validPriorities = ['Low', 'Medium', 'High','Critical'];

  let categoryValue = category ? String(category).trim() : '';
  if (categoryValue) {
    const matched = allowedCategories.find(c => c.toLowerCase() === categoryValue.toLowerCase());
    categoryValue = matched || 'Other';
  } else {
    categoryValue = 'Other';
  }

  let priorityValue = priority ? String(priority).trim() : '';
  if (priorityValue) {
    const matchedP = validPriorities.find(p => p.toLowerCase() === priorityValue.toLowerCase());
    priorityValue = matchedP || 'Medium';
  } else {
    priorityValue = 'Medium';
  }

  const query = `INSERT INTO tickets (ticket_id, title, description, category, priority, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)`;
  db.run(query, [ticket_id, title, description, categoryValue, priorityValue, status, created_by], function (err) {
    if (err) {
      // duplicate id
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(500).json(
          {
            error: "Failed to generate unique ticket ID. Please try again."
          });
      }
      return res.status(500).json(
        {
          error: err.message
        });
    }

    autoAssignTicket(ticket_id);

    // notify staff
    if (priorityValue === 'High' || priorityValue === 'Critical') {
      setTimeout(() => {
        db.all("SELECT userId FROM users WHERE role = 'support' OR role = 'admin'", [], (notifErr, staffMembers) => {
          if (!notifErr && staffMembers) {
            staffMembers.forEach(staff => {
              const alertMessage = `New ${priorityValue} Priority Ticket: "${title}" has been created`;
              db.run(
                "INSERT INTO notifications (user_id, ticket_id, message, type, is_read, created_at) VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)",
                [staff.userId, ticket_id, alertMessage, 'priority_alert']
              );
            });
            console.log(`[MANUAL] Notification sent to ${staffMembers.length} staff members for ticket ${ticket_id}`);
          }
        });
      }, 100);
    }
    logAudit(db,
      {
         userId: created_by,
         userName: req.user.name || 'Unknown',
         userRole: req.user.role,
         action: 'ticketCreate',
         ticketId: ticket_id,       // ticket id is the variable name 
         details: `Created ticket: ${title}`,
         ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      }
    )
    res.json({
      message: "Ticket created",
      ticket_id: ticket_id,
    });
  });
});

app.get("/tickets", authenticateJWT, (req, res) => {
  if (req.user.role === "admin" || req.user.role === "support") {
    db.all("SELECT * FROM tickets ORDER BY CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 WHEN 'Low' THEN 4 END, created_at DESC", [], (err, rows) => {

      if (err) return res.status(500).json(
        {
          error: err.message
        });
      
      res.json(rows);
    });
  } else {
    // user ticket 
 db.all("SELECT * FROM tickets WHERE created_by = ? ORDER BY CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 WHEN 'Low' THEN 4 END, created_at DESC", [req.user.user_id], (err, rows) => {
   if (err) return res.status(500).json(
     {
       error: err.message
     }
   );

      res.json(rows);
    });
  }
});

app.put("/tickets/:id", authenticateJWT, authorizeRoles("support", "admin"), (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const validStatus = ["Open", "In Progress", "Closed"];

  if (!validStatus.includes(status)) {
    return res.status(400).json(
      {
        error: "Invalid status value"
      });
  }

 const query = `UPDATE tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE ticket_id = ?`;
  db.run(query, [status, id], function (err) {
    if (err) return res.status(500).json(
      {
        error: err.message
      }
    );
    if (this.changes === 0) return res.status(404).json(
      {
        error: "Ticket not found"
      }
    );
     
     logAudit(db, {
      userId: req.user.user_id,
      userName: req.user.name || 'Unknown',
      userRole: req.user.role,
      action: 'statusChange',
      ticketId: id,
      details: `Status changed to: ${status}`,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json(
      {
        message: "Ticket status updated successfully"
      });
  });
});

app.delete("/tickets/:id", authenticateJWT, (req, res) => {
  const { id } = req.params;
  const userId = req.user.user_id;
  const userRole = req.user.role;

  db.get("SELECT created_by FROM tickets WHERE ticket_id = ?", [id], (err, ticket) => {
    if (err) return res.status(500).json(
      {
        error: err.message
      }
    );


    if (!ticket) return res.status(404).json(
      {
        error: "Ticket not found"
      }
    );

    if (userRole !== "admin" && userRole !== "support" && ticket.created_by !== userId) {
      return res.status(403).json(
        {
          error: "You can only delete your own tickets"
        }
      );
    }

    const query = `DELETE FROM tickets WHERE ticket_id = ?`;
    db.run(query, [id], function (error) {
      if (error) return res.status(500).json(
        {
          error: error.message
        }
      );
      logAudit(db, {
        userId: userId,
        userName: req.user.name || 'Unknown',
        userRole: userRole,
        action: 'ticketDelete',
        ticketId: id,
        details: `Deleted ticket: ${id}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
      res.json(
        {
          message: "Ticket has been deleted"
        }
      );
    });
  });
});



// Get my tickets endpoint
app.get("/tickets/me", authenticateJWT, (req, res) => {
  const userId = req.user.user_id;
  db.all(
  `SELECT * FROM tickets WHERE created_by = ? ORDER BY CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 WHEN 'Low' THEN 4 END, created_at DESC`,
    [userId],
    (err, rows) => {
      if (err) {
        console.error("Error fetching tickets:", err);
        return res.status(500).json(
          {
            error: err.message
          }
        );
      }
      res.json(rows);
    }
  );
});

// Get all tickets (for admin dashboard)
app.get("/tickets/all", authenticateJWT, authorizeRoles("admin", "support"), (req, res) => {
 db.all(`SELECT * FROM tickets ORDER BY CASE priority WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 WHEN 'Low' THEN 4 END, created_at DESC`, [], (err, rows) => {
    if (err) {
      return res.status(500).json(
        {
          error: err.message
        }
      );
    } else {
      res.json(rows);
    }
  });
});





// Add comment to ticket
app.post("/tickets/:id/comments", authenticateJWT, (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const user_id = req.user.user_id;
  
  const query = `INSERT INTO comments (ticket_id, user_id, comment, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)`;
  db.run(query, [id, user_id, comment], function (err) {
    if (err) {
      return res.status(500).json(
        {
          error: err.message
        }
      );
    }
    
    // Notification for ticket owner only if commenter is not the owner
    db.get("SELECT created_by, title FROM tickets WHERE ticket_id = ?", [id], (err, ticket) => {
      if (!err && ticket && ticket.created_by !== user_id) {
        // it will store  the supporter  comment text in the notification so the user can see what the supporter said 
        db.run(
          "INSERT INTO notifications (user_id, ticket_id, message, type, is_read, created_at) VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP)",
          [ticket.created_by, id, comment, 'comment']
        );
      }
    });


          // Log comment
      logAudit(db, {
        userId: user_id,
        userName: req.user.name || 'Unknown',
        userRole: req.user.role,
        action: 'commentAdd',
        ticketId: id,
        details: `Comment added: ${comment.substring(0, 100)}${comment.length > 100 ? '...' : ''}`,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
    
    res.json(
      {
        message: "Comment added", comment_id: this.lastID
      }
    );
  });
});

// Get ticket comments
app.get("/tickets/:id/comments", authenticateJWT, (req, res) => {
  const { id } = req.params;
  // Join with users table to get name and role
  const query = `
    SELECT comments.*, users.name, users.role 
    FROM comments 
    LEFT JOIN users ON comments.user_id = users.userId 
    WHERE comments.ticket_id = ? 
    ORDER BY comments.created_at
  `;
  db.all(query, [id], (err, rows) => {
    if (err) {
      return res.status(500).json(
        {
          error: err.message
        }
      );
    } else {
      res.json(rows);
    }
  });
});

// NOTIFICATIONS 

// Get notifications for logged-in user
app.get("/notifications", authenticateJWT, (req, res) => {
  const userId = req.user.user_id;
  db.all(
    "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC",
    [userId],
    (err, rows) => {
      if (err) {
        return res.status(500).json(
          {
            error: err.message
          }
        );
      }
      res.json(rows);
    }
  );
});

// Mark notification as read
app.put("/notifications/:id/read", authenticateJWT, (req, res) => {
  const { id } = req.params;
  db.run("UPDATE notifications SET is_read = 1 WHERE notification_id = ?", [id], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: "Notification marked as read" });
  });
});

// Mark all notifications as read
app.put("/notifications/mark-all-read", authenticateJWT, (req, res) => {
  const userId = req.user.user_id;
  db.run("UPDATE notifications SET is_read = 1 WHERE user_id = ?", [userId], (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: "All notifications marked as read" });
  });
});

// Delete all notifications for user (MUST come before /:id route)
app.delete("/notifications/delete-all", authenticateJWT, (req, res) => {
  const userId = req.user.user_id;
  const role = req.user.role;
  
  // Admin can delete all notifications in system, others only their own
  if (role === 'admin') {
    db.run("DELETE FROM notifications", [], function(err) {
      if (err) {
        return res.status(500).json({ error: "Failed to delete notifications" });
      }
      res.json(
        {
          message: "All notifications deleted", count: this.changes
        }
      );
    });
  } else {
    db.run("DELETE FROM notifications WHERE user_id = ?", [userId], function(err) {
      if (err) {
        return res.status(500).json(
          {
            error: "Failed to delete notifications"
          }
        );
      }
      res.json(
        {
          message: "All notifications deleted", count: this.changes
        }
      );
    });
  }
});

// Delete single notification
app.delete("/notifications/:id", authenticateJWT, (req, res) => {
  const { id } = req.params;
  const userId = req.user.user_id;

  db.run("DELETE FROM notifications WHERE notification_id = ? AND user_id = ?", [id, userId],
    function (err) {

      if (err) {
        console.error("[DELETE NOTIFICATION] Error:", err.message);
        return res.status(500).json(
          {
            error: err.message
          }
        );
      }

      if (this.changes === 0) {
        console.log(`[DELETE NOTIFICATION] Not found or not owned by user`);
        return res.status(404).json(
          {
            error: "Notification not found or not yours"
          }
        );
      }

      console.log(`[DELETE NOTIFICATION] Successfully deleted`);
      res.json(
        {
          message: "Notification deleted"
        }
      );
    }
  );
});

// Update ticket priority
app.put("/tickets/:id/priority", authenticateJWT, authorizeRoles("admin", "support"), (req, res) => {
  const { id } = req.params;
  const { priority } = req.body;
  const validPriority = ["Low", "Medium", "High", "Critical"];
  
  if (!validPriority.includes(priority)) {
    return res.status(400).json({ error: "Invalid priority value" });
  }
  
  const query = `UPDATE tickets SET priority = ? WHERE ticket_id = ?`;

  db.run(query, [priority, id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    } else {
      if (this.changes === 0) {
        
        return res.status(404).json(
        
          {
            error: "Ticket not found"
          });
        
        
      } else {
            // Log priority change
            logAudit(db, {
              userId: req.user.user_id,
              userName: req.user.name || 'Unknown',
              userRole: req.user.role,
              action: 'priorityChange',
              ticketId: id,
              details: `Priority changed to: ${priority}`,
              ipAddress: req.ip,
              userAgent: req.get('User-Agent')
            });

        res.json(
          {
            message: "Priority updated"
          }
        );
      }
    }
  });
});



// Get user profile
app.get("/users/me", authenticateJWT, (req, res) => {
  const userId = req.user.user_id;
  db.get("SELECT userId, name, email, role, created_at FROM users WHERE userId = ?",
    [userId], (err, row) => {
    if (err) {
      return res.status(500).json(
        {
          error: err.message
        }
      );
    } else {
      if (!row) {
        return res.status(404).json(
          {
            error: "User not found"
          }
        );
      } else {
        res.json(row);
      }
    }
  });
});

// Update user profile name, email
app.put("/users/me", authenticateJWT, (req, res) => {
  const userId = req.user.user_id;
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json(
      {
        error: "Name and email are required"
      });
  }



  //  user data 
  db.get("SELECT email FROM users WHERE userId = ?", [userId], (err, currentUser) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!currentUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const runUpdate = () => {
      // Update the user profile
      db.run("UPDATE users SET name = ?, email = ? WHERE userId = ?", [name, email, userId], function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
          return res.status(404).json({ error: "User not found" });
        }
        console.log(`Profile updated for user ${userId}: ${name}, ${email}`);

        logAudit(db, {
          userId: userId,
          userName: name,
          userRole: req.user.role,
          action: 'profileUpdate',
          ticketId: null,
          details: `Profile updated Name: ${name} | Email: ${email}`,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });

        res.json({ message: "Profile updated successfully", name, email });
      });
    };

    //  check email uniqueness if  email  changed
    if (email !== currentUser.email) {
      db.get("SELECT userId FROM users WHERE email = ? AND userId != ?", [email, userId], (err, existing) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        if (existing) {
          return res.status(400).json({ error: "Email is already in used by other user " });
        }
        runUpdate();
      });
    } else {
      runUpdate();
    }
  });
});

// Change user password
app.put("/users/me/password", authenticateJWT, (req, res) => {
  const userId = req.user.user_id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json(
      {
        error: "Current password and new password are required"
      }
    );
  }

  if (newPassword.length < 6) {
    return res.status(400).json(
      {
        error: "New password must be at least 6 characters"
      }
    );
  }

  // Get user's current password hash
  db.get("SELECT password FROM users WHERE userId = ?", [userId], async (err, user) => {
    if (err) {
      return res.status(500).json(
        {
          error: err.message    
          // 500 is a server error 
        }
      );
    }
    if (!user) {
      return res.status(404).json(
        {
          error: "User not found"
          //404 is not found error 
        }
      );
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json(
        {
          error: "Current password is incorrect"
        }
      );
    }

    // checking if the new password is same as the old one 
    const isSamePassword = await bcrypt.compare(newPassword, user.password);

    if (isSamePassword)
    {
      return res.status(400).json(
        {
          error: "the new password cant be same as the current one "
        }
      )
    }

    // Hash new password and update
    const hashedPassword = await bcrypt.hash(newPassword, 10); // 10 salt rounds
    db.run("UPDATE users SET password = ? WHERE userId = ?", [hashedPassword, userId], function(err) {
      if (err) {
        return res.status(500).json(
          {
            error: err.message
          }
        );
      }

      
      logAudit(db, {
          userId: userId,
          userName: req.user.name || 'Unknown',
          userRole: req.user.role,
          action: 'passwordChange',
          ticketId: null,
          details: 'Password changed successfully',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });

      console.log(`Password changed for user ${userId}`);
      res.json(
        {
          message: "Password changed successfully"
        }
      );
    });
  });
});


app.get("/audit-logs", authenticateJWT, authorizeRoles("admin"), (req, res) => {
  const query = `SELECT * FROM auditLogs ORDER BY created_at DESC LIMIT 1000`;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json(
        {
          error: err.message
        }
      );
    }
    res.json(rows);
  });
});


//  adding the user for the audit log

app.get("/users/all", authenticateJWT, authorizeRoles("admin"), (req, res) => {
  db.all("SELECT userId, name, email, role FROM users", [], (err, rows) => {
    if (err) {
      return res.status(500).json(
        {
          error: err.message
        }
      );
    }
    res.json(rows);
  });
});

app.get("/llama-logs", authenticateJWT, authorizeRoles("admin"), (req, res) => {
  db.all("SELECT * FROM llama_logs ORDER BY created_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Start server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`ChatterBot is running on http://localhost:5005`);
});
