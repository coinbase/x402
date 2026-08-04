import pexpect
import sys
import time

child = pexpect.spawn("npx @opensea/tool-sdk init my-tool", encoding='utf-8')
child.logfile = sys.stdout

child.expect("Description:", timeout=10)
time.sleep(1)
child.sendline("ARKHE HTTP GATEWAY tool\r")

child.expect("Creator address", timeout=10)
time.sleep(1)
child.sendline("0x0000000000000000000000000000000000000000\r")

child.expect("Hosting platform:", timeout=10)
time.sleep(1)
child.sendline("\r") # Selects default

child.expect("Tool endpoint URL:", timeout=10)
time.sleep(1)
child.sendline("http://localhost:8700\r")

child.expect(pexpect.EOF, timeout=30)
