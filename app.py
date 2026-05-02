from flask import Flask, request, jsonify, render_template
from arrays import Groups
import random

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/game-data")
def game_data():
    groups = Groups.all()
    return jsonify(groups)

@app.route("/game-event", methods=["POST"])
def game_event():
    data = request.get_json()
    event   = data.get("event")
    group   = data.get("group")
    members = data.get("members")
    print(f"Event: {event} | Group: {group} | Members: {members}")
    return jsonify({"valid": True})

if __name__ == "__main__":
    app.run(debug=True)