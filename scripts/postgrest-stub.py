# Minimal PostgREST stand-in for scripts/precheck-fetch-market-data.sh.
# Records every POST (insert) body to a log file; answers reads with [].
# Usage: python3 -I scripts/postgrest-stub.py <port> <log-file>
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

LOG = sys.argv[2]


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body=b'[]'):
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._send(200)

    def do_HEAD(self):
        self._send(200)

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        with open(LOG, 'a') as f:
            f.write(self.path + '\t' + body.decode() + '\n')
        self._send(201, b'')

    def log_message(self, *args):
        pass


HTTPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
