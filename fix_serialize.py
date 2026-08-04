content = open("cathedral-arkhe/sdk-rs/src/lib.rs").read()
content = content.replace("serde_json::to_vec(&event)?;", "prost::Message::encode_to_vec(&event);")
content = content.replace("serde_json::to_vec(&event)?", "prost::Message::encode_to_vec(&event)")
open("cathedral-arkhe/sdk-rs/src/lib.rs", "w").write(content)
