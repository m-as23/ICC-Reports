import http.server, ssl, sys, os
certificate, key = os.path.abspath(sys.argv[2]), os.path.abspath(sys.argv[3])
os.chdir(sys.argv[1])
server = http.server.HTTPServer(('127.0.0.1', 8443), http.server.SimpleHTTPRequestHandler)
context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain(certificate, key)
server.socket = context.wrap_socket(server.socket, server_side=True)
server.serve_forever()
