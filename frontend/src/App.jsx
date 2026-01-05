import { useState, useRef } from 'react'
import axios from 'axios'

function App() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)

  // 👇 新增：用 useRef 存储 sessionId（避免 re-render 重置）
  const sessionIdRef = useRef(null)

  const handleSend = async () => {
    if (!input.trim()) return

    const userMsg = { role: 'user', content: input }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    setInput('')

    try {
      // 👇 构造 headers
      const headers = {}
      if (sessionIdRef.current) {
        headers['X-Session-ID'] = sessionIdRef.current
      }

      // 👇 发送请求（注意：这里不再区分天气/聊天，全部走 /api/chat）
      const res = await axios.post('/api/chat', { message: input }, { headers })

      // 👇 保存返回的 sessionId（如果后端设置了）
      const returnedSessionId = res.headers['x-session-id']
      if (returnedSessionId) {
        sessionIdRef.current = returnedSessionId
      }

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: res.data.reply },
      ])
    } catch (err) {
      // 错误处理...
      console.error('聊天服务错误:', err)
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: '聊天服务暂不可用，请确保后端已启动。' },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        padding: '20px',
        maxWidth: '600px',
        margin: '0 auto',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <h2 style={{ textAlign: 'center', color: '#1976d2' }}>
        🌤️ Qwen 天气小助手
      </h2>

      <div
        style={{
          height: '400px',
          overflowY: 'auto',
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '12px',
          backgroundColor: '#fafafa',
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              textAlign: msg.role === 'user' ? 'right' : 'left',
              margin: '8px 0',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                padding: '8px 12px',
                borderRadius: '12px',
                backgroundColor: msg.role === 'user' ? '#e3f2fd' : '#f1f8e9',
                maxWidth: '80%',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap', // 保留换行符
              }}
            >
              {msg.content}
            </span>
          </div>
        ))}
        {loading && (
          <div style={{ textAlign: 'left', marginTop: '8px' }}>
            <span
              style={{
                padding: '8px 12px',
                backgroundColor: '#f1f8e9',
                borderRadius: '12px',
              }}
            >
              🤖 思考中...
            </span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          type='text'
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder='例如：杭州今天天气？ / 你好！'
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '20px',
            border: '1px solid #ccc',
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            padding: '10px 20px',
            borderRadius: '20px',
            backgroundColor: loading || !input.trim() ? '#ccc' : '#1976d2',
            color: 'white',
            border: 'none',
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          发送
        </button>
      </div>

      <p
        style={{
          fontSize: '0.85em',
          color: '#888',
          textAlign: 'center',
          marginTop: '10px',
        }}
      >
        💡 提示：请先运行后端（cd backend && npm start）
      </p>
    </div>
  )
}

export default App
