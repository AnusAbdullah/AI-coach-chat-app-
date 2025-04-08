import React from 'react';

// Previous Conversations component
const PreviousConversations = ({ conversations, onConversationSelect, isOpen, toggleOpen, onRefresh, onNewChat, isLoading }) => {
  // Don't return null even when empty, so the sidebar is always visible
  const isEmpty = !conversations || conversations.length === 0;

  // Format date for conversation groups
  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  // Get a title for the conversation based on first user message
  const getConversationTitle = (messages) => {
    if (!messages || messages.length === 0) return "New conversation";
    
    // Find the first user message
    const firstUserMessage = messages.find(msg => msg.role === 'user');
    if (firstUserMessage && firstUserMessage.content) {
      // Truncate long messages
      return firstUserMessage.content.length > 30 
        ? firstUserMessage.content.substring(0, 30) + '...' 
        : firstUserMessage.content;
    }
    
    return "New conversation";
  };

  return (
    <div className="previous-conversations-container">
      <div className="previous-conversations-header">
        <h3 onClick={toggleOpen}>Previous Conversations {isOpen ? '▼' : '▶'}</h3>
        <button className="refresh-button" onClick={onRefresh} title="Refresh conversation history">
          ⟳
        </button>
      </div>
      
      <div className="previous-conversations-list">
        <div className="new-chat-button-container">
          <button className="new-chat-button" onClick={onNewChat}>
            <span className="plus-icon">+</span> New Chat
          </button>
        </div>
        
        {isLoading ? (
          <div className="conversations-loading">
            <div className="conversations-loading-spinner"></div>
            <p>Loading your conversations...</p>
          </div>
        ) : isEmpty ? (
          <div className="empty-conversations-message">
            <p>No previous conversations found.</p>
            <p>Your chat history will appear here after you've had multiple conversations.</p>
          </div>
        ) : (
          conversations.map((conversation, index) => {
            if (!conversation || !conversation.messages) {
              return null; // Skip invalid conversations
            }
            
            // Get date if available
            let conversationDate = '';
            const firstMessage = conversation.messages.length > 0 ? conversation.messages[0] : null;
            
            if (firstMessage && firstMessage.created_at) {
              conversationDate = formatDate(firstMessage.created_at);
            } else if (firstMessage && conversation.channel_id) {
              // Try to extract date from channel ID if it contains a timestamp
              const timestampMatch = conversation.channel_id.match(/\d{13}/);
              if (timestampMatch) {
                const timestamp = parseInt(timestampMatch[0]);
                if (!isNaN(timestamp)) {
                  conversationDate = formatDate(new Date(timestamp).toISOString());
                }
              }
            }
            
            // Get conversation title
            const title = getConversationTitle(conversation.messages);
            
            return (
              <div 
                key={conversation.channel_id || index} 
                className="previous-conversation-item"
                onClick={() => onConversationSelect(conversation.channel_id)}
              >
                <div className="conversation-title">
                  {title}
                </div>
                {conversationDate && <div className="conversation-date-small">{conversationDate}</div>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default PreviousConversations; 