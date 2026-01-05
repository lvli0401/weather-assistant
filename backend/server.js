const express = require('express')
const cors = require('cors')
const axios = require('axios')
require('dotenv').config()

const { ChatAlibabaTongyi } = require('@langchain/community/chat_models/alibaba_tongyi')
const weatherApi = require('./weather_api')
const memoryStore = require('./memory_store')
const advisorTools = require('./advisor_tools')

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
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY

// 工具：生成简单 sessionId
function getOrCreateSession(req) {
  const sessionId = req.headers['x-session-id'] || Date.now().toString(36) + Math.random().toString(36).slice(2);
  if (!userSessions.has(sessionId)) {
    userSessions.set(sessionId, { messages: [], lastCity: '北京' });
  }
  return { sessionId, session: userSessions.get(sessionId) };
}

// ====== 接口 1：城市搜索 (保持不变) ======
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

// ====== 接口 2：实时天气 (保持不变) ======
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

// ====== 接口 3：智能出游顾问 (大幅升级) ======
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: '需要提供 message 字符串' })
    }

    const { sessionId, session } = getOrCreateSession(req);
    res.setHeader('X-Session-ID', sessionId);

    // 1. 记忆提取 (User Preference Learning)
    // 如果用户表达了偏好，存入向量库
    if (/(我喜欢|我讨厌|我习惯|我怕|我想要|偏好)/.test(message)) {
        memoryStore.addText(message, { sessionId });
    }

    // 2. 意图与实体识别 (City Extraction)
    const cityMatch = message.match(/(?:北京|上海|广州|深圳|杭州|成都|重庆|天津|苏州|西安|武汉|南京|长沙|郑州|青岛|大连|厦门|宁波|三亚|昆明|丽江|桂林|哈尔滨|.*?市|.*?县|.*?区)/);
    if (cityMatch) {
      session.lastCity = cityMatch[0];
    }
    const targetCity = session.lastCity;

    // 3. 数据收集 & 工具调用
    let toolOutputs = [];
    let weatherContext = '';
    
    // 判断是否需要天气服务
    const needsWeather = /天气|气温|冷|热|下雨|晴|阴|雪|风|湿度|预报|多少度|穿|出门|玩|旅游|出游|带什么|行李|建议/.test(message);

    if (needsWeather) {
      console.log(`正在为用户分析 ${targetCity} 的数据...`);
      const location = await weatherApi.getCityLocation(targetCity);
      
      if (location) {
        // 并行获取多维天气数据
        const [now, daily, indices, warnings] = await Promise.all([
          weatherApi.getWeatherNow(location.id),
          weatherApi.getWeather7d(location.id),
          weatherApi.getWeatherIndices(location.id),
          weatherApi.getWeatherWarning(location.id)
        ]);

        if (now) {
            weatherContext = `【${targetCity} 实时天气】状况: ${now.text}, 温度: ${now.temp}°C, 风力: ${now.windScale}级`;
            
            // 串联工具链
            toolOutputs.push(advisorTools.ClothingAdvisorTool.analyze(now, indices));
            toolOutputs.push(advisorTools.OutdoorActivityTool.analyze(now, indices));
            toolOutputs.push(advisorTools.TravelAlertTool.analyze(warnings));
            
            // 如果涉及出游计划或行李，生成更详细的上下文
            if (/出游|旅游|行李|带什么|清单|计划|攻略/.test(message)) {
                // 检索用户偏好
                const similarMemories = await memoryStore.search(message);
                const userPrefs = similarMemories.map(m => m.text).join('; ');
                toolOutputs.push(advisorTools.PackingListTool.generateContext(daily, userPrefs));
            }
        }
      }
    }

    // 4. 构建 Prompt
    const relatedMemories = await memoryStore.search(message, 3);
    const memoryContext = relatedMemories.map(m => `- ${m.text}`).join('\n');

    const systemPrompt = `
你是一位专业的“智能出游顾问”，名叫「小天」。
你的目标是基于实时天气数据、专业指数分析和用户个人偏好，提供高度个性化、贴心的出游和生活建议。

# 你的知识库与当前环境
[用户画像/记忆]
${memoryContext || '（暂无明显偏好，请在对话中逐步引导用户表达）'}

[环境数据与专家建议]
${weatherContext || '（当前无具体天气数据）'}
${toolOutputs.join('\n')}

# 对话历史
${session.messages.slice(-3).map(m => `${m.role === 'user' ? '用户' : '你'}: ${m.content}`).join('\n')}

# 回答原则
1. **融合建议**：请将天气数据（温度、降水）与生活指数（穿衣、防晒）自然融合，不要生硬地报数据。
2. **个性化关怀**：必须参考[用户画像]，例如用户怕冷就多提醒保暖，喜欢运动就推荐合适的户外时机。
3. **安全优先**：如果[环境数据]中有预警信息，必须放在回复的最开头进行强调。
4. **行动导向**：如果用户问“去哪里玩”或“带什么”，请基于天气给出具体方案（如：室内博物馆还是户外公园）。
5. **行李清单**：如果用户要求清单，请列出分类清晰的清单（必带证件、衣物、电子产品、护肤品等）。

请以热情、专业、朋友般的口吻回答用户：${message}
`;

    // 5. 调用 LLM
    const model = new ChatAlibabaTongyi({
      alibabaApiKey: DASHSCOPE_API_KEY,
      modelName: "qwen-plus",
      temperature: 0.7,
    });

    const response = await model.invoke([
      { role: "system", content: systemPrompt },
      { role: "user", content: message }
    ]);

    // 更新会话历史
    session.messages.push({ role: 'user', content: message });
    session.messages.push({ role: 'assistant', content: response.content });
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

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
  console.log(`✅ 后端启动成功：http://localhost:${PORT}`)
})
