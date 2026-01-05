const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { AlibabaTongyiEmbeddings } = require('@langchain/community/embeddings/alibaba_tongyi');

// 简单的向量存储实现
class SimpleVectorStore {
  constructor() {
    this.vectors = []; // { text, vector, metadata }
    this.savePath = path.join(__dirname, 'vector_db.json');
    const apiKey = process.env.DASHSCOPE_API_KEY;
    if (!apiKey) console.warn('Warning: DASHSCOPE_API_KEY is missing!');
    
    this.embeddings = new AlibabaTongyiEmbeddings({
      alibabaApiKey: apiKey,
      apiKey: apiKey, // 兼容性尝试
    });
    this.load();
  }

  load() {
    if (fs.existsSync(this.savePath)) {
      try {
        const data = fs.readFileSync(this.savePath, 'utf-8');
        this.vectors = JSON.parse(data);
        console.log(`已加载 ${this.vectors.length} 条向量数据`);
      } catch (e) {
        console.error('加载向量库失败:', e);
        this.vectors = [];
      }
    }
  }

  save() {
    fs.writeFileSync(this.savePath, JSON.stringify(this.vectors, null, 2));
  }

  async addText(text, metadata = {}) {
    try {
      // 1. 生成向量
      const [vector] = await this.embeddings.embedDocuments([text]);
      
      // 2. 存储
      this.vectors.push({ text, vector, metadata, createdAt: Date.now() });
      this.save();
      console.log(`已添加记忆: "${text}"`);
    } catch (e) {
      console.error('添加记忆失败:', e);
    }
  }

  async search(query, k = 3) {
    try {
      if (this.vectors.length === 0) return [];

      // 1. 生成查询向量
      const queryVector = await this.embeddings.embedQuery(query);

      // 2. 计算相似度
      const results = this.vectors.map(item => {
        const similarity = this.cosineSimilarity(queryVector, item.vector);
        return { ...item, similarity };
      });

      // 3. 排序并返回
      return results
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, k)
        .filter(r => r.similarity > 0.6); // 阈值过滤
    } catch (e) {
      console.error('搜索记忆失败:', e);
      return [];
    }
  }

  cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }
}

// 单例模式
const store = new SimpleVectorStore();
module.exports = store;
