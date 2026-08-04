echo "target/" >> .gitignore
git rm -rf --cached target/ || true
git rm -rf --cached cathedral-arkhe/target/ || true
git add .
git commit -m "gitignore target" || true
