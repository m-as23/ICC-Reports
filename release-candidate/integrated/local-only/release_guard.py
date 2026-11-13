"""Default-closed HTTP surface for the local Web candidate."""
from http.server import BaseHTTPRequestHandler
import re


class DisabledHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def deny(self):
        self.connection.settimeout(2)
        length = self.headers.get('Content-Length', '')
        if re.fullmatch(r'[0-9]{1,4}', length) and int(length) <= 4096:
            try:
                self.rfile.read(int(length))
            except (TimeoutError, ConnectionError):
                return
        is_read = self.path in {
            '/drivefault-api/context', '/drivefault-api/versions',
            '/drivefault-api/download',
        }
        self.send_response(503 if is_read else 404)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', '0')
        self.end_headers()

    do_GET = do_HEAD = do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = deny
