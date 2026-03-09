import sqlite3
import json

db_path = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/cce97e92e1aaaaedac243843122505544748b1a1d204517ddec7a048317a843a.sqlite"
try:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Check student_profiles
    cursor.execute("SELECT grade, classNum, studentNumber, instructionDismissed, updatedAt FROM student_profiles LIMIT 5;")
    students = [dict(row) for row in cursor.fetchall()]
    print("student_profiles:")
    print(json.dumps(students, indent=2))
    
    # Check ip_profiles
    cursor.execute("SELECT ip, instructionDismissed, lastAccess FROM ip_profiles LIMIT 5;")
    ips = [dict(row) for row in cursor.fetchall()]
    print("\nip_profiles:")
    print(json.dumps(ips, indent=2))
    
    conn.close()
except Exception as e:
    print(f"Error reading DB: {e}")
