const { DynamicStructuredTool } = require('@langchain/core/tools');
const { z } = require('zod');
const weatherApi = require('./weather_api');
const memoryStore = require('./memory_store');
const advisorTools = require('./advisor_tools');

// 1. 天气数据获取工具 (聚合)
const fetchWeatherTool = new DynamicStructuredTool({
  name: 'fetch_weather_data',
  description: '获取指定城市的全面天气数据，包括实时天气、7天预报、生活指数和气象预警。在回答天气相关问题或生成建议前必须先调用此工具。',
  schema: z.object({
    city: z.string().describe('城市名称，如"北京"、"上海"'),
  }),
  func: async ({ city }) => {
    try {
      const location = await weatherApi.getCityLocation(city);
      if (!location) return `未找到城市：${city}`;

      const [now, daily, indices, warning] = await Promise.all([
        weatherApi.getWeatherNow(location.id),
        weatherApi.getWeather7d(location.id),
        weatherApi.getWeatherIndices(location.id),
        weatherApi.getWeatherWarning(location.id),
      ]);

      return JSON.stringify({
        location: location.name,
        now,
        daily,
        indices,
        warning
      });
    } catch (e) {
      return `获取天气失败: ${e.message}`;
    }
  },
});

// 2. 穿衣建议工具 (封装规则逻辑)
const clothingAdvisorTool = new DynamicStructuredTool({
  name: 'get_clothing_advice',
  description: '根据实时天气数据生成穿衣建议。需传入 fetch_weather_data 返回的 now 和 indices 数据。',
  schema: z.object({
    temp: z.string().describe('当前温度'),
    text: z.string().describe('天气状况描述'),
    indices: z.array(z.any()).describe('生活指数数组'),
  }),
  func: async ({ temp, text, indices }) => {
    // 构造 advisor_tools 需要的格式
    const mockNow = { temp, text };
    return advisorTools.ClothingAdvisorTool.analyze(mockNow, indices);
  },
});

// 3. 户外活动建议工具
const outdoorActivityTool = new DynamicStructuredTool({
  name: 'get_outdoor_activity_advice',
  description: '评估户外活动适宜度。需传入 fetch_weather_data 返回的 now 和 indices 数据。',
  schema: z.object({
    text: z.string().describe('天气状况描述'),
    indices: z.array(z.any()).describe('生活指数数组'),
  }),
  func: async ({ text, indices }) => {
    const mockNow = { text };
    return advisorTools.OutdoorActivityTool.analyze(mockNow, indices);
  },
});

// 4. 记忆搜索工具
const memorySearchTool = new DynamicStructuredTool({
  name: 'search_user_memories',
  description: '搜索用户的历史偏好或记忆。在生成个性化建议（如行李清单、行程规划）前应调用。',
  schema: z.object({
    query: z.string().describe('搜索关键词，如"喜欢"、"怕冷"、"旅行偏好"'),
  }),
  func: async ({ query }) => {
    const results = await memoryStore.search(query, 5);
    if (results.length === 0) return '未找到相关用户记忆。';
    return results.map(r => r.text).join('; ');
  },
});

// 5. 记忆保存工具
const memorySaveTool = new DynamicStructuredTool({
  name: 'save_user_memory',
  description: '当用户明确表达个人喜好、习惯或厌恶时，保存该信息。',
  schema: z.object({
    content: z.string().describe('要保存的用户偏好内容'),
  }),
  func: async ({ content }) => {
    await memoryStore.addText(content);
    return '已保存用户记忆。';
  },
});

module.exports = [
  fetchWeatherTool,
  clothingAdvisorTool,
  outdoorActivityTool,
  memorySearchTool,
  memorySaveTool
];
