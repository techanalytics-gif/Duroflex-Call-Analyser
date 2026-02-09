"""
Script to Create Multiple Admin Users in MongoDB
Run this script to create multiple admin accounts at once
"""

from pymongo import MongoClient
from datetime import datetime
from passlib.context import CryptContext
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    """Hash password using bcrypt"""
    return pwd_context.hash(password)

def get_database():
    """Get MongoDB database connection"""
    try:
        mongo_uri = os.getenv("MONGODB_URI")
        if not mongo_uri:
            print("❌ Error: MONGODB_URI not found in .env file")
            return None
        
        client = MongoClient(mongo_uri)
        # Test connection
        client.admin.command('ping')
        print("✓ Connected to MongoDB successfully")
        
        db_name = os.getenv("MONGODB_NAME", "Duroflex")
        return client[db_name]
    except Exception as e:
        print(f"❌ MongoDB connection error: {e}")
        return None

def create_admin_accounts(admin_credentials):
    """
    Create multiple admin accounts in MongoDB
    
    Args:
        admin_credentials: List of dictionaries with 'email', 'password', and optional 'name'
    """
    db = get_database()
    if db is None:
        print("Failed to connect to database. Exiting...")
        return
    
    admins_collection = db["admins"]
    
    created_count = 0
    skipped_count = 0
    failed_count = 0
    
    print(f"\n{'='*60}")
    print(f"Creating {len(admin_credentials)} admin account(s)...")
    print(f"{'='*60}\n")
    
    for idx, admin in enumerate(admin_credentials, 1):
        email = admin.get('email', '').strip()
        password = admin.get('password', '').strip()
        name = admin.get('name', '').strip() or f"Admin User {idx}"
        
        if not email or not password:
            print(f"[{idx}] ❌ FAILED: {email or 'No email'} - Email and password are required")
            failed_count += 1
            continue
        
        try:
            # Check if admin already exists
            existing_admin = admins_collection.find_one({"email": email})
            if existing_admin:
                print(f"[{idx}] ⚠️  SKIPPED: {email} - Already exists")
                skipped_count += 1
                continue
            
            # Create admin with hashed password
            admin_data = {
                "email": email,
                "password": get_password_hash(password),
                "created_at": datetime.utcnow(),
                "role": "admin",
                "name": name
            }
            
            result = admins_collection.insert_one(admin_data)
            if result.inserted_id:
                print(f"[{idx}] ✓ CREATED: {email} (Name: {name})")
                created_count += 1
            else:
                print(f"[{idx}] ❌ FAILED: {email} - Insert failed")
                failed_count += 1
                
        except Exception as e:
            print(f"[{idx}] ❌ FAILED: {email} - Error: {str(e)}")
            failed_count += 1
    
    # Summary
    print(f"\n{'='*60}")
    print(f"SUMMARY:")
    print(f"  ✓ Created: {created_count}")
    print(f"  ⚠️  Skipped (already exists): {skipped_count}")
    print(f"  ❌ Failed: {failed_count}")
    print(f"  📊 Total processed: {len(admin_credentials)}")
    print(f"{'='*60}\n")

def main():
    """
    Main function - Add your admin credentials here
    """
    
  
    
    admin_credentials = [
        # Append your admin credentials here as dictionaries and to ingest multiple admins at once run this script as:
        # cd Backend -> python create_admins.py 
        # {
        #     'email': 'example@example.com',
        #     'password': 'examplepassword',
        #     'name': 'Admin User'
        # },
    ]

    
    # ============================================================
    # Validate inputs
    if not admin_credentials:
        print("❌ Error: No admin credentials provided!")
        print("Please add admin credentials in the admin_credentials list above.")
        return
    
    # Confirm before creating
    print(f"\n⚠️  You are about to create {len(admin_credentials)} admin account(s):")
    for admin in admin_credentials:
        print(f"   - {admin.get('email', 'No email')} ({admin.get('name', 'No name')})")
    
    confirm = input("\nProceed? (yes/no): ").strip().lower()
    if confirm not in ['yes', 'y']:
        print("❌ Operation cancelled by user.")
        return
    
    # Create admin accounts
    create_admin_accounts(admin_credentials)

if __name__ == "__main__":
    main()
