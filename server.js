const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

console.log('🚀 FREE Chatbot (Ollama)...');

// Database
const db = new sqlite3.Database('./chatbot.db');
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS websites (
    id TEXT PRIMARY KEY, name TEXT, url TEXT, content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    conversation_count INTEGER DEFAULT 0
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY, site_id TEXT, user_message TEXT,
    bot_response TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Scrape website
async function scrapeWebsite(url) {
  const response = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 10000
  });
  const $ = cheerio.load(response.data);
  $('script, style').remove();
  return $('body').text().replace(/\s+/g, ' ').trim().substring(0, 12000);
}

// Generate response with FREE Ollama
async function generateResponse(message, content) {
  const response = await axios.post(process.env.OLLAMA_API + '/api/generate', {
    model: process.env.OLLAMA_MODEL,
    prompt: 'Website:\n' + content + '\n\nQuestion: ' + message + '\n\nAnswer briefly based ONLY on the content above.',
    stream: false
  });
  return response.data.response;
}


// Register website
app.post('/api/admin/register', async (req, res) => {
  try {
    const siteId = 'site_' + Math.random().toString(36).substr(2, 12);
    console.log('Registering site: ' + siteId);
    console.log('Website URL: ' + req.body.website_url);

    const content = await scrapeWebsite(req.body.website_url);
    console.log('Scraped content length: ' + content.length);

    db.run('INSERT INTO websites (id, name, url, content) VALUES (?, ?, ?, ?)',
      [siteId, req.body.website_name || req.body.website_url, req.body.website_url, content],
      (err) => {
        if (err) {
          console.error('Database error:', err);
          return res.status(500).json({ error: err.message });
        }

        const embedCode = '<script src="https://44.199.189.191:3000/widget.js" data-site-id="' + siteId + '"><\/script>';
        console.log('Sending response with siteId: ' + siteId);
        console.log('Embed code: ' + embedCode);

        res.json({
          siteId: siteId,
          embedCode: embedCode,
          message: 'Website registered successfully'
        });
      }
    );
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Chat
app.post('/api/chat', async (req, res) => {
  const message = req.body.message;
  const siteId = req.body.siteId;
  db.get('SELECT content FROM websites WHERE id = ?', [siteId], async (err, row) => {
    if (!row) return res.status(404).json({ error: 'Not found' });
    try {
      const response = await generateResponse(message, row.content);
      db.run('INSERT INTO conversations (site_id, user_message, bot_response) VALUES (?, ?, ?)',
        [siteId, message, response]);
      res.json({ response: response });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
});

// Widget script
app.get('/widget.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.send(`
(function() {
  function getSiteId() {
    const scripts = document.getElementsByTagName('script');
    for (let i = 0; i < scripts.length; i++) {
      const src = scripts[i].src;
      if (src && src.includes('widget.js')) {
        return scripts[i].getAttribute('data-site-id');
      }
    }
    return 'unknown';
  }
  
  const styles = document.createElement('style');
  styles.textContent = \`
    #chatbot-widget {
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 400px;
      max-width: 90vw;
      height: 600px;
      border: 1px solid #ddd;
      border-radius: 8px;
      background: white;
      z-index: 999999;
      box-shadow: 0 2px 20px rgba(0,0,0,0.15);
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    #chatbot-header {
      background: #10b981;
      color: white;
      padding: 15px;
      border-radius: 8px 8px 0 0;
      font-weight: bold;
      font-size: 16px;
    }
    #chatbot-messages {
      flex: 1;
      overflow-y: auto;
      padding: 15px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .msg {
      padding: 10px 12px;
      border-radius: 8px;
      max-width: 85%;
      word-wrap: break-word;
      font-size: 14px;
    }
    .user {
      align-self: flex-end;
      background: #10b981;
      color: white;
    }
    .bot {
      align-self: flex-start;
      background: #f0f0f0;
      color: #333;
    }
    #chatbot-input-area {
      display: flex;
      gap: 8px;
      padding: 12px;
      border-top: 1px solid #ddd;
    }
    #chatbot-input {
      flex: 1;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
      font-family: inherit;
    }
    #chatbot-send {
      padding: 10px 16px;
      background: #10b981;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
    }
    #chatbot-send:hover {
      background: #059669;
    }
    #chatbot-send:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  \`;
  
  function initChatbot() {
    const siteId = getSiteId();
    console.log('Initializing chatbot with siteId:', siteId);
    
    document.head.appendChild(styles);
    
    const widget = document.createElement('div');
    widget.id = 'chatbot-widget';
    widget.innerHTML = \`
      <div id="chatbot-header">💚 Chat (FREE)</div>
      <div id="chatbot-messages">
        <div class="msg bot">Hi! 👋 Ask me anything about this website.</div>
      </div>
      <div id="chatbot-input-area">
        <input id="chatbot-input" type="text" placeholder="Type your message...">
        <button id="chatbot-send">Send</button>
      </div>
    \`;
    document.body.appendChild(widget);
    
    const input = document.getElementById('chatbot-input');
    const send = document.getElementById('chatbot-send');
    const messages = document.getElementById('chatbot-messages');
    
    async function sendMessage() {
      const message = input.value.trim();
      if (!message) return;
      
      const userMsg = document.createElement('div');
      userMsg.className = 'msg user';
      userMsg.textContent = message;
      messages.appendChild(userMsg);
      input.value = '';
      messages.scrollTop = messages.scrollHeight;
      
      input.disabled = true;
      send.disabled = true;
      send.textContent = 'Thinking...';
      
      try {
        const response = await fetch('https://44.199.189.191:3000/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: message,
            siteId: siteId
          })
        });
        
        const data = await response.json();
        
        const botMsg = document.createElement('div');
        botMsg.className = 'msg bot';
        botMsg.textContent = data.response || '❌ Error';
        messages.appendChild(botMsg);
      } catch (error) {
        const botMsg = document.createElement('div');
        botMsg.className = 'msg bot';
        botMsg.textContent = '❌ Connection error: ' + error.message;
        messages.appendChild(botMsg);
      } finally {
        input.disabled = false;
        send.disabled = false;
        send.textContent = 'Send';
        messages.scrollTop = messages.scrollHeight;
      }
    }
    
    send.addEventListener('click', sendMessage);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatbot);
  } else {
    initChatbot();
  }
})();
  `);
});

// Dashboard - Simple HTML
app.get('/dashboard.html', (req, res) => {
  const html = '<!DOCTYPE html><html><head><title>FREE Chatbot Admin</title><style>body { font-family: Arial; max-width: 1000px; margin: 50px auto; padding: 20px; } .card { background: white; padding: 30px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 0 10px rgba(0,0,0,0.1); } h1 { color: #333; } input { width: 100%; padding: 10px; margin: 10px 0; font-size: 14px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; } button { background: #10b981; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; width: 100%; font-size: 16px; font-weight: bold; } button:hover { background: #059669; } .success { background: #d4edda; color: #155724; padding: 15px; border-radius: 4px; margin: 15px 0; border-left: 4px solid #28a745; } .code { background: #f5f5f5; padding: 15px; border-radius: 4px; font-family: monospace; margin: 15px 0; word-break: break-all; border: 1px solid #ddd; } .error { background: #f8d7da; color: #721c24; padding: 15px; border-radius: 4px; margin: 15px 0; }</style></head><body><div class="card"><h1>💚 FREE Chatbot Admin</h1><p>Register your website and get the embed code</p><input type="url" id="url" placeholder="https://example.com" required><input type="text" id="name" placeholder="Website name (optional)"><button onclick="register()">Register Website</button><div id="result"></div></div><script>async function register() { const url = document.getElementById("url").value; const name = document.getElementById("name").value; const result = document.getElementById("result"); if (!url) { result.innerHTML = "<div class=\"error\">Please enter a URL</div>"; return; } result.innerHTML = "<p>Registering...</p>"; try { const res = await fetch("/api/admin/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ website_url: url, website_name: name }) }); const data = await res.json(); if (!res.ok) { result.innerHTML = "<div class=\"error\">Error: " + data.error + "</div>"; return; } result.innerHTML = "<div class=\"success\"><strong>✅ Success!</strong><br>Site ID: <code>" + data.siteId + "</code><br>Embed Code:<div class=\"code\">" + data.embedCode + "</div><button onclick=\"copy(\'" + data.embedCode + "\'\">Copy Code</button></div>"; } catch (e) { result.innerHTML = "<div class=\"error\">Error: " + e.message + "</div>"; } } function copy(code) { navigator.clipboard.writeText(code); alert("Copied!"); }</script></body></html>';
  res.send(html);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('✅ Server is running!');
  console.log('📊 Open dashboard at: https://localhost:' + PORT + '/dashboard.html');
  console.log('');
});