import re
import os

prompt = open("prompt.txt").read() if os.path.exists("prompt.txt") else ""
