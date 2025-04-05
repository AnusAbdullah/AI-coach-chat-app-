# AI Coach Chat Application

A real-time chat application that connects learners with an AI coach, built with Stream.io, FastAPI, and React.

## Features

- Real-time 1-1 chat between learners and AI coach
- Smart memory system to track learner progress and preferences
- Modern UI with responsive design
- Secure authentication and chat tokens

## Prerequisites

- Python 3.8+
- Node.js 14+
- Stream.io account and API credentials

## Setup

1. Clone the repository
2. Set up the backend:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```
3. Create a `.env` file in the root directory with your Stream.io credentials:
   ```
   STREAM_API_KEY=your_api_key
   STREAM_API_SECRET=your_api_secret
   ```

4. Set up the frontend:
   ```bash
   cd frontend
   npm install
   ```

5. Create a `.env` file in the frontend directory:
   ```
   REACT_APP_STREAM_API_KEY=your_api_key
   ```

## Running the Application

1. Start the backend server:
   ```bash
   cd backend
   uvicorn main:app --reload
   ```

2. Start the frontend development server:
   ```bash
   cd frontend
   npm start
   ```

3. Open your browser and navigate to `http://localhost:3000`

## Usage

1. Enter your name on the login screen
2. Start chatting with the AI coach
3. The AI coach will remember your preferences and goals across sessions

## Architecture

- Backend: FastAPI with Stream.io integration
- Frontend: React with Stream.io React components
- Memory System: In-memory storage (can be replaced with a database in production)

## Security Considerations

- All chat tokens are generated server-side
- User authentication is handled through Stream.io
- API keys are stored in environment variables

## Future Improvements

- Add database integration for persistent storage
- Implement more sophisticated AI coaching logic
- Add user profiles and progress tracking
- Implement file sharing capabilities 