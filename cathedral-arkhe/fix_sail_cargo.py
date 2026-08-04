content = open("sail-zk-pipeline/Cargo.toml").read()
content = content.replace('async-channel = "1.9.0"', '')
open("sail-zk-pipeline/Cargo.toml", "w").write(content)
