# 👥 ChatBranch User Management Scripts

This directory contains utility scripts for managing ChatBranch users.

## 📋 Available Scripts

### 1. **add_user.py** - Create New Users
```bash
# Create a regular user
python add_user.py test@123 test123

# Create an admin user
python add_user.py admin@123 admin123 --admin

# Create a user with custom name
python add_user.py jane@example.com password123 --name "Jane Smith"
```

### 2. **remove_user.py** - Delete Users
```bash
# Remove user by email
python remove_user.py test@123

# Remove user by ID
python remove_user.py user-uuid-here

# List all users
python remove_user.py --list

# Force removal without confirmation
python remove_user.py test@123 --force
```

## 🚀 Usage Instructions

### Prerequisites
1. **PostgreSQL running** with ChatBranch database set up
2. **Backend environment** configured (`.env` file exists)
3. **Run from scripts directory**:
   ```bash
   cd "c:\Users\theed\Documents\Research and Papers\ChatBranch\scripts"
   ```

### Quick Commands
```bash
# Navigate to scripts directory
cd "c:\Users\theed\Documents\Research and Papers\ChatBranch\scripts"

# Create test users
python add_user.py admin@123 admin123 --admin
python add_user.py test@123 test123

# List all users
python remove_user.py --list

# Remove a user
python remove_user.py test@123
```

## 🔒 Security Notes

- **add_user.py**: Automatically hashes passwords using bcrypt
- **remove_user.py**: Cascades deletion (removes ALL user data)
- Both scripts require database connection to PostgreSQL
- Use `--force` flag carefully - no undo for deletions!

## 🛠️ Technical Details

- **Database**: PostgreSQL with cascading foreign keys
- **Authentication**: bcrypt password hashing
- **User Roles**: `admin` or `tester`
- **Data Isolation**: Each user's data is completely isolated

## 📁 File Structure
```
scripts/
├── add_user.py      # Create users
├── remove_user.py   # Delete users
└── README.md        # This file
```

## 🎯 Example Workflow

```bash
# 1. Create admin and test users
python add_user.py admin@123 admin123 --admin
python add_user.py alice@example.com alice123
python add_user.py bob@example.com bob123

# 2. List all users to verify
python remove_user.py --list

# 3. Remove a user if needed
python remove_user.py alice@example.com

# 4. Verify deletion
python remove_user.py --list
```

## ⚠️ Important Notes

1. **Backup First**: Consider backing up the database before bulk operations
2. **Test Environment**: Test scripts in development before production use
3. **Admin Users**: Be careful not to delete the last admin user
4. **Case Sensitive**: Email addresses are case-sensitive in searches
