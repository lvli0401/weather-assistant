const { ChatAlibabaTongyi } = require('@langchain/community/chat_models/alibaba_tongyi');
const { SystemMessage, HumanMessage, AIMessage } = require('@langchain/core/messages');
const tools = require('./agent_tools');

// 初始化模型
const model = new ChatAlibabaTongyi({
  alibabaApiKey: process.env.DASHSCOPE_API_KEY,
  modelName: "qwen-plus",
  temperature: 0.5,
});

// 辅助函数：格式化工具描述
function formatTools(tools) {
  return tools.map(t => {
    const schemaShape = t.schema.shape || {};
    const args = Object.keys(schemaShape).map(key => {
      const field = schemaShape[key];
      return `${key}: ${field.description || 'string'}`;
    }).join(', ');
    return `${t.name}: ${t.description} (Args: {${args}})`;
  }).join('\n');
}

const TOOL_DESC = formatTools(tools);
const TOOL_NAMES = tools.map(t => t.name).join(', ');

const SYSTEM_PROMPT = `你是一个智能出游顾问“小天”。
你可以使用以下工具来帮助用户：

${TOOL_DESC}

请遵循以下“思考-行动”循环来解决问题：

1. 思考 (Thought): 分析用户的需求，决定下一步做什么。
2. 行动 (Action): 如果需要使用工具，输出且仅输出一个 JSON 对象，格式如下：
\`\`\`json
{
  "action": "工具名称",
  "action_input": { "参数名": "参数值" }
}
\`\`\`
3. 观察 (Observation): (这一步由系统反馈工具结果)
4. ... 重复上述步骤 ...
5. 最终回复 (Final Answer): 当你收集到足够信息后，或者不需要使用工具时，直接输出最终回复内容（不要包含 JSON 代码块）。

注意：
- 涉及天气必须先查 fetch_weather_data。
- 涉及建议必须基于天气数据。
- 优先搜索用户记忆 search_user_memories。
- 遇到气象预警必须优先强调。
- 最终回复请使用自然语言，温暖、专业，可以使用 Emoji。
`;

// 简单的 JSON 提取器
function parseAction(text) {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/```\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      const jsonStr = jsonMatch[1];
      const data = JSON.parse(jsonStr);
      if (data.action && data.action_input) {
        return data;
      }
    } catch (e) {
      console.error("JSON Parse Error:", e);
    }
  }
  return null;
}

// 执行工具
async function executeTool(actionName, actionInput) {
  const tool = tools.find(t => t.name === actionName);
  if (!tool) return `Error: Tool ${actionName} not found.`;
  try {
    const result = await tool.call(actionInput);
    return result;
  } catch (e) {
    return `Error calling ${actionName}: ${e.message}`;
  }
}

async function runAgent(input, history) {
  // 1. 构建完整的消息列表
  const messages = [
    new SystemMessage(SYSTEM_PROMPT),
    ...history,
    new HumanMessage(input)
  ];

  let steps = 0;
  const maxSteps = 10;

  while (steps < maxSteps) {
    steps++;
    console.log(`--- Step ${steps} ---`);

    // 2. 调用模型
    const response = await model.invoke(messages);
    const content = response.content;
    console.log("Model Output:", content);

    // 3. 解析行动
    const action = parseAction(content);

    // 4. 如果没有 Action，或者明确是 Final Answer（虽然我们约定直接输出文本为 Final Answer，但防止模型输出 JSON 格式的 Final Answer）
    if (!action) {
      // 认为是最终回复
      return content;
    }

    if (action.action === 'Final Answer') {
      return action.action_input;
    }

    // 5. 执行工具
    console.log(`Executing Tool: ${action.action}`, action.action_input);
    const observation = await executeTool(action.action, action.action_input);
    console.log("Observation:", observation);

    // 6. 将执行结果追加到消息历史
    // 注意：我们需要将模型的输出 (AIMessage) 和 观察结果 (System/HumanMessage) 都加进去
    // 为了模拟 ReAct，我们将 "Thought + Action" 作为 AIMessage，"Observation" 作为 HumanMessage (或 SystemMessage)
    // LangChain 的惯例是 ToolMessage，但 ChatAlibabaTongyi 可能不支持。
    // 我们用 HumanMessage 模拟 "System returns observation"
    
    messages.push(new AIMessage(content));
    messages.push(new HumanMessage(`Observation: ${observation}`));
  }

  return "抱歉，我处理这个问题有点超时了，请再试一次。";
}

module.exports = { runAgent };
