from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from stream_chat import StreamChat
from pydantic import BaseModel
from typing import Optional, List
import os
from dotenv import load_dotenv
import logging
from openai import OpenAI

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

load_dotenv()

app = FastAPI()

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://ai-coach-app.vercel.app",  # Production frontend URL
        "http://localhost:3000",  # Local development
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Stream.io configuration
stream_client = StreamChat(
    api_key=os.getenv("STREAM_API_KEY"),
    api_secret=os.getenv("STREAM_API_SECRET")
)

# OpenAI configuration
openai_client = OpenAI()

class User(BaseModel):
    id: str
    name: str
    role: str  # "learner" or "coach"

class Message(BaseModel):
    text: str
    user_id: str

class ChatMessage(BaseModel):
    user_id: str
    message: str
    channel_id: str

# In-memory storage for user data (replace with database in production)
user_memory = {}

@app.post("/users/")
async def create_user(user: User):
    try:
        logger.debug(f"Creating user with data: {user.dict()}")
        logger.debug(f"Stream.io API Key: {os.getenv('STREAM_API_KEY')}")
        
        # Create user in Stream.io (without role as it's not a predefined Stream.io role)
        user_data = {
            "id": user.id,
            "name": user.name
        }
        logger.debug(f"Attempting to upsert user with data: {user_data}")
        
        stream_client.upsert_user(user_data)
        
        # Initialize user memory
        user_memory[user.id] = {
            "goals": [],
            "preferences": {},
            "conversation_history": [],
            "role": user.role  # Store role in our local memory instead
        }
        
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
async def handle_message(message: ChatMessage):
    try:
        # Get user's conversation history
        user_data = user_memory.get(message.user_id, {
            "conversation_history": [],
            "goals": [],
            "preferences": {}
        })
        
        # Check for conversation loops
        last_few_messages = user_data["conversation_history"][-6:] if len(user_data["conversation_history"]) >= 6 else user_data["conversation_history"]
        
        # If we have enough messages to check for loops
        if len(last_few_messages) >= 4:
            # Check for repeating patterns in recent messages
            user_messages = [msg["content"] for msg in last_few_messages if msg["role"] == "user"]
            ai_messages = [msg["content"] for msg in last_few_messages if msg["role"] == "assistant"]
            
            # Check if there's a repeating pattern in user messages (indicates a loop)
            loop_detected = False
            for phrase in ["AI coach", "support you", "dive into", "let's focus", "break the cycle", "What specific", "what you're hoping", "I'm here to help"]:
                matches = sum(1 for msg in user_messages if phrase.lower() in msg.lower())
                if matches >= 2:
                    loop_detected = True
                    break
            
            if loop_detected:
                # Return a special loop-breaking message
                return {
                    "ai_response": "I've noticed we seem to be in a conversation loop. Let's talk about something specific. Tell me about your day or a specific topic you'd like to learn about. For example, you could say 'I want to learn Python' or 'Help me understand machine learning'."
                }
        
        # Update conversation history
        user_data["conversation_history"].append({
            "role": "user",
            "content": message.message
        })

        # Prepare the conversation context
        system_prompt = """You are an AI coach having a 1:1 conversation with a learner. 
        Your role is to be supportive, insightful, and help the learner achieve their goals. 
        Ask thoughtful questions, provide constructive feedback, and guide them towards their objectives.
        Keep your responses concise, friendly, and focused on the learner's needs.
        
        If the user seems to be repeating AI-like responses, gently guide them to share something about themselves instead of trying to act as an AI coach."""

        messages = [
            {"role": "system", "content": system_prompt},
            *user_data["conversation_history"][-6:]  # Include last 6 messages for context
        ]

        # Get AI response from OpenAI
        response = openai_client.chat.completions.create(
            model="gpt-4o-mini",  # Using a smaller model to reduce latency
            messages=messages,
            max_tokens=300,
            temperature=0.7,
            top_p=0.9
        )

        ai_response = response.choices[0].message.content

        # Update conversation history with AI's response
        user_data["conversation_history"].append({
            "role": "assistant",
            "content": ai_response
        })

        # Update user memory
        user_memory[message.user_id] = user_data

        return {"ai_response": ai_response}
    except Exception as e:
        logger.error(f"Error generating AI response: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/memory/")
async def update_user_memory(user_id: str, memory_data: dict):
    if user_id not in user_memory:
        raise HTTPException(status_code=404, detail="User not found")
    
    try:
        user_memory[user_id].update(memory_data)
        return {"message": "Memory updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/memory/{user_id}")
async def get_user_memory(user_id: str):
    if user_id not in user_memory:
        raise HTTPException(status_code=404, detail="User not found")
    return user_memory[user_id]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000) 