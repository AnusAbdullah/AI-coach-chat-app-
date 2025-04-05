import React, { useEffect, useState, useRef } from 'react';
import { StreamChat } from 'stream-chat';
import {
  Chat as StreamChatComponent,
  Channel,
  LoadingIndicator,
  useChannelStateContext,
} from 'stream-chat-react';
import axios from 'axios';

const API_URL = 'https://your-project-name.glitch.me';

// Custom theme configuration
const customTheme = {
  '--primary-color': '#007bff',
  '--primary-color-alpha': 'rgba(0, 123, 255, 0.1)',
  '--secondary-color': '#0056b3',
  '--border-radius-sm': '8px',
  '--border-radius': '16px',
  '--font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

// Custom Channel Header
const CustomChannelHeader = () => {
  const { channel } = useChannelStateContext();
  return (
    <div className="str-chat__header-livestream">
      <div className="str-chat__header-title">
        {channel?.data?.name || 'AI Coach Chat'}
      </div>
      <div className="str-chat__header-subtitle">
        Your personal AI coaching session
      </div>
    </div>
  );
};

// Message component with improved structure for better visibility
const MessageWithCustomClass = (props) => {
  try {
    // Safe validation of props
    if (!props || !props.message) {
      return null;
    }
    
    const message = props.message;
    const isAI = message.user && message.user.id === 'ai_coach_1';
    
    // Format timestamp (if available)
    let timestamp = "";
    if (message.created_at) {
      const date = new Date(message.created_at);
      timestamp = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // SWAPPED: User messages on LEFT side with gray bubbles
    // AI messages on RIGHT side with blue bubbles
    return (
      <div className={isAI ? "ai-message" : "user-message"}>
        {/* USER MESSAGE - LEFT SIDE WITH GRAY BUBBLE */}
        {!isAI && (
          <div className="message-container">
            <div className="str-chat__avatar user-avatar">
              {message.user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="str-chat__message-text">
              <div className="str-chat__message-text-inner">
                {message.text || ''}
              </div>
              {timestamp && <div className="message-time">{timestamp}</div>}
            </div>
          </div>
        )}
        
        {/* AI COACH MESSAGE - RIGHT SIDE WITH BLUE BUBBLE */}
        {isAI && (
          <div className="message-container">
            <div className="str-chat__message-text">
              <div className="str-chat__message-text-inner">
                {message.text || ''}
              </div>
              {timestamp && <div className="message-time">{timestamp}</div>}
            </div>
            <div className="str-chat__avatar ai-avatar">
              AI
            </div>
          </div>
        )}
      </div>
    );
  } catch (error) {
    console.error("Error rendering message:", error);
    return null;
  }
};

// Custom MessageList with proper message display and grouping
const CustomMessageList = () => {
  const messageEndRef = useRef(null);
  const channelContext = useChannelStateContext();
  const messages = React.useMemo(() => {
    return channelContext?.messages || [];
  }, [channelContext?.messages]);

  useEffect(() => {
    try {
      if (messageEndRef.current) {
        messageEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    } catch (error) {
      console.error("Error scrolling to bottom:", error);
    }
  }, [messages]);

  // For debugging - log messages
  useEffect(() => {
    console.log("Messages in chat:", messages);
  }, [messages]);

  const renderMessages = () => {
    try {
      if (!messages || messages.length === 0) {
        return (
          <div className="str-chat__empty-channel">
            <p>No messages yet</p>
          </div>
        );
      }

      // Simple flat rendering of messages without grouping for maximum reliability
      return (
        <div className="str-chat__list">
          {messages.map(message => {
            if (!message || !message.id) return null;
            
            return (
              <div key={message.id} className="str-chat__li">
                <MessageWithCustomClass message={message} />
              </div>
            );
          })}
        </div>
      );
    } catch (error) {
      console.error("Error rendering messages:", error);
      return (
        <div className="str-chat__empty-channel">
          <p>Error displaying messages</p>
        </div>
      );
    }
  };

  return (
    <div className="str-chat__message-list-scroll">
      {renderMessages()}
      <div ref={messageEndRef} className="message-end" />
    </div>
  );
};

const ChatComponent = ({ userId, userName }) => {
  const [chatClient, setChatClient] = useState(null);
  const [channel, setChannel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingMessage, setProcessingMessage] = useState(false);
  const welcomeMessageSentRef = useRef(false);

  useEffect(() => {
    let client;
    let currentChannel;

    const initChat = async () => {
      try {
        if (!userId || !userName) {
          throw new Error('User ID and name are required');
        }

        // Initialize Stream Chat client
        client = StreamChat.getInstance(process.env.REACT_APP_STREAM_API_KEY);
        
        if (!client) {
          throw new Error('Failed to initialize Stream Chat client');
        }

        // Get chat token from backend
        const tokenResponse = await axios.post(`${API_URL}/chat/token/?user_id=${userId}`);
        
        if (!tokenResponse.data?.token) {
          throw new Error('Failed to get chat token');
        }

        await client.connectUser(
          {
            id: userId,
            name: userName,
            image: `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=random`,
          },
          tokenResponse.data.token
        );

        // Create or get channel
        const channelResponse = await axios.post(`${API_URL}/chat/channel/?learner_id=${userId}&coach_id=ai_coach_1`);

        if (!channelResponse.data?.channel_id) {
          throw new Error('Failed to create/get channel');
        }

        currentChannel = client.channel('messaging', channelResponse.data.channel_id, {
          name: 'AI Coach Chat',
          image: 'https://ui-avatars.com/api/?name=AI+Coach&background=007bff&color=fff',
        });

        await currentChannel.watch();

        // Check if the channel already has messages and specifically if there's already a welcome message
        const existingMessages = currentChannel.state.messages;
        const hasMessages = existingMessages && existingMessages.length > 0;
        const hasWelcomeMessage = hasMessages && existingMessages.some(
          msg => (msg.text && (
                   msg.text.includes("Hello! I'm your AI coach") || 
                   msg.text.includes("I'm your AI coach") ||
                   msg.text.includes("How can I help you")
                 )) && 
                 msg.user && msg.user.id === 'ai_coach_1'
        );
        
        // Track if welcome message exists already
        if (hasWelcomeMessage) {
          welcomeMessageSentRef.current = true;
        }
        
        // Only send welcome message if there are no existing messages and we haven't sent one in this session
        if (!hasMessages && !welcomeMessageSentRef.current) {
          welcomeMessageSentRef.current = true;
          await currentChannel.sendMessage({
            text: "Hello! I'm your AI coach. How can I help you today?",
            user: {
              id: 'ai_coach_1',
              name: 'AI Coach',
              image: 'https://ui-avatars.com/api/?name=AI+Coach&background=007bff&color=fff',
            }
          });
        }

        setChatClient(client);
        setChannel(currentChannel);
        setLoading(false);
      } catch (error) {
        console.error('Error initializing chat:', error);
        setError(error.message);
        setLoading(false);
      }
    };

    // Cleanup function
    const cleanup = async () => {
      setProcessingMessage(false);
      
      if (currentChannel) {
        currentChannel.off();
        try {
          await currentChannel.stopWatching();
        } catch (e) {
          console.log('Error stopping channel watch:', e);
        }
      }
      
      if (client) {
        try {
          await client.disconnectUser();
        } catch (e) {
          console.log('Error disconnecting user:', e);
        }
        setChatClient(null);
        setChannel(null);
      }
    };

    // Run cleanup before initializing
    cleanup().then(() => initChat());

    // Cleanup on unmount or when userId/userName changes
    return () => {
      cleanup();
    };
  }, [userId, userName]);

  // Custom Message Input
  const CustomMessageInput = () => {
    const { channel } = useChannelStateContext();
    const [text, setText] = useState('');
    const textareaRef = useRef(null);
    const [showQuickReplies, setShowQuickReplies] = useState(true);
    
    const quickReplies = [
      "Tell me more about coaching",
      "What goals can you help with?",
      "How does this work?",
      "Can you help me with motivation?"
    ];

    useEffect(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    }, []);

    const handleSendMessage = async (messageText) => {
      if (!messageText.trim()) return;
      
      // Hide quick replies once user sends a message
      setShowQuickReplies(false);
      
      try {
        setProcessingMessage(true);
        
        // First send the message to the channel
        await channel.sendMessage({
          text: messageText,
          user: {
            id: userId,
            name: userName,
            image: `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=random`,
          },
        });
        
        // Get AI response from backend
        const response = await axios.post(`${API_URL}/chat/message/`, {
          user_id: userId,
          message: messageText,
          channel_id: channel.id,
        });

        if (response.data?.ai_response) {
          await channel.sendMessage({
            text: response.data.ai_response,
            user: {
              id: 'ai_coach_1',
              name: 'AI Coach',
              image: 'https://ui-avatars.com/api/?name=AI+Coach&background=007bff&color=fff',
            }
          });
        }
      } catch (error) {
        console.error('Error getting AI response:', error);
      } finally {
        setProcessingMessage(false);
        setText('');
        
        // Force scroll to bottom after sending message
        setTimeout(() => {
          const messageList = document.querySelector('.str-chat__message-list-scroll');
          if (messageList) {
            messageList.scrollTop = messageList.scrollHeight;
          }
        }, 100);
      }
    };

    const handleSubmit = (event) => {
      event.preventDefault();
      handleSendMessage(text);
    };

    const handleQuickReply = (reply) => {
      handleSendMessage(reply);
    };

    const handleKeyPress = (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSubmit(event);
      }
    };

    return (
      <div className="message-input-container">
        {processingMessage && (
          <div className="typing-indicator">
            <div className="typing-indicator__dot"></div>
            <div className="typing-indicator__dot"></div>
            <div className="typing-indicator__dot"></div>
          </div>
        )}
        
        {showQuickReplies && (
          <div className="quick-reply-container">
            {quickReplies.map((reply, index) => (
              <button 
                key={index} 
                className="quick-reply-button" 
                onClick={() => handleQuickReply(reply)}
                disabled={processingMessage}
              >
                {reply}
              </button>
            ))}
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="message-input-form">
          <textarea
            ref={textareaRef}
            className="message-input-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={processingMessage ? "AI coach is typing..." : "Type your message here..."}
            disabled={processingMessage}
            rows={1}
          />
          <button 
            className="message-input-button" 
            type="submit"
            disabled={processingMessage || !text.trim()}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" fill="white"/>
            </svg>
          </button>
        </form>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="loading-container">
        <LoadingIndicator size={40} />
        <p>Initializing your coaching session...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  if (!chatClient || !channel) {
    return (
      <div className="error-container">
        <h2>Error</h2>
        <p>Chat client or channel not initialized</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="chat-container">
      <StreamChatComponent theme={customTheme} client={chatClient}>
        <Channel channel={channel}>
          <div className="str-chat__main">
            <CustomChannelHeader />
            <CustomMessageList />
            <div className="message-input-container">
              <CustomMessageInput />
              {processingMessage && (
                <div className="typing-indicator">
                  <div className="typing-indicator__dot"></div>
                  <div className="typing-indicator__dot"></div>
                  <div className="typing-indicator__dot"></div>
                </div>
              )}
            </div>
          </div>
        </Channel>
      </StreamChatComponent>
    </div>
  );
};

export default ChatComponent;