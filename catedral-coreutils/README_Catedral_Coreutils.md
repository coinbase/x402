# Catedral Coreutils — Substrato 1028.x

Conjunto de utilitários de sistema adaptados para a ontologia ARKHE da Catedral.

## Versões

| Substrato | Nome | Linguagem | Overhead | Status |
|-----------|------|-----------|----------|--------|
| 1028 | Python Coreutils | Python 3 | +100% | ✅ Operacional |
| 1028.1 | Rust Coreutils | Rust | +20% | 📦 Materializado |
| 1028.2 | Kernel Module | C | +5% | 📦 Materializado |
| 1028.3 | FUSE Filesystem | Rust | +50% | 📦 Materializado |

## Instalação Rápida

```bash
# Build completo
chmod +x build_catedral_coreutils.sh
sudo ./build_catedral_coreutils.sh all

# Ou individualmente
sudo ./build_catedral_coreutils.sh python
sudo ./build_catedral_coreutils.sh rust
sudo ./build_catedral_coreutils.sh kernel
sudo ./build_catedral_coreutils.sh fuse
```

## Uso

### Python (1028)
```python
from coreutils_catedral_1028 import CathedralCoreutils

core = CathedralCoreutils(theosis_threshold=0.3)
core.mkdir("/tmp/catedral_test", theosis_default=0.7)
core.theosis_set("/tmp/catedral_test/file.txt", 0.85)
files = core.ls("/tmp/catedral_test", theosis_filter=0.5)
```

### Rust (1028.1)
```bash
catedral-cat file1.txt file2.txt
catedral-cp --preserve-theosis src.txt dst.txt
catedral-rm --secure sensitive.dat
catedral-ls --theosis-filter 0.7
```

### Kernel Module (1028.2)
```bash
sudo insmod catedral_fs.ko
ls -la /dev/catedral_fs
# Usar IOCTLs para Theosis e Merkle
```

### FUSE (1028.3)
```bash
sudo catedral-fuse /mnt/catedral
cd /mnt/catedral
# Operações transparentes com Theosis e Merkle
fusermount -u /mnt/catedral
```

## Features

- ✅ Theosis tracking (nível ético por arquivo)
- ✅ Merkle hashing (SHA3-256)
- ✅ PQC-safe hashes
- ✅ TemporalChain logging
- ✅ Cross-substrate sync
- ✅ Secure wipe SPHINCS+ (7-pass)
- ✅ Substrate awareness

## Arquitetura

```
Aplicação
    ├── Python Coreutils (1028) — Desenvolvimento
    ├── Rust Coreutils (1028.1) — Staging
    ├── Kernel Module (1028.2) — Produção (máxima performance)
    └── FUSE Filesystem (1028.3) — Produção (portabilidade)
```

## Cross-links

- 1027 (Asymptotic Manifold)
- 965 (Hamiltonian Cathedral)
- 970 (Enterprise Mind)
- 972 (ARKHE-GLOBAL-MESH)
- 989.y.5 (WormGraph 5.1)
- 989.y.6.1 (DKES-NTT)

## Licença

AGPL-3.0 — Arkhe Architect ORCID 0009-0005-2697-4668
