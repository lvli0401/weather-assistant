const express = require('express')
const cors = require('cors')
const axios = require('axios')
require('dotenv').config()

const { HumanMessage, AIMessage } = require('@langchain/core/messages');
const agentService = require('./agent_service');
const memoryStore = require('./memory_store');

const app = express()
const userSessions = new Map(); // key: sessionId, value: { messages: [], lastCity: '' }

app.use(
  cors({
    origin:
      process.env.NODE_ENV === 'production'
        ? 'https://weather-assistant-lvli.vercel.app'
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-session-id'],
  })
)
app.use(express.json())

const QWEATHER_KEY = process.env.QWEATHER_KEY

// 工具：生成简单 sessionId
function getOrCreateSession(req) {
  const sessionId = req.headers['x-session-id'] || Date.now().toString(36) + Math.random().toString(36).slice(2);
  if (!userSessions.has(sessionId)) {
    userSessions.set(sessionId, { messages: [], lastCity: '北京' });
  }
  return { sessionId, session: userSessions.get(sessionId) };
}

// ====== 接口 1：城市搜索 ======
app.get('/api/city', async (req, res) => {
  try {
    const { location } = req.query
    if (!location) return res.status(400).json({ error: '缺少 location 参数' })
    const url = `https://qc4nmtwrmr.re.qweatherapi.com/geo/v2/city/lookup?location=${encodeURIComponent(
      location
    )}&key=${QWEATHER_KEY}`
    const response = await axios.get(url, { timeout: 5000 })
    res.json(response.data)
  } catch (err) {
    console.error('城市查询失败:', err.message)
    res.status(500).json({ error: '城市查询失败' })
  }
})

// ====== 接口 2：实时天气 ======
app.get('/api/weather', async (req, res) => {
  try {
    const { location } = req.query
    if (!location) return res.status(400).json({ error: '缺少 location 参数' })
    const url = `https://qc4nmtwrmr.re.qweatherapi.com/v7/weather/now?location=${location}&key=${QWEATHER_KEY}`
    const response = await axios.get(url, { timeout: 5000 })
    res.json(response.data)
  } catch (err) {
    console.error('天气查询失败:', err.message)
    res.status(500).json({ error: '天气查询失败' })
  }
})

// ====== 接口 3：智能 Agent 出游顾问 ======
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: '需要提供 message 字符串' })
    }

    const { sessionId, session } = getOrCreateSession(req);
    res.setHeader('X-Session-ID', sessionId);

    // 1. 转换历史消息为 LangChain 格式
    const history = session.messages.map(m => 
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)
    );

    // 2. 运行 Agent (ReAct Loop)
    // 注意：这里我们不再手动拼接 prompt，而是交给 AgentExecutor 自动规划
    const reply = await agentService.runAgent(message, history);

    // 3. 更新会话历史
    session.messages.push({ role: 'user', content: message });
    session.messages.push({ role: 'assistant', content: reply });
    
    // 限制历史长度
    if (session.messages.length > 10) {
      session.messages = session.messages.slice(-10);
    }
    
    // 更新城市上下文 (简单正则，辅助用)
    const cityMatch = message.match(/(?:北京|上海|广州|深圳|杭州|成都|重庆|天津|苏州|西安|武汉|南京|长沙|郑州|青岛|大连|厦门|宁波|三亚|昆明|丽江|桂林|哈尔滨|.*?市|.*?县|.*?区)/);
    if (cityMatch) {
      session.lastCity = cityMatch[0];
    }

    res.json({ reply });

  } catch (err) {
    console.error('Agent 运行失败:', err);
    if (err.message?.includes('Authentication')) {
      return res.status(403).json({ error: 'DashScope API Key 无效' })
    }
    res.status(500).json({ error: '服务暂时不可用，请稍后再试' })
  }
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`✅ 后端启动成功 (AgentExecutor): http://localhost:${PORT}`)
})
