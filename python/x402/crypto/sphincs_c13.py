import os

from eth_hash.auto import keccak

N = 16
W = 8
LOG2W = 3
L = 43
K = 8
A = 16
D = 2
H_TOTAL = 24
H_PER_LAYER = 12
WOTS_MAX_STEP = W - 1

SIG_RAND_SIZE = N
FORS_LEAF_SIZE = N
FORS_AUTH_SIZE = A * N
FORS_SIG_ITEM_SIZE = FORS_LEAF_SIZE + FORS_AUTH_SIZE
FORS_TOTAL_SIZE = K * FORS_SIG_ITEM_SIZE
WOTS_SIG_SIZE = L * N
MERKLE_AUTH_SIZE = H_PER_LAYER * N
SIG_SIZE = 3952


def keccak256(data: bytes) -> bytes:
    return keccak(data)


class SPHINCSC13:
    def __init__(self, seed=None):
        if seed is None:
            seed = os.urandom(3 * N)
        self.sk_seed = seed[:N]
        self.pk_seed = seed[N : 2 * N]
        self.sk_prf = seed[2 * N : 3 * N]
        self.pk_root = None

    def _compute_winternitz_digits(self, msg_hash: bytes, leaf_idx: int, tree_idx: int) -> list:
        expanded = keccak256(
            msg_hash + leaf_idx.to_bytes(32, "big") + tree_idx.to_bytes(32, "big") + bytes([0])
        )
        bits_available = 256
        bit_pos = 0
        digits = []
        for i in range(L):
            if bits_available < LOG2W:
                expanded = keccak256(expanded + bytes([i]))
                bits_available = 256
                bit_pos = 0
            expanded_int = int.from_bytes(expanded, "big")
            digit = (expanded_int >> bit_pos) & ((1 << LOG2W) - 1)
            digits.append(digit)
            bit_pos += LOG2W
            bits_available -= LOG2W
        return digits

    def _prf(self, *args) -> bytes:
        data = self.sk_prf + b"".join(args)
        return keccak256(data)[:N]

    def _chain(self, start: bytes, steps: int) -> bytes:
        current = start + b"\x00" * (32 - N)
        for _ in range(steps):
            current = keccak256(current)
        return current[:N]

    def wots_pk_from_sig(self, sig: bytes, msg: bytes, leaf_idx: int, tree_idx: int) -> bytes:
        digits = self._compute_winternitz_digits(msg, leaf_idx, tree_idx)
        chain_values = []
        offset = 0
        for i in range(L):
            sig_val = sig[offset : offset + N]
            offset += N
            steps = WOTS_MAX_STEP - digits[i]

            current = sig_val + b"\x00" * (32 - N)
            for _ in range(steps):
                current = keccak256(current)
                current = current[:N] + b"\x00" * (32 - N)
            chain_values.append(current)
        return keccak256(b"".join(chain_values))[:N] + b"\x00" * (32 - N)

    def wots_sign(self, msg: bytes, leaf_idx: int, tree_idx: int) -> bytes:
        digits = self._compute_winternitz_digits(msg, leaf_idx, tree_idx)
        sig = b""
        for i in range(L):
            sk = self._prf(
                b"wots",
                tree_idx.to_bytes(32, "big"),
                leaf_idx.to_bytes(32, "big"),
                i.to_bytes(32, "big"),
            )

            current = sk + b"\x00" * (32 - N)
            for _ in range(digits[i]):
                current = keccak256(current)
                current = current[:N] + b"\x00" * (32 - N)

            sig += current[:N]
        return sig

    def wots_pk(self, leaf_idx: int, tree_idx: int) -> bytes:
        chain_values = []
        for i in range(L):
            sk = self._prf(
                b"wots",
                tree_idx.to_bytes(32, "big"),
                leaf_idx.to_bytes(32, "big"),
                i.to_bytes(32, "big"),
            )
            current = sk + b"\x00" * (32 - N)
            for _ in range(WOTS_MAX_STEP):
                current = keccak256(current)
                current = current[:N] + b"\x00" * (32 - N)
            chain_values.append(current)
        return keccak256(b"".join(chain_values))[:N] + b"\x00" * (32 - N)

    def _tree_hash(self, leaf_idx: int, tree_idx: int, height: int, is_fors: bool = False) -> tuple:
        if height == 0:
            if is_fors:
                val = self._prf(b"fors", tree_idx.to_bytes(32, "big"), leaf_idx.to_bytes(32, "big"))
                return val[:N] + b"\x00" * (32 - N), None
            else:
                val = self.wots_pk(leaf_idx, tree_idx)
                return val[:N] + b"\x00" * (32 - N), None

        left, _ = self._tree_hash(2 * leaf_idx, tree_idx, height - 1, is_fors)
        right, _ = self._tree_hash(2 * leaf_idx + 1, tree_idx, height - 1, is_fors)

        # In Solidity: node = node & bytes32(type(uint256).max << 128);
        # Which means both left and right are 16 bytes padded to 32 bytes with zeros.
        left_bytes32 = left[:N] + b"\x00" * (32 - N)
        right_bytes32 = right[:N] + b"\x00" * (32 - N)

        res = keccak256(left_bytes32 + right_bytes32)
        return res[:N] + b"\x00" * (32 - N), None

    def _merkle_sign(
        self, leaf_idx: int, tree_idx: int, height: int, is_fors: bool = False
    ) -> tuple:
        auth_path = b""
        for i in range(height):
            sibling_idx = (leaf_idx >> i) ^ 1
            sibling, _ = self._tree_hash(sibling_idx, tree_idx, i, is_fors)
            auth_path += sibling[:N]

        leaf_val = (
            self._prf(b"fors", tree_idx.to_bytes(32, "big"), leaf_idx.to_bytes(32, "big"))
            + b"\x00" * (32 - N)
            if is_fors
            else self.wots_pk(leaf_idx, tree_idx)
        )
        return leaf_val, auth_path

    def fors_sign(self, md: bytes, tree_idx: int, leaf_idx: int) -> tuple:
        sig = b""
        roots = []
        for i in range(K):
            leaf_idx_hash = keccak256(
                md
                + tree_idx.to_bytes(32, "big")
                + leaf_idx.to_bytes(32, "big")
                + i.to_bytes(32, "big")
            )
            leaf_idx_fors = int.from_bytes(leaf_idx_hash, "big") % (1 << A)

            leaf_val, auth_path = self._merkle_sign(leaf_idx_fors, tree_idx, A, is_fors=True)
            sig += leaf_val[:N] + auth_path

            node = leaf_val
            current_idx = leaf_idx_fors
            for level in range(A):
                sibling_n = auth_path[level * N : (level + 1) * N]
                sibling = sibling_n + b"\x00" * (32 - N)
                if (current_idx >> level) & 1 == 0:
                    node = keccak256(node + sibling)
                else:
                    node = keccak256(sibling + node)
                node = node[:N] + b"\x00" * (32 - N)
            roots.append(node)
        pk = keccak256(b"".join(roots))[:N] + b"\x00" * (32 - N)
        return sig, pk

    def generate_keypair(self) -> bytes:
        # compute actual pk_root
        top_root, _ = self._tree_hash(0, 0, H_PER_LAYER)
        self.pk_root = top_root[:16]
        return self.pk_root

    def sign(self, message: bytes) -> tuple:
        randomizer = os.urandom(N)

        # In Solidity:
        # bytes32 randomizer;
        # assembly { calldatacopy(randomizer, signature.offset, N) }
        # This pads the randomizer to 32 bytes!
        randomizer_bytes32 = randomizer + b"\x00" * 16

        # bytes32 publicKeyRoot (already bytes32)
        pk_root_bytes32 = self.pk_root + b"\x00" * 16

        # hMsg = keccak256(abi.encodePacked(randomizer, publicKeyRoot, message))
        # Since randomizer is bytes32, and publicKeyRoot is bytes32, abi.encodePacked will
        # output the full 32 bytes for each.
        hMsg = keccak256(randomizer_bytes32 + pk_root_bytes32 + message)
        md = hMsg
        hMsg_int = int.from_bytes(hMsg, "big")
        idxTree = (hMsg_int >> 128) & ((1 << (H_TOTAL - H_PER_LAYER)) - 1)
        idxLeaf = (hMsg_int >> 224) & ((1 << H_PER_LAYER) - 1)

        sig = randomizer
        fors_sig, fors_pk = self.fors_sign(md, idxTree, idxLeaf)
        sig += fors_sig

        wots_sig_0 = self.wots_sign(fors_pk, idxLeaf, idxTree)
        sig += wots_sig_0

        _, merkle_auth_0 = self._merkle_sign(idxLeaf, idxTree, H_PER_LAYER)
        sig += merkle_auth_0

        nodeLayer0 = self.wots_pk_from_sig(wots_sig_0, fors_pk, idxLeaf, idxTree)
        node = nodeLayer0
        current_idx = idxLeaf
        for level in range(H_PER_LAYER):
            sibling_n = merkle_auth_0[level * N : (level + 1) * N]
            sibling = sibling_n + b"\x00" * (32 - N)
            if (current_idx >> level) & 1 == 0:
                node = keccak256(node + sibling)
            else:
                node = keccak256(sibling + node)
            node = node[:N] + b"\x00" * (32 - N)
        root0 = node

        wots_sig_1 = self.wots_sign(root0, idxTree, 0)
        sig += wots_sig_1

        _, merkle_auth_1 = self._merkle_sign(idxTree, 0, H_PER_LAYER)
        sig += merkle_auth_1

        return sig, self.pk_root
