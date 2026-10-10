import asyncore, smtpd, os, time, sys
os.makedirs('/tmp/claude-0/gotrue/mail', exist_ok=True)
class S(smtpd.SMTPServer):
    def process_message(self, peer, mailfrom, rcpttos, data, **kw):
        os.makedirs('/tmp/claude-0/gotrue/mail', exist_ok=True)
        n = len(os.listdir('/tmp/claude-0/gotrue/mail'))
        open(f'/tmp/claude-0/gotrue/mail/{n:03d}-{int(time.time()*1000)}.eml','wb').write(data if isinstance(data,bytes) else data.encode())
S(('127.0.0.1',2525),None)
asyncore.loop()
