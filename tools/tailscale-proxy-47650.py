import asyncio
import sys
import logging
import time

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)

LISTEN_HOSTS = ["100.122.90.30", "0.0.0.0"]
LISTEN_PORT = 47650
TARGET_HOST = "127.0.0.1"
TARGET_PORT = 47650

async def pipe(reader, writer):
    try:
        while not reader.at_eof():
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except (asyncio.CancelledError, ConnectionResetError, BrokenPipeError):
        pass
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass

async def handle_client(client_reader, client_writer):
    client_addr = client_writer.get_extra_info('peername')
    target_reader, target_writer = None, None
    for attempt in range(3):
        try:
            target_reader, target_writer = await asyncio.open_connection(TARGET_HOST, TARGET_PORT)
            break
        except Exception as e:
            if attempt == 2:
                try:
                    client_writer.close()
                    await client_writer.wait_closed()
                except Exception:
                    pass
                return
            await asyncio.sleep(0.5)

    try:
        await asyncio.gather(
            pipe(client_reader, target_writer),
            pipe(target_reader, client_writer),
            return_exceptions=True
        )
    except Exception:
        pass
    finally:
        try:
            client_writer.close()
            await client_writer.wait_closed()
        except Exception:
            pass

async def run_server():
    server = None
    for host in LISTEN_HOSTS:
        try:
            server = await asyncio.start_server(
                handle_client,
                host=host,
                port=LISTEN_PORT,
                reuse_address=True
            )
            for s in server.sockets:
                logging.info(f"🚀 Tailscale Proxy Running on {s.getsockname()} -> {TARGET_HOST}:{TARGET_PORT}")
            break
        except Exception as e:
            logging.warning(f"Could not bind {host}:{LISTEN_PORT} ({e}), trying next...")

    if not server:
        logging.error("Failed to bind on any target host!")
        sys.exit(1)

    async with server:
        await server.serve_forever()

if __name__ == "__main__":
    while True:
        try:
            asyncio.run(run_server())
        except KeyboardInterrupt:
            break
        except Exception as e:
            logging.error(f"Server crashed: {e}, restarting in 2s...")
            time.sleep(2)
