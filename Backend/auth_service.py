"""
Authentication Service
Handles login and authentication using MongoDB
"""

from pymongo import MongoClient
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
import os

# JWT Configuration
SECRET_KEY = "your-secret-key-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24 hours

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# MongoDB Connection
def get_mongo_client():
    """Get MongoDB client"""
    try:
        mongo_uri = os.getenv("MONGODB_URI")
        client = MongoClient(mongo_uri)
        # Test connection
        client.admin.command('ping')
        return client
    except Exception as e:
        print(f"MongoDB connection error: {e}")
        return None

def get_database():
    """Get MongoDB database"""
    client = get_mongo_client()
    if client:
        db_name = os.getenv("MONGODB_NAME", "Duroflex")
        return client[db_name]
    return None

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Hash password"""
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    """Create JWT token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> dict:
    """Verify JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
        return {"email": email}
    except JWTError:
        return None

def authenticate_admin(email: str, password: str) -> bool:
    """
    Authenticate admin user from MongoDB
    """
    try:
        db = get_database()
        if db is None:
            print("Could not connect to MongoDB")
            return False
        
        admins_collection = db["admins"]
        
        # Find admin by email
        admin = admins_collection.find_one({"email": email})
        if not admin:
            return False
        
        # Verify password
        return verify_password(password, admin["password"])
    except Exception as e:
        print(f"Authentication error: {e}")
        return False

def create_admin_in_db():
    """
    Create default admin user in MongoDB if it doesn't exist
    """
    try:
        db = get_database()
        if db is None:
            print("Could not connect to MongoDB")
            return False
        
        admins_collection = db["admins"]
        
        # Check if admin exists
        admin = admins_collection.find_one({"email": "admin@duroflex.com"})
        if admin:
            print("Admin user already exists")
            return True
        
        # Create admin with hashed password
        admin_data = {
            "email": "admin@duroflex.com",
            "password": get_password_hash("duroflex123"),
            "created_at": datetime.utcnow(),
            "role": "admin",
            "name": "Admin User"
        }
        admins_collection.insert_one(admin_data)
        print("✓ Admin user created in MongoDB successfully")
        return True
    except Exception as e:
        print(f"Error creating admin: {e}")
        return False
