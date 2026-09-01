import socket
import threading
import sys

def forward(src, dst):
    try:
        while True:
            data = src.recv(65536)
            if not data:
                break
            dst.sendall(data)
    except Exception:
        pass
    finally:
        try:
            src.close()
        except Exception:
            pass
        try:
            dst.close()
        except Exception:
            pass

def handle_client(client_sock):
    try:
        backend_sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        backend_sock.connect(('127.0.0.1', 47650))
        t1 = threading.Thread(target=forward, args=(client_sock, backend_sock), daemon=True)
        t2 = threading.Thread(target=forward, args=(backend_sock, client_sock), daemon=True)
        t1.start()
        t2.start()
    except Exception as e:
        client_sock.close()

def main():
    bind_ip = sys.argv[1] if len(sys.argv) > 1 else '100.122.90.30'
    bind_port = int(sys.argv[2]) if len(sys.argv) > 2 else 47650
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        server.bind((bind_ip, bind_port))
    except Exception as e:
        # Fallback to 0.0.0.0 if specific IP binding fails
        server.bind(('0.0.0.0', bind_port))
    server.listen(128)
    print(f"Tailscale Reverse Proxy listening on {bind_ip}:{bind_port} -> 127.0.0.1:47650", flush=True)
    while True:
        client_sock, _ = server.accept()
        threading.Thread(target=handle_client, args=(client_sock,), daemon=True).start()

if __name__ == '__main__':
    main()
