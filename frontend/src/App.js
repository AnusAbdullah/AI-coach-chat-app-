import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ChatComponent from './components/Chat';
import './App.css';

function App() {
  const [userId, setUserId] = useState('');
  const [userName, setUserName] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (userName.trim()) {
      const uniqueId = `user_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      setUserId(uniqueId);
      setIsLoggedIn(true);
    }
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
      <Routes>
        <Route
          path="/chat"
          element={<ChatComponent userId={userId} userName={userName} />}
        />
        <Route path="/" element={<Navigate to="/chat" />} />
      </Routes>
    </Router>
  );
}

export default App;