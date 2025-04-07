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
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import sessionmaker, Session, declarative_base
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

load_dotenv(dotenv_path=".env.production")

# Database setup
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")
if SQLALCHEMY_DATABASE_URL and SQLALCHEMY_DATABASE_URL.startswith("postgres://"):
    SQLALCHEMY_DATABASE_URL = SQLALCHEMY_DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Database Models
class UserModel(Base):
    __tablename__ = "users"
    
    id = Column(String, primary_key=True)
    name = Column(String)
    role = Column(String)
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
stream_client = StreamChat(
    api_key=os.getenv("STREAM_API_KEY"),
    api_secret=os.getenv("STREAM_API_SECRET")
)

# Gemini configuration
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
gemini_client = genai.GenerativeModel('gemini-2.0-flash')

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
async def get_chat_token(user_id: str):
    try:
        token = stream_client.create_token(user_id)
        return {"token": token}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/chat/channel/")
async def create_channel(learner_id: str, coach_id: str):
    try:
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
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/chat/message/")
async def handle_message(message: ChatMessage, db: Session = Depends(get_db)):
    try:
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
        if len(recent_messages) >= 4:
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
        
        # Get user's goals and preferences
        user = db.query(UserModel).filter(UserModel.id == message.user_id).first()
        user_context = {
            "goals": user.goals if user else [],
            "preferences": user.preferences if user else {}
        }
        
        system_prompt = f"""
        You are an AI coach engaging in a one-on-one conversation with a learner. 
        Your role is to be supportive, insightful, and goal-oriented—helping the learner grow personally and professionally through thoughtful dialogue.

        User Context:
        Goals: {user_context['goals']}
        Preferences: {user_context['preferences']}

        Previous Conversation Context: 
        {' '.join([f"In a previous session: {msg.content}" for msg in important_past_messages])}

        🧠 Tone & Communication Style:
        - Be friendly, empathetic, and motivating.
        - Keep responses concise but impactful—each message should meaningfully advance the learner's journey.
        - When offering advice, asking questions, or giving feedback, explain your reasoning clearly and thoughtfully.

        🎯 Core Objectives:

        1. **Guide the learner toward their goals** by:
        - Asking open-ended, reflective questions.
        - Providing constructive insights and practical feedback.
        - Encouraging self-awareness, exploration, and action.

        2. **Stay focused on the learner**:
        - Personalize responses based on their input and context.
        - Prioritize clarity, relevance, and depth over generic advice.
        - Prompt them to share their thoughts, experiences, and aspirations.

        3. **Handle role reversal (when the learner mimics an AI)**:
        - If the learner starts responding like an AI (e.g., overly formal, generic, or detached),
            gently bring them back to a human-centered space by:
            - Encouraging them to express something personal or specific.
            - Reminding them this is their space for growth—not a role-play simulation.

        4. **Build on past conversations**:
        - Reference previous discussions when relevant.
        - Show continuity in your coaching approach.
            
        Response should in proper format.
        """

        # Combine system prompt and recent conversation history
        conversation_history = "\n".join(
            [f"{msg.role}: {msg.content}" for msg in reversed(recent_messages)]
        )
        full_prompt = system_prompt + "\n\n" + conversation_history

        # Get AI response from Gemini
        response = gemini_client.generate_content(
            contents=full_prompt,
            generation_config={
                "max_output_tokens": 1000,
                "temperature": 0.7,
                "top_p": 0.9
            }
        )

        ai_response = response.text

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
            user.goals = memory_data["goals"]
        if "preferences" in memory_data:
            user.preferences.update(memory_data["preferences"])
        
        db.commit()
        return {"message": "Memory updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/memory/{user_id}")
async def get_user_memory(user_id: str, db: Session = Depends(get_db)):
    user = db.query(UserModel).filter(UserModel.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Get all conversations for the user
    conversations = db.query(ConversationModel).filter(
        ConversationModel.user_id == user_id
    ).all()
    
    # Get messages for each conversation
    conversation_history = []
    for conv in conversations:
        messages = db.query(MessageModel).filter(
            MessageModel.conversation_id == conv.id
        ).order_by(MessageModel.created_at).all()
        
        conversation_history.append({
            "channel_id": conv.channel_id,
            "messages": [{"role": msg.role, "content": msg.content} for msg in messages]
        })
    
    return {
        "goals": user.goals,
        "preferences": user.preferences,
        "conversation_history": conversation_history
    }

@app.get("/favicon.ico")
async def favicon():
    return {"status": "No favicon available"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
    
    