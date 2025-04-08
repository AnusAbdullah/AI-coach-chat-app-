import React, { useEffect, useState, useRef, useCallback } from 'react';
import { StreamChat } from 'stream-chat';
import {
  Chat as StreamChatComponent,
  Channel,
  LoadingIndicator,
  useChannelStateContext,
} from 'stream-chat-react';
import axios from 'axios';
import PreviousConversations from './PreviousConversations';

const API_URL = 'https://ai-coach-chat-app-production.up.railway.app';
const STREAM_API_KEY = 'ndhs5z8yt9pk';

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
    if (!props || !props.message) return null;
    
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
  const messages = React.useMemo(() => channelContext?.messages || [], [channelContext?.messages]);

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
  const [isClientConnected, setIsClientConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const maxRetries = 3;
  const textareaRef = useRef(null);

  const quickReplies = [
    "Tell me more about coaching",
    "What goals can you help with?",
    "How does this work?",
    "Can you help me with motivation?"
  ];

  // Fetch previous conversations
  const fetchPreviousConversations = useCallback(async () => {
    if (!userId) {
      console.warn('Cannot fetch previous conversations: User ID is missing');
      return [];
    }
    
    console.log('Fetching previous conversations for user:', userId);
    
    try {
      const response = await axios.get(`${API_URL}/memory/${userId}`);
      console.log('Previous conversations API response:', response.data);
      
      if (response.data && Array.isArray(response.data.conversation_history)) {
        const channelGroups = {};
        
        response.data.conversation_history.forEach(convo => {
          if (convo.channel_id && convo.messages && convo.messages.length > 0) {
            if (!channelGroups[convo.channel_id]) {
              channelGroups[convo.channel_id] = {
                channel_id: convo.channel_id,
                messages: [...convo.messages],
                channel_metadata: convo.channel_metadata || {}
              };
            } else {
              channelGroups[convo.channel_id].messages = [
                ...channelGroups[convo.channel_id].messages,
                ...convo.messages
              ];
            }
          }
        });
        
        const groupedConversations = Object.values(channelGroups);
        const sortedConversations = groupedConversations.sort((a, b) => {
          const aCreatedAt = a.channel_metadata?.created_at;
          const bCreatedAt = b.channel_metadata?.created_at;
          
          if (aCreatedAt && bCreatedAt) return new Date(bCreatedAt) - new Date(aCreatedAt);
          
          const aTimestamp = a.channel_id.match(/\d{13}/);
          const bTimestamp = b.channel_id.match(/\d{13}/);
          
          if (aTimestamp && bTimestamp) return parseInt(bTimestamp[0]) - parseInt(aTimestamp[0]);
          
          const aDate = a.messages?.[0]?.created_at ? new Date(a.messages[0].created_at) : new Date(0);
          const bDate = b.messages?.[0]?.created_at ? new Date(b.messages[0].created_at) : new Date(0);
          
          return bDate - aDate;
        });
        
        console.log('Sorted and grouped conversations:', sortedConversations.length, 'conversations found');
        const validConversations = sortedConversations.filter(
          conv => conv.messages && conv.messages.length > 0 && conv.channel_id
        );
        
        setPreviousConversations(validConversations);
        return validConversations;
      } else {
        console.warn('Invalid conversation history data format:', response.data);
        setPreviousConversations([]);
        return [];
      }
    } catch (error) {
      console.error('Error fetching previous conversations:', error);
      setPreviousConversations([]);
      return [];
    }
  }, [userId]);

  // Helper function to create new channel - with better error handling
  const createNewChannelHelper = useCallback(async (client) => {
    if (!client) {
      console.error('Cannot create new channel: client is not initialized');
      return null;
    }
    
    try {
      setLoading(true);
      setConnectionStatus('Creating new channel...');
      
      // Clean up existing channel if any
      if (channel) {
        console.log('Cleaning up previous channel before creating new one');
        channel.off();
        try {
          await channel.stopWatching();
        } catch (e) {
          console.warn('Error stopping previous channel watch:', e);
        }
      }
      
      // First simply try to create a new channel without backend registration
      try {
        // Generate a unique ID
        const uniqueId = `${userId}-${Date.now()}`;
        console.log('Creating direct Stream channel with ID:', uniqueId);
        
        // Create the Stream Chat channel directly
        const newChannel = client.channel('messaging', uniqueId, {
          name: 'AI Coach Chat',
          members: [userId, 'ai_coach_1'],
        });
        
        // Watch the channel
        await newChannel.watch();
        console.log('Successfully watching Stream channel:', uniqueId);
        
        // Try to register with backend after successful Stream channel creation
        try {
          await axios.post(`${API_URL}/chat/channel/?learner_id=${userId}&coach_id=ai_coach_1`, {
            channel_id: uniqueId
          });
          console.log('Backend channel registration successful');
        } catch (backendError) {
          // Continue even if backend registration fails
          console.warn('Backend channel registration failed, continuing with Stream channel:', backendError);
        }
        
        // Send welcome message
        await newChannel.sendMessage({
          text: "Hello! I'm your AI coach. How can I help you today?",
          user: { id: 'ai_coach_1', name: 'AI Coach' }
        });
        
        return newChannel;
      } catch (streamError) {
        console.error('Error creating Stream channel directly:', streamError);
        throw streamError;
      }
    } catch (error) {
      console.error('Error in createNewChannelHelper:', error);
      setError(`Failed to create chat: ${error.message}`);
      return null;
    } finally {
      setLoading(false);
      setConnectionStatus('');
    }
  }, [userId, channel]);

  // Change to a different conversation channel
  const handleConversationSelect = async (channelId) => {
    if (!chatClient || !channelId || !isClientConnected) {
      console.error('Cannot switch channels: Missing client, channel ID, or client not connected');
      return;
    }
    
    console.log('Switching to channel:', channelId);
    setLoading(true);
    
    try {
      if (channel) {
        console.log('Stopping previous channel watch before switching');
        channel.off();
        await channel.stopWatching().catch(e => console.warn('Error stopping previous channel watch:', e));
      }
      
      const selectedChannel = chatClient.channel('messaging', channelId, {
        name: 'AI Coach Chat',
        image: 'https://ui-avatars.com/api/?name=AI+Coach&background=007bff&color=fff',
      });
      
      await selectedChannel.watch();
      console.log('Successfully switched to channel:', channelId);
      setChannel(selectedChannel);
      
      if (window.innerWidth < 768) setShowPreviousConversations(false);
    } catch (error) {
      console.error('Error changing conversation:', error);
      setError('Failed to switch conversations. Please try reloading the page.');
    } finally {
      setLoading(false);
    }
  };

  // Send message handler with connection check
  const handleSendMessage = async (messageText) => {
    if (!messageText || !messageText.trim() || !isClientConnected) return;
    if (!channel) {
      setError('Chat connection error. Please reload the page.');
      return;
    }
    
    setShowQuickReplies(false);
    setProcessingMessage(true);
    
    try {
      await channel.sendMessage({
        text: messageText,
        user: {
          id: userId,
          name: userName,
          image: `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=random`,
        },
      });
      
      const channelId = channel.id;
      console.log(`Sending message to API for channel: ${channelId}`);
      const response = await axios.post(`${API_URL}/chat/message/`, {
        user_id: userId,
        message: messageText,
        channel_id: channelId,
      }).catch(apiError => {
        console.error('Error getting AI response from API:', apiError);
        throw apiError;
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
      } else {
        console.warn('No AI response received from the backend');
      }
    } catch (error) {
      console.error('Error in message handling:', error);
      await channel.sendMessage({
        text: "I'm having trouble responding right now. Please try again in a moment.",
        user: {
          id: 'ai_coach_1',
          name: 'AI Coach',
          image: 'https://ui-avatars.com/api/?name=AI+Coach&background=007bff&color=fff',
        }
      });
    } finally {
      setProcessingMessage(false);
      setText('');
      setTimeout(() => {
        const messageList = document.querySelector('.str-chat__message-list-scroll');
        if (messageList) messageList.scrollTop = messageList.scrollHeight;
      }, 100);
    }
  };

  // Handle new chat creation
  const handleNewChat = useCallback(async () => {
    if (!isClientConnected) return;
    try {
      console.log('Creating new chat...');
      setError(null);
      setText('');
      setShowQuickReplies(true);
      
      const newChannel = await createNewChannelHelper(chatClient);
      if (newChannel) {
        setChannel(newChannel);
        console.log('New chat created with channel:', newChannel.id);
        fetchPreviousConversations();
        if (window.innerWidth < 768) setShowPreviousConversations(false);
      } else {
        setError('Failed to create a new chat.');
      }
    } catch (error) {
      console.error('Error in handleNewChat:', error);
      setError(`Failed to create a new chat: ${error.message || 'Unknown error'}`);
    }
  }, [chatClient, createNewChannelHelper, fetchPreviousConversations, isClientConnected]);

  // Quick reply handler
  const handleQuickReply = (quickReply) => {
    setText(quickReply);
    handleSendMessage(quickReply);
  };

  // Form submission handler
  const handleSubmit = (e) => {
    e.preventDefault();
    handleSendMessage(text);
    setText('');
  };

  // Key press handler
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Main initialization and cleanup effect
  useEffect(() => {
    let client = null;
    let currentChannel = null;
    let isMounted = true;

    const cleanup = async () => {
      console.log("Running cleanup...");
      setIsClientConnected(false);
      if (isMounted) {
        setChannel(null);
        setChatClient(null);
        setProcessingMessage(false);
      }
      if (currentChannel) {
        console.log("Cleaning up channel...");
        try {
          currentChannel.off();
          await currentChannel.stopWatching();
        } catch (e) {
          console.warn("Error stopping channel watch:", e);
        }
        currentChannel = null;
      }
      if (client) {
        console.log("Disconnecting client...");
        try {
          await client.disconnectUser();
        } catch (e) {
          console.log("Error disconnecting user:", e);
        }
        client = null;
      }
    };

    const init = async () => {
      try {
        if (!isMounted) return;
        
        setLoading(true);
        setError(null);
        setConnectionStatus('Starting initialization...');

        if (!userId || !userName) {
          throw new Error("User ID and name are required");
        }

        // Always ensure we're starting fresh
        await cleanup();
        if (!isMounted) return;

        setConnectionStatus('Creating Stream Chat client...');
        console.log("Creating Stream Chat client with API Key:", STREAM_API_KEY);
        client = StreamChat.getInstance(STREAM_API_KEY);
        console.log("Stream Chat client created");

        setConnectionStatus('Requesting authentication token...');
        console.log(`Requesting token for user: ${userId}`);
        
        let token;
        try {
          const tokenResponse = await axios.post(`${API_URL}/chat/token/?user_id=${userId}`);
          console.log("Token API response received");
          
          if (!tokenResponse.data?.token) {
            throw new Error("Empty token response from server");
          }
          token = tokenResponse.data.token;
          console.log("Token retrieved successfully");
        } catch (tokenError) {
          console.error("Token retrieval error:", tokenError);
          throw new Error(`Failed to get chat token: ${tokenError.message || 'Unknown error'}`);
        }

        setConnectionStatus('Connecting to Stream Chat...');
        try {
          console.log(`Connecting user: ${userId} with token`);
          await client.connectUser(
            {
              id: userId,
              name: userName,
              image: `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=random`,
            },
            token
          );
          console.log("User connected successfully to Stream Chat");
          setChatClient(client);
          setIsClientConnected(true);
        } catch (connectError) {
          console.error("Stream Chat connection error:", connectError);
          setRetryCount(prev => prev + 1);
          if (retryCount < maxRetries) {
            console.log(`Retrying connection (${retryCount + 1}/${maxRetries})...`);
            throw new Error(`Stream Chat connection failed: ${connectError.message}`);
          } else {
            throw new Error(`Failed to connect after ${maxRetries} attempts: ${connectError.message}`);
          }
        }

        if (!isMounted) {
          await cleanup();
          return;
        }

        // Now create a channel
        setConnectionStatus('Creating chat channel...');
        console.log("Creating initial channel...");
        currentChannel = await createNewChannelHelper(client);
        
        if (!currentChannel) {
          throw new Error("Channel creation failed");
        }

        console.log("Initial channel created:", currentChannel.id);
        setChannel(currentChannel);

        // Load previous conversations
        setConnectionStatus('Loading previous conversations...');
        console.log("Loading previous conversations...");
        setLoadingPreviousChats(true);
        
        try {
          await fetchPreviousConversations();
        } catch (convError) {
          console.error("Error loading previous conversations:", convError);
          // Continue anyway - not critical
        }

        if (isMounted) {
          setLoadingPreviousChats(false);
          setLoading(false);
          setConnectionStatus('');
          setShowPreviousConversations(true);
          console.log("Initialization completed successfully");
        }

        // Add these debug logs to verify:
        console.log('Existing channels:', existingChannels.length);
        existingChannels.forEach(ch => {
          console.log('Channel:', ch.id, 'Created:', ch.data.created_at);
        });
      } catch (error) {
        console.error("Chat initialization error:", error);
        
        if (isMounted) {
          setError(`${error.message}. Please check your connection and try again.`);
          setLoading(false);
          setLoadingPreviousChats(false);
          setConnectionStatus('');
          // Don't trigger automatic reload, just clean up
          await cleanup();
        }
      }
    };

    // Only initialize if we haven't seen an error yet
    if (!error) {
      init();
    }

    // Cleanup on unmount
    return () => {
      console.log("Component unmounting...");
      isMounted = false;
      cleanup();
    };
  }, [userId, userName, createNewChannelHelper, fetchPreviousConversations, retryCount, maxRetries, error]);

  // Focus textarea on mount
  useEffect(() => {
    if (textareaRef.current) textareaRef.current.focus();
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="loading-container" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <LoadingIndicator size={40} />
        <p style={{ fontSize: '18px', margin: '15px 0' }}>Initializing your coaching session...</p>
        
        <div className="loading-details" style={{ 
          marginTop: '15px', 
          fontSize: '14px', 
          color: '#666',
          padding: '10px',
          background: '#f8f9fa',
          borderRadius: '8px', 
          maxWidth: '400px',
          margin: '0 auto'
        }}>
          {connectionStatus && (
            <div style={{ marginBottom: '8px', fontWeight: 'bold' }}>
              {connectionStatus}
            </div>
          )}
          {!chatClient && <div>• Connecting to chat service...</div>}
          {chatClient && !channel && <div>• Creating chat channel...</div>}
          {loadingPreviousChats && <div>• Loading previous conversations...</div>}
        </div>
        
        <button 
          onClick={() => {
            // Just reload the page
            window.location.reload();
          }}
          className="retry-button"
          style={{ 
            marginTop: '25px', 
            padding: '10px 20px', 
            cursor: 'pointer',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          Retry Connection
        </button>
        
        {retryCount > 0 && (
          <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
            Retry attempt {retryCount} of {maxRetries}
          </div>
        )}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="error-container" style={{ 
        textAlign: 'center', 
        padding: '40px 20px',
        maxWidth: '500px',
        margin: '0 auto',
        background: '#fff',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ color: '#dc3545', marginBottom: '20px' }}>Connection Error</h2>
        <p style={{ margin: '20px 0', color: '#333', lineHeight: '1.5' }}>{error}</p>
        
        <div style={{ 
          background: '#f8f9fa',
          border: '1px solid #ddd',
          borderRadius: '4px',
          padding: '15px',
          margin: '20px 0',
          textAlign: 'left',
          fontSize: '13px'
        }}>
          <p><strong>Troubleshooting Tips:</strong></p>
          <ul style={{ paddingLeft: '20px', marginTop: '5px' }}>
            <li>Check your internet connection</li>
            <li>Verify the backend server is running</li>
            <li>Try logging in again</li>
          </ul>
        </div>
        
        <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
          <button 
            onClick={() => {
              // Just reload the page
              window.location.reload();
            }}
            style={{ 
              padding: '12px 24px', 
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            Retry Connection
          </button>
          
          <button 
            onClick={() => {
              setError(null);
              setLoading(false);
            }}
            style={{ 
              padding: '12px 24px', 
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Main render
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
        {chatClient && channel && isClientConnected ? (
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
        ) : (
          <div className="loading-container">
            <LoadingIndicator size={40} />
            <p>Initializing your coaching session...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatComponent;