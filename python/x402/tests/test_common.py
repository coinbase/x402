from x402.common import parse_money


def test_parse_money():
    assert (
        parse_money("1", "0x036CbD53842c5426634e7929541eC2318f3dCF7e", "base-sepolia")
        == 1000000
    )
    assert (
        parse_money("$1", "0x036CbD53842c5426634e7929541eC2318f3dCF7e", "base-sepolia")
        == 1000000
    )
    assert (
        parse_money(
            "$1.12", "0x036CbD53842c5426634e7929541eC2318f3dCF7e", "base-sepolia"
        )
        == 1120000
    )

    assert (
        parse_money(
            "$1.00", "0x036CbD53842c5426634e7929541eC2318f3dCF7e", "base-sepolia"
        )
        == 1000000
    )

    assert (
        parse_money(
            1120000, "0x036CbD53842c5426634e7929541eC2318f3dCF7e", "base-sepolia"
        )
        == 1120000
    )
