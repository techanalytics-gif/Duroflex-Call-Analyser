import React, { useState, useRef, useEffect } from 'react';
import { Send, X, Loader } from 'lucide-react';

// Lightweight markdown-ish formatter for assistant replies
const formatAssistantText = (text = '') => {
  const escapeHtml = (str) => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Render inline bold safely while escaping other content
  const renderInline = (line) => {
    const parts = [];
    let lastIndex = 0;
    const boldRegex = /\*\*(.*?)\*\*/g;
    let match;
    while ((match = boldRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(`<span>${escapeHtml(line.slice(lastIndex, match.index))}</span>`);
      }
      parts.push(`<strong>${escapeHtml(match[1])}</strong>`);
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < line.length) {
      parts.push(`<span>${escapeHtml(line.slice(lastIndex))}</span>`);
    }
    return parts.join('');
  };

  const lines = (text || '').split(/\r?\n/);

  const rendered = lines.map((line) => {
    const headingMatch = line.match(/^#{2,3}\s+(.*)$/);
    if (headingMatch) {
      return `<div class="font-semibold text-gray-900 mt-2">${renderInline(headingMatch[1])}</div>`;
    }

    // Bullets starting with -, *, or •
    const bulletMatch = line.match(/^\s*[-*•]\s*(.*)$/);
    if (bulletMatch) {
      return `<div class="pl-4 relative text-gray-800"><span class="absolute left-0">•</span>${renderInline(bulletMatch[1])}</div>`;
    }

    const trimmed = line.trim();
    if (!trimmed) return '<div class="h-2"></div>';
    return `<div class="text-gray-800">${renderInline(line)}</div>`;
  });

  return { __html: rendered.join('') };
};

export default function VideoChatbot() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'assistant',
      text: 'Hi! I\'m your Video Insights Assistant. I can help you understand customer behavior, common questions, and sales patterns from our video call transcripts. What would you like to know?'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const messageIdRef = useRef(1);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    // Add user message
    const userMessageId = messageIdRef.current++;
    const userMessage = {
      id: userMessageId,
      type: 'user',
      text: inputValue
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setLoading(true);
    setError(null);

    try {
      // Build conversation history
      const conversationHistory = messages
        .filter(msg => msg.type !== 'assistant' || msg.id > 1) // Exclude initial assistant message
        .map(msg => ({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.text
        }));

      // Add current user message to history
      conversationHistory.push({
        role: 'user',
        content: inputValue
      });

      // Call the backend API
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE_URL || 'https://duroflex-call-analyser.onrender.com'}/api/video-chatbot/chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            message: inputValue,
            conversation_history: conversationHistory
          })
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status === 'success') {
        const assistantMessageId = messageIdRef.current++;
        const assistantMessage = {
          id: assistantMessageId,
          type: 'assistant',
          text: data.response
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        setError(data.message || 'Failed to get response');
      }
    } catch (err) {
      console.error('Chat error:', err);
      setError(err.message || 'Failed to send message. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4 rounded-t-lg shadow-sm">
        <h3 className="text-lg font-semibold">Video Insights Assistant</h3>
        <p className="text-sm text-blue-100">Ask questions about customer behavior & sales patterns</p>
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.map(message => (
          <div
            key={message.id}
            className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
                message.type === 'user'
                  ? 'bg-blue-600 text-white rounded-br-none'
                  : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none shadow-sm'
              }`}
            >
              {message.type === 'assistant' ? (
                <div
                  className="text-sm leading-relaxed space-y-1"
                  dangerouslySetInnerHTML={formatAssistantText(message.text)}
                />
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {message.text}
                </p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white text-gray-800 border border-gray-200 px-4 py-3 rounded-lg rounded-bl-none shadow-sm flex items-center space-x-2">
              <Loader className="w-4 h-4 animate-spin text-blue-600" />
              <span className="text-sm text-gray-600">Analyzing transcripts...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-start">
            <div className="bg-red-50 text-red-800 border border-red-200 px-4 py-3 rounded-lg rounded-bl-none text-sm">
              <p className="font-medium">Error</p>
              <p>{error}</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white border-t border-gray-200 p-4 rounded-b-lg">
        <div className="flex space-x-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a question... (e.g., 'Why are people not purchasing?')"
            disabled={loading}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 text-sm text-cyan-900"
          />
          <button
            onClick={handleSendMessage}
            disabled={loading || !inputValue.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg flex items-center space-x-1 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          💡 Try asking: "What are the most common customer questions?" or "Why do customers hesitate to purchase?"
        </p>
      </div>
    </div>
  );
}
