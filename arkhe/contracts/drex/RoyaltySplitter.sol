// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title RoyaltySplitter
 * @dev Contrato para distribuição automática de royalties usando DREX (Real Digital).
 */
contract RoyaltySplitter {
    event RoyaltiesDeposited(address indexed from, uint256 amount);
    event RoyaltiesDistributed(address indexed recipient, uint256 amount);
    event SplitUpdated(address[] recipients, uint256[] shares);
    event Withdrawn(address indexed owner, uint256 amount);

    address public drexToken;
    address public owner;
    address[] public recipients;
    uint256[] public shares; // base 10000 = 100%
    uint256 public totalDeposited;
    mapping(address => uint256) public pendingBalances;

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address _drexToken, address[] memory _recipients, uint256[] memory _shares) {
        require(_drexToken != address(0), "DREX token invalid");
        require(_recipients.length == _shares.length, "Arrays length mismatch");
        require(_recipients.length > 0, "At least one recipient");

        uint256 totalShares = 0;
        for (uint i = 0; i < _shares.length; i++) {
            totalShares += _shares[i];
        }
        require(totalShares == 10000, "Shares must sum to 10000");

        drexToken = _drexToken;
        owner = msg.sender;
        recipients = _recipients;
        shares = _shares;
    }

    function depositAndDistribute(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        IERC20(drexToken).transferFrom(msg.sender, address(this), amount);
        totalDeposited += amount;
        emit RoyaltiesDeposited(msg.sender, amount);
        _distribute(amount);
    }

    function _distribute(uint256 amount) internal {
        uint256 remaining = amount;
        for (uint i = 0; i < recipients.length; i++) {
            address recipient = recipients[i];
            uint256 shareAmount = (amount * shares[i]) / 10000;
            if (shareAmount > 0) {
                pendingBalances[recipient] += shareAmount;
                remaining -= shareAmount;
                emit RoyaltiesDistributed(recipient, shareAmount);
            }
        }
        if (remaining > 0) {
            pendingBalances[owner] += remaining;
        }
    }

    function withdraw() external {
        uint256 amount = pendingBalances[msg.sender];
        require(amount > 0, "No balance to withdraw");
        pendingBalances[msg.sender] = 0;
        IERC20(drexToken).transfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    function updateSplit(address[] memory _recipients, uint256[] memory _shares) external onlyOwner {
        require(_recipients.length == _shares.length, "Arrays length mismatch");
        require(_recipients.length > 0, "At least one recipient");
        uint256 totalShares = 0;
        for (uint i = 0; i < _shares.length; i++) {
            totalShares += _shares[i];
        }
        require(totalShares == 10000, "Shares must sum to 10000");
        recipients = _recipients;
        shares = _shares;
        emit SplitUpdated(_recipients, _shares);
    }

    function getRecipients() external view returns (address[] memory) { return recipients; }
    function getShares() external view returns (uint256[] memory) { return shares; }
    function getPendingBalance(address account) external view returns (uint256) {
        return pendingBalances[account];
    }

    function emergencyWithdraw(uint256 amount) external onlyOwner {
        require(amount <= IERC20(drexToken).balanceOf(address(this)), "Insufficient balance");
        IERC20(drexToken).transfer(owner, amount);
    }
}

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}
