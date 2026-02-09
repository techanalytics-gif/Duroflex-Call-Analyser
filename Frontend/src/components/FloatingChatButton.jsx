import React, { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import VideoChatbot from './VideoChatbot';

export default function FloatingChatButton() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300 flex items-center justify-center z-40 group"
          title="Open Video Insights Chat"
        >
          <MessageCircle className="w-6 h-6" />
          <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
            Video Insights
          </div>
        </button>
      )}

      {/* Chat Modal */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 w-96 h-[600px] bg-white rounded-lg shadow-2xl flex flex-col z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          {/* Modal Header with Close */}
          <div className="absolute top-4 right-4 z-10">
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              title="Close chat"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Chatbot Content */}
          <VideoChatbot />
        </div>
      )}
    </>
  );
}
