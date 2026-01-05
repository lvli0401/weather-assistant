const axios = require('axios');
require('dotenv').config();

const QWEATHER_KEY = process.env.QWEATHER_KEY;
const BASE_URL = 'https://qc4nmtwrmr.re.qweatherapi.com';

// 1. 城市查询
async function getCityLocation(cityName) {
  if (!cityName) return null;
  try {
    const url = `${BASE_URL}/geo/v2/city/lookup?location=${encodeURIComponent(cityName)}&key=${QWEATHER_KEY}`;
    const res = await axios.get(url, { timeout: 5000 });
    return res.data.location?.[0] || null;
  } catch (error) {
    console.error('City Lookup Error:', error.message);
    return null;
  }
}

// 2. 实时天气
async function getWeatherNow(locationId) {
  try {
    const url = `${BASE_URL}/v7/weather/now?location=${locationId}&key=${QWEATHER_KEY}`;
    const res = await axios.get(url, { timeout: 5000 });
    return res.data.now;
  } catch (error) {
    console.error('Weather Now Error:', error.message);
    return null;
  }
}

// 3. 7天预报 (用于出游规划)
async function getWeather7d(locationId) {
  try {
    const url = `${BASE_URL}/v7/weather/7d?location=${locationId}&key=${QWEATHER_KEY}`;
    const res = await axios.get(url, { timeout: 5000 });
    return res.data.daily;
  } catch (error) {
    console.error('Weather 7d Error:', error.message);
    return null;
  }
}

// 4. 生活指数 (用于穿衣、运动建议)
// type: 1=运动, 3=穿衣, 5=紫外线, 9=感冒 (默认查询全部或常用)
async function getWeatherIndices(locationId) {
  try {
    // 查询 1(运动), 3(穿衣), 5(紫外线)
    const url = `${BASE_URL}/v7/indices/1d?location=${locationId}&key=${QWEATHER_KEY}&type=1,3,5`;
    const res = await axios.get(url, { timeout: 5000 });
    return res.data.daily;
  } catch (error) {
    console.error('Weather Indices Error:', error.message);
    return null;
  }
}

// 5. 灾害预警
async function getWeatherWarning(locationId) {
  try {
    const url = `${BASE_URL}/v7/warning/now?location=${locationId}&key=${QWEATHER_KEY}`;
    const res = await axios.get(url, { timeout: 5000 });
    return res.data.warning;
  } catch (error) {
    console.error('Weather Warning Error:', error.message);
    return [];
  }
}

module.exports = {
  getCityLocation,
  getWeatherNow,
  getWeather7d,
  getWeatherIndices,
  getWeatherWarning
};
