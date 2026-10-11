import concurrent.futures as cf, json, sys, urllib.request, uuid
B = "http://localhost:8080/api/v1"
EMAIL, PW = sys.argv[1], "loadtest-pass-1"
N = int(sys.argv[2]) if len(sys.argv) > 2 else 10

def post_json(path, body):
    req = urllib.request.Request(B + path, data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

def multipart(path, token):
    boundary = "X" + uuid.uuid4().hex
    png = open("test_gray.png", "rb").read()
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="t.png"\r\n'
            f"Content-Type: image/png\r\n\r\n").encode() + png + (
            f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="formats"\r\n\r\nstl\r\n--{boundary}--\r\n').encode()
    req = urllib.request.Request(B + path, data=body, method="POST", headers={
        "Authorization": f"Bearer {token}", "Content-Type": f"multipart/form-data; boundary={boundary}"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code

tok = post_json("/auth/login", {"email": EMAIL, "password": PW})["access_token"]
with cf.ThreadPoolExecutor(max_workers=N) as ex:
    codes = list(ex.map(lambda _: multipart("/conversions", tok), range(N)))
from collections import Counter
print("status counts:", dict(Counter(codes)))
print("accepted (202):", codes.count(202), "| rejected (429):", codes.count(429))
