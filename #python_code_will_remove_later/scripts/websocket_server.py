import asyncio
import websockets
import threading

CAT = "[WebSocket Server]"
MAX_SIZE = 100 * 1024 * 1024  # 100 MB

connected_clients = set()

async def handle_connection(websocket):
    connected_clients.add(websocket)
    try:
        async for message in websocket:
            #print(f"{CAT}Received message: {len(message)} bytes")
            if connected_clients:
                tasks = [client.send(message) for client in connected_clients if client != websocket]
                if tasks:
                    await asyncio.gather(*tasks, return_exceptions=True)
    except websockets.exceptions.ConnectionClosed:
        #print("{CAT} client disconnected")
        pass
    finally:
        connected_clients.discard(websocket)

async def start_websocket_server(host="127.0.0.1", port=47850, max_size=MAX_SIZE):
    server = await websockets.serve(handle_connection, host, port, max_size=max_size)
    print(f"{CAT} running on ws://{host}:{port} with max_size={max_size/1024/1024} MB")
    return server

def run_websocket_server_in_thread(host="127.0.0.1", port=47850):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    stop_event = threading.Event()

    def run_loop():
        server = loop.run_until_complete(start_websocket_server(host, port))
        try:
            loop.run_forever()
        except Exception as e:
            print(f"{CAT}loop error: {str(e)}")
        finally:
            server.close()
            loop.run_until_complete(server.wait_closed())
            loop.run_until_complete(loop.shutdown_asyncgens())
            loop.close()
            print(f"{CAT}loop stopped")

    thread = threading.Thread(target=run_loop)  
    thread.start()

    def stop_server():
        print(f"{CAT}Stopping WebSocket server")
        stop_event.set()
        loop.call_soon_threadsafe(loop.stop)
        thread.join(timeout=2.0)
        if thread.is_alive():
            print(f"{CAT}thread did not terminate gracefully")
        print(f"{CAT}fully stopped")

    return thread, stop_server
