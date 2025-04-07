import React, { useEffect, useState, useRef, useCallback } from 'react';
import { StreamChat } from 'stream-chat';
import {
  Chat as StreamChatComponent,
  Channel,
  LoadingIndicator,
  useChannelStateContext,
} from 'stream-chat-react';
import axios from 'axios';

const API_URL = 'https://ai-coach-chat-app-production.up.railway.app';

// Custom theme configuration
const customTheme = {
  '--primary-color': '#007bff',
  '--primary-color-alpha': 'rgba(0, 123, 255, 0.1)',
  '--secondary-color': '#0056b3',
  '--border-radius-sm': '8px',
  '--border-radius': '16px',
  '--font-family': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
};

// Previous Conversations component
const PreviousConversations = ({ conversations, onConversationSelect, isOpen, toggleOpen, onRefresh, onNewChat, isLoading }) => {
  // Don't return null even when empty, so the sidebar is always visible
  const isEmpty = !conversations || conversations.length === 0;

  // Format date for conversation groups
  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown date';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Unknown date';
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Unknown date';
    }
  };

  return (
    <div className="previous-conversations-container">
      <div className="previous-conversations-header">
        <h3 onClick={toggleOpen}>Previous Conversations {isOpen ? '▼' : '▶'}</h3>
        <button className="refresh-button" onClick={onRefresh} title="Refresh conversation history">
          ⟳
        </button>
      </div>
      
      {isOpen && (
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
              
              // Find the created_at date of the first message or use current date
              let conversationDate = 'Unknown date';
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
              
              // Get the first few messages to show as preview
              const previewMessages = conversation.messages.slice(0, 2);
              
              return (
                <div 
                  key={conversation.channel_id || index} 
                  className="previous-conversation-item"
                  onClick={() => onConversationSelect(conversation.channel_id)}
                >
                  <div className="conversation-date">{conversationDate}</div>
                  <div className="conversation-preview">
                    {previewMessages.map((msg, i) => {
                      if (!msg || !msg.content) return null;
                      
                      return (
                        <div key={i} className="preview-message">
                          <span className={`preview-author ${msg.role === 'assistant' ? 'ai-author' : 'user-author'}`}>
                            {msg.role === 'assistant' ? 'AI: ' : 'You: '}
                          </span>
                          <span className="preview-text">
                            {msg.content.length > 40 ? msg.content.substring(0, 40) + '...' : msg.content}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
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
    if (!props || !props.message) {
      return null;
    }
    
    const message = props.message;
    const isAI = message.user && message.user.id === 'ai_coach_1';
    
    let timestamp = "";
    if (message.created_at) {
      const date = new Date(message.created_at);
      timestamp = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    return (
      <div className={isAI ? "ai-message" : "user-message"}>
        <div className="message-container">
          {!isAI && (
            <>
              <div className="str-chat__avatar user-avatar">
                {message.user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div className="message-bubble">
                <div className="str-chat__message-text-inner">
                  {message.text || ''}
                </div>
                {timestamp && <div className="message-time">{timestamp}</div>}
              </div>
            </>
          )}
          {isAI && (
            <>
              <div className="message-bubble">
                <div className="str-chat__message-text-inner">
                  {message.text || ''}
                </div>
                {timestamp && <div className="message-time">{timestamp}</div>}
              </div>
              <div className="str-chat__avatar ai-avatar">
                AI
              </div>
            </>
          )}
        </div>
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
  const [loadingPreviousChats, setLoadingPreviousChats] = useState(false);
  const [error, setError] = useState(null);
  const [processingMessage, setProcessingMessage] = useState(false);
  const [text, setText] = useState('');
  const [showQuickReplies, setShowQuickReplies] = useState(true);
  const [previousConversations, setPreviousConversations] = useState([]);
  const [showPreviousConversations, setShowPreviousConversations] = useState(true);
  const textareaRef = useRef(null);

  const quickReplies = [
    "Tell me more about coaching",
    "What goals can you help with?",
    "How does this work?",
    "Can you help me with motivation?"
  ];

  // Fetch previous conversations - wrapped in useCallback to prevent dependency cycles
  const fetchPreviousConversations = useCallback(async () => {
    if (!userId) {
      console.warn('Cannot fetch previous conversations: User ID is missing');
      return;
    }
    
    console.log('Fetching previous conversations for user:', userId);
    
    try {
      const response = await axios.get(`${API_URL}/memory/${userId}`);
      console.log('Previous conversations API response:', response.data);
      
      if (response.data && Array.isArray(response.data.conversation_history)) {
        // Sort conversations by most recent first
        const sortedConversations = [...response.data.conversation_history].sort((a, b) => {
          const aDate = a.messages && a.messages.length > 0 && a.messages[0].created_at
            ? new Date(a.messages[0].created_at) 
            : new Date(0);
          const bDate = b.messages && b.messages.length > 0 && b.messages[0].created_at
            ? new Date(b.messages[0].created_at)
            : new Date(0);
          return bDate - aDate;
        });
        
        console.log('Sorted conversations:', sortedConversations.length, 'conversations found');
        setPreviousConversations(sortedConversations);
        return sortedConversations; // Return the conversations for use by other functions
      } else {
        console.warn('Invalid conversation history data format:', response.data);
        setPreviousConversations([]);
        return [];
      }
    } catch (error) {
      console.error('Error fetching previous conversations:', error);
      // Don't show error to user, just log it and continue with empty conversations
      setPreviousConversations([]);
      return [];
    }
  }, [userId]); // Only re-create if userId changes

  // Helper function to create new channel - separate from the main createNewChannel callback
  const createNewChannelHelper = async (client) => {
    if (!client) {
      console.error('Cannot create new channel: client is not initialized');
      return null;
    }
    
    try {
      setLoading(true);
      
      // Create a new channel
      const channelResponse = await axios.post(`${API_URL}/chat/channel/?learner_id=${userId}&coach_id=ai_coach_1`);
      
      if (!channelResponse.data?.channel_id) {
        throw new Error('Failed to create new channel');
      }
      
      // Create and watch the new channel
      const newChannel = client.channel('messaging', channelResponse.data.channel_id, {
        name: 'AI Coach Chat',
        image: 'https://ui-avatars.com/api/?name=AI+Coach&background=007bff&color=fff',
      });
      
      await newChannel.watch();
      
      // Send welcome message
      await newChannel.sendMessage({
        text: "Hello! I'm your AI coach. How can I help you today?",
        user: {
          id: 'ai_coach_1',
          name: 'AI Coach',
          image: 'https://ui-avatars.com/api/?name=AI+Coach&background=007bff&color=fff',
        }
      });
      
      return newChannel;
    } catch (error) {
      console.error('Error creating new channel helper:', error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Change to a different conversation channel
  const handleConversationSelect = async (channelId) => {
    if (!chatClient || !channelId) {
      console.error('Cannot switch channels: Missing client or channel ID');
      return;
    }
    
    setLoading(true);
    
    try {
      // Clean up current channel
      if (channel) {
        channel.off();
        try {
          await channel.stopWatching();
        } catch (e) {
          console.warn('Error stopping previous channel watch:', e);
          // Continue despite error
        }
      }
      
      // Create and watch the selected channel
      const selectedChannel = chatClient.channel('messaging', channelId, {
        name: 'AI Coach Chat',
        image: 'https://ui-avatars.com/api/?name=AI+Coach&background=007bff&color=fff',
      });
      
      await selectedChannel.watch();
      setChannel(selectedChannel);
      
      // Hide previous conversations panel after selection
      setShowPreviousConversations(false);
    } catch (error) {
      console.error('Error changing conversation:', error);
      setError('Failed to switch conversations. Please try reloading the page.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  const handleSendMessage = async (messageText) => {
    if (!messageText || !messageText.trim()) {
      return;
    }
    
    if (!channel) {
      setError('Chat connection error. Please reload the page.');
      return;
    }
    
    setShowQuickReplies(false);
    
    try {
      setProcessingMessage(true);
      
      // Send user message to Stream Chat
      await channel.sendMessage({
        text: messageText,
        user: {
          id: userId,
          name: userName,
          image: `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=random`,
        },
      });
      
      // Get AI response from backend
      try {
        const response = await axios.post(`${API_URL}/chat/message/`, {
          user_id: userId,
          message: messageText,
          channel_id: channel.id,
        });

        if (response.data?.ai_response) {
          // Send AI response to Stream Chat
          await channel.sendMessage({
            text: response.data.ai_response,
            user: {
              id: 'ai_coach_1',
              name: 'AI Coach',
              image: 'https://ui-avatars.com/api/?name=AI+Coach&background=007bff&color=fff',
            }
          });
        } else {
          console.warn('No AI response received from the backend');
        }
      } catch (apiError) {
        console.error('Error getting AI response from API:', apiError);
        // Send error message to the chat
        await channel.sendMessage({
          text: "I'm having trouble responding right now. Please try again in a moment.",
          user: {
            id: 'ai_coach_1',
            name: 'AI Coach',
            image: 'https://ui-avatars.com/api/?name=AI+Coach&background=007bff&color=fff',
          }
        });
      }
    } catch (error) {
      console.error('Error in message handling:', error);
    } finally {
      setProcessingMessage(false);
      setText('');
      
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

  // Create a new chat channel
  const createNewChannel = useCallback(async () => {
    if (!chatClient) {
      setError('Chat connection error. Please reload the page.');
      return null;
    }
    
    try {
      // Clean up current channel if exists
      if (channel) {
        channel.off();
        try {
          await channel.stopWatching();
        } catch (e) {
          console.warn('Error stopping previous channel watch:', e);
        }
      }
      
      // Create the new channel using the helper
      const newChannel = await createNewChannelHelper(chatClient);
      
      if (newChannel) {
        setChannel(newChannel);
        // Refresh conversation list after creating a new channel
        fetchPreviousConversations();
      }
      
      return newChannel;
    } catch (error) {
      console.error('Error creating new chat:', error);
      setError('Failed to create a new chat. Please try again.');
      return null;
    }
  }, [chatClient, channel, userId, createNewChannelHelper, fetchPreviousConversations]);

  // Handle new chat button click
  const handleNewChat = useCallback(async () => {
    await createNewChannel();
    // Hide previous conversations panel after creating new chat
    setShowPreviousConversations(false);
  }, [createNewChannel]);

  // Update the useEffect to handle initialization properly
  useEffect(() => {
    let client;

    const initChat = async () => {
      try {
        setLoading(true);
        
        if (!userId || !userName) {
          throw new Error('User ID and name are required');
        }

        console.log('Initializing chat for user:', userId);
        client = StreamChat.getInstance(process.env.REACT_APP_STREAM_API_KEY);
        
        if (!client) {
          throw new Error('Failed to initialize Stream Chat client');
        }

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

        setChatClient(client);
        
        // Fetch previous conversations first
        setLoadingPreviousChats(true);
        let conversations = [];
        
        try {
          conversations = await fetchPreviousConversations();
          
          // If there's at least one previous conversation, load the most recent one
          if (conversations && conversations.length > 0) {
            const mostRecentConversation = conversations[0];
            
            // Load the most recent conversation
            if (mostRecentConversation.channel_id) {
              const existingChannel = client.channel('messaging', mostRecentConversation.channel_id, {
                name: 'AI Coach Chat',
                image: 'https://ui-avatars.com/api/?name=AI+Coach&background=007bff&color=fff',
              });
              
              await existingChannel.watch();
              setChannel(existingChannel);
            } else {
              // No valid channel ID, create a new one
              await createNewChannelHelper(client).then(newChannel => {
                if (newChannel) setChannel(newChannel);
              });
            }
          } else {
            // No previous conversations, create a new channel
            await createNewChannelHelper(client).then(newChannel => {
              if (newChannel) setChannel(newChannel);
            });
          }
        } catch (memoryError) {
          console.error('Error handling memory/channels:', memoryError);
          // If we can't fetch memory, create a new channel
          await createNewChannelHelper(client).then(newChannel => {
            if (newChannel) setChannel(newChannel);
          });
        } finally {
          setLoadingPreviousChats(false);
          setLoading(false);
        }
      } catch (error) {
        console.error('Error in chat initialization:', error);
        setError(error.message || 'Failed to initialize chat. Please try again.');
        setLoading(false);
      }
    };

    const cleanup = async () => {
      setProcessingMessage(false);
      
      if (channel) {
        channel.off();
        try {
          await channel.stopWatching();
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

    cleanup().then(() => initChat());

    return () => {
      cleanup();
    };
  }, [userId, userName, fetchPreviousConversations]);

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
    <div className="chat-app-container">
      <PreviousConversations 
        conversations={previousConversations}
        onConversationSelect={handleConversationSelect}
        isOpen={showPreviousConversations}
        toggleOpen={() => setShowPreviousConversations(!showPreviousConversations)}
        onRefresh={fetchPreviousConversations}
        onNewChat={handleNewChat}
        isLoading={loadingPreviousChats}
      />
      
      <div className="chat-container">
        <StreamChatComponent theme={customTheme} client={chatClient}>
          <Channel channel={channel}>
            <div className="str-chat__main">
              <CustomChannelHeader />
              <CustomMessageList />
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
            </div>
          </Channel>
        </StreamChatComponent>
      </div>
    </div>
  );
};

export default ChatComponent;