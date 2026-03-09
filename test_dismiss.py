import requests
import json
import time

API_URL = "http://localhost:3000/api/dismiss-instruction"

payload = {
    "grade": "1",
    "classNum": "1",
    "studentNumber": "1"
}

print("1. Sending POST request to dismiss...")
res_post = requests.post(API_URL, json=payload)
print(f"POST status: {res_post.status_code}")
print(f"POST response: {res_post.text}")

print("\n2. Sending GET request to check status...")
params = {
    "grade": "1",
    "classNum": "1",
    "studentNumber": "1"
}
res_get = requests.get(API_URL, params=params)
print(f"GET status: {res_get.status_code}")
print(f"GET response: {res_get.text}")
