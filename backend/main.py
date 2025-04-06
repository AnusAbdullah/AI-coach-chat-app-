from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from stream_chat import StreamChat
from pydantic import BaseModel
from typing import Optional, List
import os
from dotenv import load_dotenv
import logging
import google.generativeai as genai
import re
# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

load_dotenv(dotenv_path=".env.production")

app = FastAPI()

# CORS middleware configuration
# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize StreamChat client
stream_client = StreamChat(
    api_key=os.getenv("STREAM_API_KEY"),
    api_secret=os.getenv("STREAM_API_SECRET")
)

# Add a root endpoint for health checks
@app.get("/")
async def root():
    return {"status": "OK", "message": "AI Coach Backend is running"}

# Gemini configuration
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
gemini_client = genai.GenerativeModel('gemini-2.0-flash')  # Use a valid Gemini model

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
        
        if len(last_few_messages) >= 4:
            user_messages = [msg["content"] for msg in last_few_messages if msg["role"] == "user"]
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
        
        # Update conversation history
        user_data["conversation_history"].append({
            "role": "user",
            "content": message.message
        })

        system_prompt = """
        You are an AI coach engaging in a one-on-one conversation with a learner. 
        Your role is to be supportive, insightful, and goal-oriented—helping the learner grow personally and professionally through thoughtful dialogue.

        🧠 Tone & Communication Style:
        - Be friendly, empathetic, and motivating.
        - Keep responses concise but impactful—each message should meaningfully advance the learner’s journey.
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
        """


        # Combine system prompt and recent conversation history into a single string
        conversation = system_prompt + "\n\n" + "\n".join(
            [f"{msg['role']}: {msg['content']}" for msg in user_data["conversation_history"][-6:]]
        )

        # Get AI response from Gemini
        response = gemini_client.generate_content(
            contents=conversation,
            generation_config={
                "max_output_tokens": 300,
                "temperature": 0.7,
                "top_p": 0.9
            }
        )

        ai_response = response.text

        # Update conversation history with AI's response
        user_data["conversation_history"].append({
            "role": "assistant",
            "content": ai_response
        })

        # Update user memory
        user_memory[message.user_id] = user_data
        
        pattern = r'(\s|\b)\*([^*]+?)\*(\s|\b)'
        
        ai_response = re.sub(pattern, r'\1<b>\2</b>\3', ai_response)
        # Convert bullet points: "* sentence" → "- sentence"
        ai_response = re.sub(r'(?<=\n|^)\* ', '- ', ai_response)
        # Optional: Clean up space after bullet point replacements
        ai_response = re.sub(r'-\s{2,}', '- ', ai_response)
        
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


@app.get("/favicon.ico")
async def favicon():
    return {"status": "No favicon available"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
    
    