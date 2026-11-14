import json
from typing import List
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.page_connections = {
            "agent": [],
            "campaign": []
        }
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket, page: str = "default"):
        await websocket.accept()

        if page not in self.page_connections:
            self.page_connections[page] = []

        self.page_connections[page].append(websocket)
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def send_personal_message(self, message: dict, websocket: WebSocket):
        await websocket.send_text(json.dumps(message))

    async def broadcast(self, message: dict):
        for connection in list(self.active_connections):
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                self.disconnect(connection)
            
    async def broadcast_to_page(self, page: str, message: dict):
        connections = self.page_connections.get(page, [])

        for connection in list(connections):
            try:
                await connection.send_text(json.dumps(message))
            except Exception:
                self.disconnect(connection)
                if connection in connections:
                    connections.remove(connection)


manager = ConnectionManager()
