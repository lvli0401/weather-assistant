class ClothingAdvisorTool {
  /**
   * @param {Object} weatherNow 实时天气
   * @param {Array} indices 生活指数列表
   */
  static analyze(weatherNow, indices) {
    if (!weatherNow || !indices) return '【穿衣建议】数据不足，无法生成建议。';
    
    const dressingIndex = indices.find(i => i.type === '3'); // 3=穿衣指数
    const advice = dressingIndex ? `${dressingIndex.category}。${dressingIndex.text}` : '暂无指数信息';
    
    return `【👔 穿衣建议】\n当前气温 ${weatherNow.temp}°C。\n建议：${advice}`;
  }
}

class OutdoorActivityTool {
  /**
   * @param {Object} weatherNow 实时天气
   * @param {Array} indices 生活指数列表
   */
  static analyze(weatherNow, indices) {
    if (!weatherNow || !indices) return '【户外活动】数据不足。';

    const sport = indices.find(i => i.type === '1'); // 1=运动指数
    const uv = indices.find(i => i.type === '5');    // 5=紫外线指数
    const isRaining = weatherNow.text.includes('雨');
    
    let result = `【🏃 户外活动】\n`;
    
    if (isRaining) {
      result += `🚫 正在下雨（${weatherNow.text}），不建议进行户外高强度活动。`;
    } else {
      result += `适宜度：${sport?.category || '未知'}。\n${sport?.text || ''}`;
    }
    
    if (uv) {
      result += `\n☀️ 紫外线强度：${uv.category}，${uv.text || ''}`;
    }
    
    return result;
  }
}

class TravelAlertTool {
  /**
   * @param {Array} warnings 预警列表
   */
  static analyze(warnings) {
    if (!warnings || warnings.length === 0) {
      return '【⚠️ 旅行警报】\n🟢 当前地区无气象灾害预警，出行相对安全。';
    }
    
    const alerts = warnings.map(w => `🔴 ${w.typeName}${w.level}预警：${w.text}`).join('\n');
    return `【⚠️ 旅行警报】\n发现 ${warnings.length} 条生效预警，请注意安全：\n${alerts}`;
  }
}

class PackingListTool {
  /**
   * @param {Array} weatherDaily 未来天气
   * @param {String} userPrefs 用户偏好字符串
   */
  static generateContext(weatherDaily, userPrefs) {
    if (!weatherDaily || weatherDaily.length === 0) return '无未来天气数据，无法生成行李清单。';

    const temps = weatherDaily.map(d => parseInt(d.tempMax));
    const maxTemp = Math.max(...temps);
    const minTemp = Math.min(...temps);
    const hasRain = weatherDaily.some(d => d.textDay.includes('雨'));
    
    return `
【🧳 行李清单生成上下文】
- 天气概况：未来几天气温在 ${minTemp}°C 到 ${maxTemp}°C 之间。
- 降水情况：${hasRain ? '会有降雨，必须携带雨具' : '基本无雨'}。
- 用户偏好：${userPrefs || '无特殊偏好'}
请根据以上信息为用户生成一份详细的个性化行李清单。
`;
  }
}

module.exports = {
  ClothingAdvisorTool,
  OutdoorActivityTool,
  TravelAlertTool,
  PackingListTool
};
