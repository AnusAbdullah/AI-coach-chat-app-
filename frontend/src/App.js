import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ChatComponent from './components/Chat';
import './App.css';

function App() {
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Check for existing login on component mount
  useEffect(() => {
    const storedUserId = localStorage.getItem('aiCoachUserId');
    const storedUserName = localStorage.getItem('aiCoachUserName');
    
    if (storedUserId && storedUserName) {
      setUserId(storedUserId);
      setUserName(storedUserName);
      setIsLoggedIn(true);
    }
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (userName.trim()) {
      // Create a consistent user ID based on the username
      // This ensures the same user gets the same ID across sessions
      const cleanUsername = userName.trim().toLowerCase().replace(/\s+/g, '_');
      const persistentId = `user_${cleanUsername}_${userName.length}`;
      
      // Store in state and localStorage for persistence
      setUserId(persistentId);
      setUserName(userName.trim());
      setIsLoggedIn(true);
      
      // Save to localStorage for persistent login
      localStorage.setItem('aiCoachUserId', persistentId);
      localStorage.setItem('aiCoachUserName', userName.trim());
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('aiCoachUserId');
    localStorage.removeItem('aiCoachUserName');
    setUserId('');
    setUserName('');
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h1>AI Coach</h1>
            <p>Your personal AI coaching assistant</p>
          </div>
          <form onSubmit={handleSubmit} className="login-form">
            <div className="form-group">
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Enter your name"
                className="name-input"
                required
              />
            </div>
            <button type="submit" className="login-button">
              Start Coaching Session
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="app-container">
        <div className="app-header">
          <h2>AI Coach</h2>
          <div className="user-info">
            <span>Logged in as: {userName}</span>
            <button onClick={handleLogout} className="logout-button">Logout</button>
          </div>
        </div>
        <Routes>
          <Route
            path="/chat"
            element={<ChatComponent userId={userId} userName={userName} />}
          />
          <Route path="/" element={<Navigate to="/chat" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;