from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from stream_chat import StreamChat
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import os
from dotenv import load_dotenv
import logging
import google.generativeai as genai
import re
import json
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

load_dotenv(dotenv_path=".env.production")

# Database setup
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

# Check if DATABASE_URL is set
if not SQLALCHEMY_DATABASE_URL:
    logger.error("DATABASE_URL environment variable is not set")
    # Provide a fallback for development or use a SQLite database
    SQLALCHEMY_DATABASE_URL = "sqlite:///./ai_coach.db"
    logger.warning(f"Using fallback database: {SQLALCHEMY_DATABASE_URL}")

# Format URL if it's PostgreSQL
if SQLALCHEMY_DATABASE_URL and SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Determine if we're using SQLite
is_sqlite = SQLALCHEMY_DATABASE_URL.startswith("sqlite")

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Helper functions for JSON in SQLite
def default_list():
    return []

def default_dict():
    return {}

# Database Models
class UserModel(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True)
    name = Column(String)
    role = Column(String)
    
    # Use different column types based on database
    if is_sqlite:
        goals = Column(JSON, default=default_list)
        preferences = Column(JSON, default=default_dict)
    else:
        goals = Column(JSONB, default=lambda: [])
        preferences = Column(JSONB, default=lambda: {})
        
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ConversationModel(Base):
    __tablename__ = "conversations"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"))
    channel_id = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class MessageModel(Base):
    __tablename__ = "messages"
    
    id = Column(Integer, primary_key=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"))
    role = Column(String)  # "user" or "assistant"
    content = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

# Create tables
Base.metadata.create_all(bind=engine)

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

app = FastAPI()

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add a root endpoint for health checks
@app.get("/")
async def root():
    return {"status": "OK", "message": "AI Coach Backend is running"}

# Initialize StreamChat client
try:
    stream_api_key = os.getenv("STREAM_API_KEY")
    stream_api_secret = os.getenv("STREAM_API_SECRET")
    
    if not stream_api_key or not stream_api_secret:
        logger.error("Stream Chat API credentials are not set")
        raise ValueError("STREAM_API_KEY and STREAM_API_SECRET are required")
    
    stream_client = StreamChat(
        api_key=stream_api_key,
        api_secret=stream_api_secret
    )
    logger.info("Stream Chat client initialized successfully")
except Exception as e:
    logger.error(f"Error initializing Stream Chat client: {str(e)}")
    # Continue with initialization, but Stream Chat calls will fail
    stream_client = None

# Gemini configuration
try:
    gemini_api_key = os.getenv("GEMINI_API_KEY")
    if not gemini_api_key:
        logger.error("GEMINI_API_KEY environment variable is not set")
        raise ValueError("GEMINI_API_KEY is required")
        
    genai.configure(api_key=gemini_api_key)
    gemini_client = genai.GenerativeModel('gemini-2.0-flash')
    logger.info("Gemini API configured successfully")
except Exception as e:
    logger.error(f"Error configuring Gemini API: {str(e)}")
    # Continue with initialization, but Gemini calls will fail

class User(BaseModel):
    id: str
    name: str
    role: str

class Message(BaseModel):
    text: str
    user_id: str

class ChatMessage(BaseModel):
    user_id: str
    message: str
    channel_id: str

@app.post("/users/")
async def create_user(user: User, db: Session = Depends(get_db)):
    try:
        logger.debug(f"Creating user with data: {user.dict()}")
        
        # Create user in Stream.io
        user_data = {
            "id": user.id,
            "name": user.name
        }
        stream_client.upsert_user(user_data)
        
        # Create user in database
        db_user = UserModel(
            id=user.id,
            name=user.name,
            role=user.role,
            goals=[],
            preferences={}
        )
        db.add(db_user)
        db.commit()
        
        return {"message": "User created successfully"}
    except Exception as e:
        logger.error(f"Error creating user: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/chat/token/")
async def get_chat_token(user_id: str, db: Session = Depends(get_db)):
    try:
        logger.info(f"Received token request for user_id: {user_id}")
        
        # Check if user exists, create if not
        user = db.query(UserModel).filter(UserModel.id == user_id).first()
        if not user:
            logger.info(f"User {user_id} not found when getting token, creating automatically")
            # Extract name from user_id (fallback method)
            user_name = user_id.replace('user_', '').replace('_', ' ').title()
            
            # Create user in database
            user = UserModel(
                id=user_id,
                name=user_name,
                role="learner",
                goals=[],
                preferences={}
            )
            db.add(user)
            db.commit()
            
            # Create user in Stream.io
            try:
                if stream_client:
                    user_data = {
                        "id": user_id,
                        "name": user_name
                    }
                    stream_client.upsert_user(user_data)
                    logger.info(f"Successfully created user in Stream: {user_id}")
                else:
                    logger.error("Stream client is not initialized")
                    raise ValueError("Stream client is not initialized")
            except Exception as e:
                logger.error(f"Error creating user in Stream: {str(e)}")
                raise HTTPException(status_code=500, detail=f"Failed to create user in Stream: {str(e)}")
        
        # Generate token
        if not stream_client:
            logger.error("Stream client is not initialized, cannot generate token")
            raise HTTPException(status_code=500, detail="Stream client is not initialized")
        
        logger.info(f"Generating token for user: {user_id}")
        token = stream_client.create_token(user_id)
        logger.info(f"Token generated successfully: {token[:20]}... (masked)")
        
        return {"token": token}
    except Exception as e:
        logger.error(f"Error creating chat token: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/chat/channel/")
async def create_channel(learner_id: str, coach_id: str, db: Session = Depends(get_db)):
    try:
        # Check if learner exists, create if not
        learner = db.query(UserModel).filter(UserModel.id == learner_id).first()
        if not learner:
            logger.info(f"Learner {learner_id} not found when creating channel, creating automatically")
            # Extract name from user_id (fallback method)
            learner_name = learner_id.replace('user_', '').replace('_', ' ').title()
            
            # Create learner in database
            learner = UserModel(
                id=learner_id,
                name=learner_name,
                role="learner",
                goals=[],
                preferences={}
            )
            db.add(learner)
            
            # Create learner in Stream.io
            try:
                if stream_client:
                    user_data = {
                        "id": learner_id,
                        "name": learner_name
                    }
                    stream_client.upsert_user(user_data)
            except Exception as e:
                logger.error(f"Error creating learner in Stream: {str(e)}")
        
        # Check if coach exists, create if not (for AI coach)
        coach = db.query(UserModel).filter(UserModel.id == coach_id).first()
        if not coach and coach_id == "ai_coach_1":
            logger.info("AI coach not found, creating automatically")
            # Create coach in database
            coach = UserModel(
                id=coach_id,
                name="AI Coach",
                role="coach",
                goals=[],
                preferences={}
            )
            db.add(coach)
            
            # Create coach in Stream.io
            try:
                if stream_client:
                    coach_data = {
                        "id": coach_id,
                        "name": "AI Coach",
                        "image": "https://ui-avatars.com/api/?name=AI+Coach&background=007bff&color=fff"
                    }
                    stream_client.upsert_user(coach_data)
            except Exception as e:
                logger.error(f"Error creating coach in Stream: {str(e)}")
        
        db.commit()
        
        channel = stream_client.channel(
            "messaging",
            f"coach-{coach_id}-learner-{learner_id}",
            {
                "members": [learner_id, coach_id],
                "name": "AI Coach Chat"
            }
        )
        channel.create(coach_id)
        return {"channel_id": channel.id}
    except Exception as e:
        logger.error(f"Error creating channel: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/chat/message/")
async def handle_message(message: ChatMessage, db: Session = Depends(get_db)):
    try:
        # Check if user exists, create if not
        user = db.query(UserModel).filter(UserModel.id == message.user_id).first()
        if not user:
            logger.info(f"User {message.user_id} not found, creating automatically")
            # Extract name from user_id (fallback method)
            user_name = message.user_id.replace('user_', '').replace('_', ' ').title()
            
            # Create user in Stream.io
            try:
                if stream_client:
                    user_data = {
                        "id": message.user_id,
                        "name": user_name
                    }
                    stream_client.upsert_user(user_data)
            except Exception as e:
                logger.error(f"Error creating user in Stream: {str(e)}")
            
            # Create user in database
            user = UserModel(
                id=message.user_id,
                name=user_name,
                role="learner",
                goals=[],
                preferences={}
            )
            db.add(user)
            db.commit()
        
        # Get or create conversation
        conversation = db.query(ConversationModel).filter(
            ConversationModel.user_id == message.user_id,
            ConversationModel.channel_id == message.channel_id
        ).first()
        
        if not conversation:
            conversation = ConversationModel(
                user_id=message.user_id,
                channel_id=message.channel_id
            )
            db.add(conversation)
            db.commit()
        
        # Get recent conversation history from current conversation
        recent_messages = db.query(MessageModel).filter(
            MessageModel.conversation_id == conversation.id
        ).order_by(MessageModel.created_at.desc()).limit(5).all()
        
        # Get important messages from past conversations (different channels)
        past_conversations = db.query(ConversationModel).filter(
            ConversationModel.user_id == message.user_id,
            ConversationModel.id != conversation.id
        ).order_by(ConversationModel.updated_at.desc()).limit(3).all()
        
        important_past_messages = []
        for past_conv in past_conversations:
            # Get the last message from each past conversation
            past_msg = db.query(MessageModel).filter(
                MessageModel.conversation_id == past_conv.id,
                MessageModel.role == "assistant"  # Focus on AI responses as they contain summaries
            ).order_by(MessageModel.created_at.desc()).first()
            
            if past_msg:
                important_past_messages.append(past_msg)
        
        # Check for conversation loops
        if len(recent_messages) >= 3:
            # Check for repetitive AI responses
            ai_messages = [msg for msg in recent_messages if msg.role == "assistant"]
            if len(ai_messages) >= 2:
                # Check if the last two AI responses are very similar
                if ai_messages[0].content == ai_messages[1].content or (
                    len(ai_messages[0].content) > 100 and 
                    len(ai_messages[1].content) > 100 and
                    ai_messages[0].content[:100] == ai_messages[1].content[:100]
                ):
                    logger.warning("Detected repetitive AI responses, providing a different response")
                    return {
                        "ai_response": "I notice I've been repeating myself, which isn't helpful. Let me address your question differently. What specific aspect of this topic would you like me to explore further?"
                    }
            
            # Check user message patterns
            user_messages = [msg.content for msg in recent_messages if msg.role == "user"]
            loop_detected = False
            for phrase in ["AI coach", "support you", "dive into", "let's focus", "break the cycle", "What specific", "what you're hoping", "I'm here to help"]:
                matches = sum(1 for msg in user_messages if phrase.lower() in msg.lower())
                if matches >= 2:
                    loop_detected = True
                    break
            
            if loop_detected:
                return {
                    "ai_response": "I've noticed we seem to be in a conversation loop. Let's talk about something specific. Tell me about your day or a specific topic you'd like to learn about. For example, you could say 'I want to learn Python' or 'Help me understand machine learning'."
                }
        
        # Save user message
        user_message = MessageModel(
            conversation_id=conversation.id,
            role="user",
            content=message.message
        )
        db.add(user_message)
        
        # Get recent conversation as simple text
        conversation_history = "\n".join(
            [f"{'User' if msg.role == 'user' else 'AI'}: {msg.content}" for msg in reversed(recent_messages)]
        )

        # Get AI response from Gemini
        try:
            # Build a simple, clear prompt
            simple_prompt = f"""
You are an AI coach having a conversation with a user. Answer their questions directly and helpfully.
    
Previous messages:
{conversation_history}

User's latest question: {message.message}

Important: If the user is asking about a specific topic like 'transformers', 'python', etc., 
provide a direct, informative answer about that topic. Do not repeat an introduction.
"""

            logger.debug(f"Sending simplified prompt to Gemini API")
            response = gemini_client.generate_content(
                contents=simple_prompt,
                generation_config={
                    "max_output_tokens": 1000,
                    "temperature": 0.7,
                    "top_p": 0.9
                }
            )
            ai_response = response.text
            logger.debug(f"Received response from Gemini API: {len(ai_response)} chars")
        except Exception as e:
            logger.error(f"Error from Gemini API: {str(e)}")
            # Provide a fallback response
            ai_response = "I'm having trouble processing your request right now. Could you try asking in a different way?"

        # Save AI response
        ai_message = MessageModel(
            conversation_id=conversation.id,
            role="assistant",
            content=ai_response
        )
        db.add(ai_message)
        db.commit()
        
        return {"ai_response": ai_response}
    except Exception as e:
        logger.error(f"Error generating AI response: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/memory/")
async def update_user_memory(user_id: str, memory_data: dict, db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    try:
        if "goals" in memory_data:
            # Handle both SQLite and PostgreSQL
            if isinstance(memory_data["goals"], list):
                user.goals = memory_data["goals"]
            else:
                logger.warning(f"Invalid goals format: {memory_data['goals']}")
                
        if "preferences" in memory_data:
            # Handle both SQLite and PostgreSQL
            if isinstance(memory_data["preferences"], dict):
                if is_sqlite:
                    # For SQLite, we need to replace the entire dictionary
                    current_prefs = user.preferences if user.preferences else {}
                    updated_prefs = {**current_prefs, **memory_data["preferences"]}
                    user.preferences = updated_prefs
                else:
                    # For PostgreSQL, update method works
                    if not user.preferences:
                        user.preferences = {}
                    user.preferences.update(memory_data["preferences"])
            else:
                logger.warning(f"Invalid preferences format: {memory_data['preferences']}")
        
        db.commit()
        return {"message": "Memory updated successfully"}
    except Exception as e:
        logger.error(f"Error updating memory: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/memory/{user_id}")
async def get_user_memory(user_id: str, db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Safely get the JSON fields
    goals = []
    preferences = {}
    
    try:
        if user.goals:
            goals = user.goals
    except Exception as e:
        logger.error(f"Error retrieving goals: {str(e)}")
        
    try:
        if user.preferences:
            preferences = user.preferences
    except Exception as e:
        logger.error(f"Error retrieving preferences: {str(e)}")
    
    # Get all conversations for the user
    conversations = db.query(ConversationModel).filter(
        ConversationModel.user_id == user_id
    ).all()
    
    # Get messages for each conversation
    conversation_history = []
    for conv in conversations:
        try:
            messages = db.query(MessageModel).filter(
                MessageModel.conversation_id == conv.id
            ).order_by(MessageModel.created_at).all()
            
            conversation_history.append({
                "channel_id": conv.channel_id,
                "messages": [{"role": msg.role, "content": msg.content} for msg in messages]
            })
        except Exception as e:
            logger.error(f"Error retrieving messages for conversation {conv.id}: {str(e)}")
    
    return {
        "goals": goals,
        "preferences": preferences,
        "conversation_history": conversation_history
    }

@app.get("/favicon.ico")
async def favicon():
    return {"status": "No favicon available"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
    
    