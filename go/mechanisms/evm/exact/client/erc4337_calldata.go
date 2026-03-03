package client

import (
	"math/big"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

// BuildERC20TransferCallData builds the calldata for an ERC20 transfer(to, amount) call.
func BuildERC20TransferCallData(to string, amount *big.Int) (string, error) {
	// ERC20 transfer function signature
	addressType, _ := abi.NewType("address", "", nil)
	uint256Type, _ := abi.NewType("uint256", "", nil)

	arguments := abi.Arguments{
		{Type: addressType},
		{Type: uint256Type},
	}

	packed, err := arguments.Pack(
		common.HexToAddress(to),
		amount,
	)
	if err != nil {
		return "", err
	}

	// transfer(address,uint256) selector: 0xa9059cbb
	selector := []byte{0xa9, 0x05, 0x9c, 0xbb}
	calldata := append(selector, packed...)

	return "0x" + common.Bytes2Hex(calldata), nil
}
