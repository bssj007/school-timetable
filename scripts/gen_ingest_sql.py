import json
import sqlite3

# Load JSON
with open('diet_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# SQL construction
sql_list = []
for item in data:
    if 'dietSeq' in item and item['dietSeq'] != 'holiday':
        date = item['dietDate']
        content = item['dietCn']
        calories = item.get('dietCal', '')
        origins = item.get('orgplce', '')
        meal_type = item.get('dietTy', '중식')
        sys_id = item.get('sysId', 'bssj-h')
        
        # Escape single quotes in content
        content = content.replace("'", "''")
        origins = origins.replace("'", "''")
        
        sql = f"INSERT INTO meals (date, content, calories, origins, type, sysId) VALUES ('{date}', '{content}', '{calories}', '{origins}', '{meal_type}', '{sys_id}');"
        sql_list.append(sql)

# Write to file
with open('ingest_meals.sql', 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql_list))

print(f"Generated {len(sql_list)} insert statements.")
