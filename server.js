import os
import firebase_admin
from firebase_admin import credentials, db
from flask import Flask, request, jsonify
import noblox
import json

# Initialize Flask app
app = Flask(__name__)

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# Load Firebase credentials
cred = credentials.Certificate('path/to/firebaseConfig.json')
firebase_admin.initialize_app(cred, {
    'databaseURL': 'https://your-database-url.firebaseio.com/'
})

# Group ID and cookie
group_id = 15049970
cookie = os.getenv("ROBLOSECURITY")

# Honor ranks with corresponding role IDs
honor_ranks = {
    0: 102794177,
    1: 84972954,
    5: 85150886,
    10: 89383841,
    15: 85006910,
    20: 85006940,
    30: 84972953,
    40: 90562516,
    50: 91138752,
    70: 87676269,
    90: 85006963,
    120: 102794281,
    150: 89896768,
    6969: 98990029,
}

# Endpoint to update honor and timeSpent, optionally update rank if needed
@app.route("/ranker", methods=["POST"])
def ranker():
    data = request.get_json()
    userid = data.get('userid')
    honor = data.get('honor')
    time_spent = data.get('timeSpent')

    # Validate input
    if not all([userid, honor, time_spent]) or not all(isinstance(i, int) for i in [userid, honor, time_spent]):
        return jsonify({"error": "Invalid input."}), 400

    # Determine the new role ID based on honor
    new_role_id = None
    for threshold, id in sorted(honor_ranks.items(), reverse=True):
        if honor >= threshold:
            new_role_id = id
            break

    if not new_role_id:
        return jsonify({"error": "Invalid honor level."}), 400

    try:
        # Store the updated player data in Firebase
        ref = db.reference(f'players/{userid}')
        ref.set({'honor': honor, 'timeSpent': time_spent})

        # Set Roblox cookie
        noblox.set_cookie(cookie)

        # Fetch the current role ID
        current_role_id = noblox.get_rank_in_group(group_id, userid)

        # Update rank only if it's different from the new_role_id
        if current_role_id != new_role_id:
            noblox.set_rank(group_id, userid, new_role_id)

        return jsonify({"message": "Honor and time spent updated successfully!"})
    except Exception as err:
        print(f"Failed to update player data: {err}")
        return jsonify({"error": "Failed to update player data."}), 500

# Endpoint to get all players
@app.route("/players", methods=["GET"])
def get_players():
    try:
        # Retrieve all player data from Firebase
        ref = db.reference('players')
        data = ref.get()

        if data:
            players = [{'userid': userid, 'honor': player.get('honor', 0), 'timeSpent': player.get('timeSpent', 0)} for userid, player in data.items()]
            return jsonify({"players": players})
        else:
            return jsonify({"error": "No players found."}), 404
    except Exception as err:
        print(f"Failed to retrieve players data: {err}")
        return jsonify({"error": "Failed to retrieve players data."}), 500

# Endpoint to get player honor and time spent
@app.route("/ranker/<int:userid>", methods=["GET"])
def get_ranker(userid):
    try:
        # Retrieve player data from Firebase
        ref = db.reference(f'players/{userid}')
        data = ref.get()

        if data:
            noblox.set_cookie(cookie)

            # Fetch player info
            player_info = noblox.get_player_info(userid)

            # Fetch the user's role ID
            user_groups = noblox.get_rank_in_group(group_id, userid)
            role_id = user_groups

            # Fetch role name
            role = noblox.get_role(group_id, role_id)

            # Send the player data with honor, timeSpent, and roleName
            return jsonify({
                "honor": data['honor'],
                "timeSpent": data.get('timeSpent', 0),
                "roleName": role['name']
            })
        else:
            return jsonify({"error": "Player not found."}), 404
    except Exception as err:
        print(f"Failed to retrieve player data: {err}")
        return jsonify({"error": "Failed to retrieve player data."}), 500

# ServerScript in server.js

@app.route("/updateHonor", methods=["POST"])
def update_honor():
    data = request.get_json()
    userid = data.get('userid')
    elapsed_minutes = data.get('elapsedMinutes')

    # Validate input
    if not all([userid, elapsed_minutes]) or not all(isinstance(i, int) for i in [userid, elapsed_minutes]):
        return jsonify({"error": "Invalid input."}), 400

    try:
        # Retrieve current player data from Firebase
        ref = db.reference(f'players/{userid}')
        data = ref.get()

        if not data:
            return jsonify({"error": "Player not found."}), 404

        honor = data.get('honor', 0)
        time_spent = data.get('timeSpent', 0) + elapsed_minutes

        # Increment honor every 30 minutes
        honor_increment = time_spent // 30
        honor += honor_increment

        # Update player data in Firebase
        ref.set({'honor': honor, 'timeSpent': time_spent})

        # Determine the new role ID based on honor
        new_role_id = None
        for threshold, id in sorted(honor_ranks.items(), reverse=True):
            if honor >= threshold:
                new_role_id = id
                break

        if not new_role_id:
            return jsonify({"error": "Invalid honor level."}), 400

        # Set Roblox cookie
        noblox.set_cookie(cookie)

        # Fetch the current role ID
        current_role_id = noblox.get_rank_in_group(group_id, userid)

        # Update rank only if it's different from the new_role_id
        if current_role_id != new_role_id:
            noblox.set_rank(group_id, userid, new_role_id)

        return jsonify({"message": "Honor and time spent updated successfully!"})
    except Exception as err:
        print(f"Failed to update player data: {err}")
        return jsonify({"error": "Failed to update player data."}), 500

# Test endpoint
@app.route("/test", methods=["POST"])
def test():
    print("Test request received")
    return jsonify({"message": "Test request processed"})

# Start the server
if __name__ == "__main__":
    port = int(os.getenv("PORT", 3000))
    app.run(host='0.0.0.0', port=port)
