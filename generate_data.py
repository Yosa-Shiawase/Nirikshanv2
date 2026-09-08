import json
import random
from datetime import datetime, timedelta

# Urban cash-out hotspots (Delhi NCR & Mumbai clusters)
ATM_CENTROIDS = [
    {"id": "ATM-DL-01", "name": "SBI ATM - Kalkaji B-Block, New Delhi", "lat": 28.5355, "lon": 77.2410, "base_flow": 380000},
    {"id": "ATM-DL-02", "name": "HDFC 24x7 - Nehru Place Outer, New Delhi", "lat": 28.5490, "lon": 77.2520, "base_flow": 450000},
    {"id": "ATM-DL-03", "name": "PNB Terminal - Vikas Marg, Laxmi Nagar", "lat": 28.6310, "lon": 77.2890, "base_flow": 210000},
    {"id": "ATM-DL-04", "name": "ICICI E-Lobby - Sector 18, Noida", "lat": 28.5705, "lon": 77.3210, "base_flow": 520000},
    {"id": "ATM-DL-05", "name": "Canara ATM - Pari Chowk Metro, Gr. Noida", "lat": 28.4682, "lon": 77.5108, "base_flow": 310000},
    {"id": "ATM-MH-01", "name": "Axis Bank - Bandra West Linking Rd, Mumbai", "lat": 19.0600, "lon": 72.8339, "base_flow": 640000},
    {"id": "ATM-MH-02", "name": "SBI Offsite - Andheri East Station, Mumbai", "lat": 19.1197, "lon": 72.8464, "base_flow": 490000},
    {"id": "ATM-MH-03", "name": "Bank of Baroda - Thane West Station Rd", "lat": 19.1860, "lon": 72.9759, "base_flow": 280000},
    {"id": "ATM-KA-01", "name": "SBI E-Corner - Koramangala 5th Block, Bengaluru", "lat": 12.9352, "lon": 77.6245, "base_flow": 420000},
    {"id": "ATM-UP-01", "name": "HDFC ATM - Hazratganj Main Market, Lucknow", "lat": 26.8467, "lon": 80.9462, "base_flow": 260000}
]

def generate_dataset(num_complaints=300):
    now = datetime.now()
    complaints = []
    
    for i in range(1, num_complaints + 1):
        target = random.choice(ATM_CENTROIDS)
        amount = round(random.lognormvariate(10.2, 0.8), -2)
        amount = min(max(amount, 5000), 500000)
        
        elapsed_mins = random.randint(15, 300)
        c_time = now - timedelta(minutes=elapsed_mins)
        
        complaints.append({
            "ack_no": f"NCRP-2026-{100000 + i}",
            "timestamp": c_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "disputed_amount_inr": amount,
            "target_terminal_id": target["id"],
            "victim_vpa": f"user_{random.randint(100, 999)}@okbank",
            "layer_1_mule": f"mule_tier1_{random.randint(10, 80)}@paytm",
            "layer_2_mule": f"runner_acc_{random.randint(1000, 9999)}",
            "hop_count": random.choices([1, 2, 3, 4], weights=[0.45, 0.35, 0.15, 0.05])[0]
        })
        
    return {"terminals": ATM_CENTROIDS, "complaints": complaints}

if __name__ == "__main__":
    data = generate_dataset()
    with open("public/seed_data.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"[✓] Successfully generated {len(data['complaints'])} synthetic NCRP records in public/seed_data.json")

