const express = require('express')
const cors = require('cors')
const axios = require('axios')
require('dotenv').config()

// 引入 LangChain 的 ChatAlibabaTongyi（仅在 Node.js 后端使用！）
const {
  ChatAlibabaTongyi,
} = require('@langchain/community/chat_models/alibaba_tongyi')

const userSessions = new Map(); // key: sessionId, value: { messages: [], lastCity: '' }

// 工具：生成简单 sessionId（实际可用 JWT 或 cookie）
function getOrCreateSession(req) {
  const sessionId = req.headers['x-session-id'] || Date.now().toString(36) + Math.random().toString(36).slice(2);
  if (!userSessions.has(sessionId)) {
    userSessions.set(sessionId, { messages: [], lastCity: '' });
  }
  return { sessionId, session: userSessions.get(sessionId) };
}

// backend/server.js 新增

const weatherKnowledge = require('./weather_knowledge.json');

function retrieveWeatherAdvice(now) {
  const matches = [];
  for (const item of weatherKnowledge) {
    try {
      // 动态执行 condition（注意：生产环境需沙箱或规则引擎）
      const { temp, text, windScale } = now;
      if (eval(item.condition)) {
        matches.push(item.advice);
      }
    } catch (e) {
      console.warn('RAG rule eval failed:', item.condition);
    }
  }
  return matches.join('\n');
}

const app = express()

app.use(
  cors({
    origin:
      process.env.NODE_ENV === 'production'
        ? 'https://weather-assistant-lvli.vercel.app'
        : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'OPTIONS'], // 明确允许的方法
    allowedHeaders: ['Content-Type'], // 允许的请求头
  })
)
app.use(express.json())

const QWEATHER_KEY = process.env.QWEATHER_KEY
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY

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

// ====== 接口 3：Qwen 智能聊天（关键！避免前端用 LangChain） ======
// ====== 接口 3：智能聊天（支持天气上下文） ======
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: '需要提供 message 字符串' })
    }

    // 获取会话
    const { sessionId, session } = getOrCreateSession(req);
    res.setHeader('X-Session-ID', sessionId); // 前端下次带上

    // === 1. 提取城市（优先用历史）===
    let cityName = '';
    const cityMatch = message.match(/(?:北京|上海|广州|深圳|杭州|成都|重庆|天津|苏州|西安|武汉|南京|长沙|郑州|青岛|大连|厦门|宁波|.*?市|.*?县)/);
    
    if (cityMatch) {
      cityName = cityMatch[0];
      session.lastCity = cityName; // 更新记忆
    } else if (session.lastCity) {
      cityName = session.lastCity; // 用上次城市
    } else {
      cityName = '北京'; // 默认
    }


    // === 2. 查询天气 ===
    let weatherData = null;
    let weatherContext = '';
    let ragAdvice = '';
    console.log('城市:', cityName);

    if (/天气|气温|冷|热|下雨|晴|阴|雪|风|湿度|预报|多少度|穿|出门/.test(message)) {
      try {
        // 查城市 ID
        const cityRes = await axios.get(
          `https://qc4nmtwrmr.re.qweatherapi.com/geo/v2/city/lookup?location=${encodeURIComponent(
            cityName
          )}&key=${QWEATHER_KEY}`,
          { timeout: 5000 }
        )
        const locationId = cityRes.data.location?.[0]?.id

        if (locationId) {
          // 查实时天气
          const weatherRes = await axios.get(
            `https://qc4nmtwrmr.re.qweatherapi.com/v7/weather/now?location=${locationId}&key=${QWEATHER_KEY}`,
            { timeout: 5000 }
          )
          weatherData = weatherRes.data.now;
          
          weatherContext = `
【当前${cityName}天气】
- 状况: ${weatherData.text}
- 温度: ${weatherData.temp}°C (体感 ${weatherData.feelsLike}°C)
- 风力: ${weatherData.windScale}级
- 湿度: ${weatherData.humidity}%
- 能见度: ${weatherData.vis}公里
`;

          // RAG 检索
          ragAdvice = retrieveWeatherAdvice(weatherData);
        }
      } catch (err) {
        console.warn('天气查询失败，继续通用聊天:', err.message)
        weatherContext = ''
      }
    }

    // === 3. 构建系统 Prompt（优化版）===
    const systemPrompt = `
你是一个温暖、贴心的生活助手，名叫「小天」。请根据以下信息回答用户问题：

# 角色设定
- 语气亲切自然，像朋友聊天
- 适当使用 emoji（如🌤️☔🧥）增加亲和力
- 不说“根据数据显示”，直接给出建议
- 如果用户问非天气问题，友好引导回天气或生活话题

# 天气上下文（如有）
${weatherContext || '无'}

# 专业建议（来自气象指南）
${ragAdvice || '无'}

# 对话历史（最近3轮）
${session.messages.slice(-3).map(m => `${m.role === 'user' ? '用户' : '你'}: ${m.content}`).join('\n')}

# 回答要求
1. 如果有天气数据，请结合 RAG 建议生成个性化回复
2. 避免重复数据，转化为自然语言
3. 单次回复不超过 3 句话，简洁明了
4. 绝不编造未提供的信息
`;


    // === 4. 调用 Qwen ===
    const model = new ChatAlibabaTongyi({
      alibabaApiKey: DASHSCOPE_API_KEY,
      modelName: "qwen-plus",
      temperature: 0.6, // 降低随机性
    });

    const response = await model.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: message }
    ]);

    // === 5. 更新会话历史 ===
    session.messages.push({ role: 'user', content: message });
    session.messages.push({ role: 'assistant', content: response.content });
    // 限制历史长度
    if (session.messages.length > 10) {
      session.messages = session.messages.slice(-10);
    }

    res.json({ reply: response.content });

  } catch (err) {
    console.error('智能聊天失败:', err)
    if (err.message?.includes('Authentication')) {
      return res.status(403).json({ error: 'DashScope API Key 无效' })
    }
    res.status(500).json({ error: '服务暂时不可用，请稍后再试' })
  }
})

// 启动服务
const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`✅ 后端启动成功：http://localhost:${PORT}`)
})
