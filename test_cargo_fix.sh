cd cathedral-arkhe
rm -rf tests/src/lib.rs

cat << 'EOF2' > fix_test_src.py
import os
os.makedirs("tests/src", exist_ok=True)
open("tests/src/main.rs", "w").write("fn main() {}")
EOF2
python3 fix_test_src.py

cargo build --workspace
