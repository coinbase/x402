// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import { IDeferredPaymentEscrow } from "./IDeferredPaymentEscrow.sol";
import { EscrowSignatureLib } from "./libraries/EscrowSignatureLib.sol";

/**
 * @title DeferredPaymentEscrow
 * @notice Multi-token escrow system supporting off-chain vouchers for micropayments
 * @dev Implements EIP-712 signed vouchers with ERC-1271 smart account support
 */
contract DeferredPaymentEscrow is ReentrancyGuard, EIP712, IDeferredPaymentEscrow {
  using SafeERC20 for IERC20;
  using EnumerableSet for EnumerableSet.Bytes32Set;

  /// @notice Maximum allowed thawing period (30 days)
  uint256 public constant MAX_THAWING_PERIOD = 30 days;

  /// @notice Immutable thawing period for withdrawals
  uint256 public immutable THAWING_PERIOD;

  /// @notice EIP-712 type hash for voucher structure
  bytes32 public constant VOUCHER_TYPEHASH = EscrowSignatureLib.VOUCHER_TYPEHASH;

  /// @notice EIP-712 type hash for deposit authorization structure
  bytes32 public constant DEPOSIT_AUTHORIZATION_TYPEHASH = EscrowSignatureLib.DEPOSIT_AUTHORIZATION_TYPEHASH;

  /// @notice EIP-712 type hash for flush authorization structure
  bytes32 public constant FLUSH_AUTHORIZATION_TYPEHASH = EscrowSignatureLib.FLUSH_AUTHORIZATION_TYPEHASH;

  /// @notice EIP-712 type hash for flush all authorization structure
  bytes32 public constant FLUSH_ALL_AUTHORIZATION_TYPEHASH = EscrowSignatureLib.FLUSH_ALL_AUTHORIZATION_TYPEHASH;

  /// @notice Struct to store seller and asset information for escrow keys
  struct EscrowKey {
    address seller;
    address asset;
  }

  /// @custom:storage-location erc7201:deferred.payment.escrow.main
  struct MainStorage {
    /// @notice Triple-nested mapping: buyer => seller => asset => EscrowAccount
    mapping(address buyer => mapping(address seller => mapping(address asset => IDeferredPaymentEscrow.EscrowAccount))) accounts;
    /// @notice Quadruple-nested mapping: buyer => seller => asset => voucherId => collected amount
    mapping(address buyer => mapping(address seller => mapping(address asset => mapping(bytes32 voucherId => uint256)))) voucherCollected;
    /// @notice Set of hashed (seller, asset) pairs per buyer for account tracking
    mapping(address buyer => EnumerableSet.Bytes32Set) buyerEscrowKeys;
    /// @notice Decode hash back to (seller, asset)
    mapping(bytes32 keyHash => EscrowKey) escrowKeyToInfo;
    /// @notice Track used deposit authorization nonces by buyer and nonce
    mapping(address buyer => mapping(bytes32 nonce => bool)) usedDepositNonces;
    /// @notice Track used flush authorization nonces by buyer and nonce
    mapping(address buyer => mapping(bytes32 nonce => bool)) usedFlushNonces;
    /// @notice Track used flush all authorization nonces by buyer and nonce
    mapping(address buyer => mapping(bytes32 nonce => bool)) usedFlushAllNonces;
  }

  // keccak256(abi.encode(uint256(keccak256("deferred.payment.escrow.main")) - 1)) & ~bytes32(uint256(0xff))
  bytes32 constant MAIN_STORAGE_LOCATION = 0x4cf6ea8df9d6256fc1076c222eae360b1d94159d5580e17aba1e651f33b72300;

  function _getMainStorage() private pure returns (MainStorage storage $) {
    assembly {
      $.slot := MAIN_STORAGE_LOCATION
    }
  }

  /**
   * @notice Constructor
   * @param _thawingPeriod Thawing period in seconds
   */
  constructor(uint256 _thawingPeriod) EIP712("DeferredPaymentEscrow", "1") {
    require(_thawingPeriod <= MAX_THAWING_PERIOD, InvalidThawingPeriod(_thawingPeriod, MAX_THAWING_PERIOD));

    THAWING_PERIOD = _thawingPeriod;
  }

  /**
   * @notice Deposit tokens into escrow for a specific seller and asset
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @param amount Amount to deposit
   */
  function deposit(address seller, address asset, uint256 amount) external nonReentrant {
    _deposit(msg.sender, seller, asset, amount, msg.sender);
  }

  /**
   * @notice Deposit tokens into escrow on behalf of a buyer
   * @param buyer Address of the buyer who will own the escrow
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @param amount Amount to deposit
   */
  function depositTo(address buyer, address seller, address asset, uint256 amount) external nonReentrant {
    require(buyer != address(0), InvalidAddress(buyer));
    _deposit(buyer, seller, asset, amount, msg.sender);
  }

  /**
   * @notice Deposit tokens for multiple sellers with a single asset in a single transaction
   * @param asset ERC-20 token address
   * @param deposits Array of deposit inputs
   */
  function depositMany(address asset, DepositInput[] calldata deposits) external nonReentrant {
    require(asset != address(0), InvalidAsset(asset));
    require(deposits.length != 0, NoDepositsProvided());

    MainStorage storage $ = _getMainStorage();
    uint256 totalAmount = 0;

    // Single loop: validate inputs, calculate total, and update balances
    for (uint256 i = 0; i < deposits.length; i++) {
      DepositInput calldata depositInput = deposits[i];
      require(depositInput.seller != address(0), InvalidAddress(depositInput.seller));
      require(depositInput.amount != 0, InvalidAmount(depositInput.amount));

      totalAmount += depositInput.amount;

      // Update account balance
      EscrowAccount storage account = $.accounts[msg.sender][depositInput.seller][asset];
      account.balance += depositInput.amount;

      // Track account in buyerEscrowKeys set
      bytes32 key = keccak256(abi.encodePacked(depositInput.seller, asset));
      if ($.buyerEscrowKeys[msg.sender].add(key)) {
        $.escrowKeyToInfo[key] = EscrowKey(depositInput.seller, asset);
      }

      emit Deposited(msg.sender, depositInput.seller, asset, depositInput.amount, account.balance);
    }

    // Single token transfer for all deposits
    IERC20(asset).safeTransferFrom(msg.sender, address(this), totalAmount);
  }

  /**
   * @notice Deposit tokens using EIP-712 signed authorization
   * @param auth The deposit authorization struct
   * @param signature Buyer's signature for the authorization
   */
  function depositWithAuthorization(
    DepositAuthorization calldata auth,
    bytes calldata signature
  ) external nonReentrant {
    // Check expiry
    require(block.timestamp <= auth.expiry, AuthorizationExpired(auth.expiry, block.timestamp));

    // Check and mark nonce as used
    MainStorage storage $ = _getMainStorage();
    require(!$.usedDepositNonces[auth.buyer][auth.nonce], NonceAlreadyUsed(auth.nonce));
    $.usedDepositNonces[auth.buyer][auth.nonce] = true;

    // Validate signature
    require(
      EscrowSignatureLib.isDepositAuthorizationValid(auth, signature, _domainSeparatorV4()),
      InvalidAuthorization()
    );

    // Use internal _deposit function for consistency
    _deposit(auth.buyer, auth.seller, auth.asset, auth.amount, auth.buyer);

    // Emit authorization-specific event
    emit DepositAuthorized(auth.buyer, auth.seller, auth.asset, auth.amount, auth.nonce);
  }

  /**
   * @notice Initiate or increase withdrawal thawing amount (starts/resets thawing period)
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @param amount Amount to add to thawing
   */
  function thaw(address seller, address asset, uint256 amount) external {
    require(seller != address(0), InvalidAddress(seller));
    require(asset != address(0), InvalidAsset(asset));
    require(amount != 0, InvalidAmount(amount));

    MainStorage storage $ = _getMainStorage();
    IDeferredPaymentEscrow.EscrowAccount storage account = $.accounts[msg.sender][seller][asset];

    // Check if the requested thaw amount can be accommodated
    uint256 newThawingAmount = account.thawingAmount + amount;
    require(account.balance >= newThawingAmount, InsufficientBalance(account.balance, newThawingAmount));

    _thaw(msg.sender, seller, asset, amount);
  }

  /**
   * @notice Cancel an ongoing thawing process
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   */
  function cancelThaw(address seller, address asset) external {
    require(seller != address(0), InvalidAddress(seller));
    require(asset != address(0), InvalidAsset(asset));

    MainStorage storage $ = _getMainStorage();
    IDeferredPaymentEscrow.EscrowAccount storage account = $.accounts[msg.sender][seller][asset];
    require(account.thawingAmount != 0, NoThawingInProgress(msg.sender, seller, asset));

    uint256 thawingAmount = account.thawingAmount;

    // Cancel thawing (no balance change needed)
    account.thawingAmount = 0;
    account.thawEndTime = 0;

    emit ThawCancelled(msg.sender, seller, asset, thawingAmount);
  }

  /**
   * @notice Complete withdrawal after thawing period
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   */
  function withdraw(address seller, address asset) external nonReentrant {
    require(seller != address(0), InvalidAddress(seller));
    require(asset != address(0), InvalidAsset(asset));

    MainStorage storage $ = _getMainStorage();
    IDeferredPaymentEscrow.EscrowAccount storage account = $.accounts[msg.sender][seller][asset];

    // Check if there's thawing in progress
    require(account.thawingAmount > 0, NoThawingInProgress(msg.sender, seller, asset));

    // Check if thawing period is complete
    require(block.timestamp >= account.thawEndTime, ThawingPeriodNotCompleted(block.timestamp, account.thawEndTime));

    // Perform the withdrawal
    _withdraw(msg.sender, seller, asset);
  }

  /**
   * @notice Initiate or complete flush using EIP-712 signed authorization
   * @dev "Flush" performs two operations on a specific escrow account:
   *      1. Withdraws any funds that have completed their thawing period (ready to withdraw)
   *      2. Initiates thawing for any remaining balance that isn't already thawing
   *      This allows a Facilitator to help a buyer recover their funds with just a signature.
   * @param auth The flush authorization struct containing buyer, seller, asset, nonce, and expiry
   * @param signature Buyer's signature for the authorization
   */
  function flushWithAuthorization(FlushAuthorization calldata auth, bytes calldata signature) external nonReentrant {
    // Check expiry
    require(block.timestamp <= auth.expiry, AuthorizationExpired(auth.expiry, block.timestamp));

    // Check and mark nonce as used
    MainStorage storage $ = _getMainStorage();
    require(!$.usedFlushNonces[auth.buyer][auth.nonce], NonceAlreadyUsed(auth.nonce));
    $.usedFlushNonces[auth.buyer][auth.nonce] = true;

    // Validate signature
    require(
      EscrowSignatureLib.isFlushAuthorizationValid(auth, signature, _domainSeparatorV4()),
      InvalidAuthorization()
    );

    // First, withdraw any funds that are ready
    _withdraw(auth.buyer, auth.seller, auth.asset);

    // Then, calculate and thaw any remaining balance that isn't already thawing
    IDeferredPaymentEscrow.EscrowAccount storage account = $.accounts[auth.buyer][auth.seller][auth.asset];
    uint256 availableToThaw = account.balance > account.thawingAmount ? account.balance - account.thawingAmount : 0;

    uint256 thawedAmount = 0;
    if (availableToThaw > 0) {
      thawedAmount = _thaw(auth.buyer, auth.seller, auth.asset, availableToThaw);
    }

    // Emit the flush event (even if nothing happened - idempotent operation)
    emit FlushAuthorized(auth.buyer, auth.seller, auth.asset, auth.nonce, thawedAmount > 0);
  }

  /**
   * @notice Flush all escrows for a buyer using EIP-712 signed authorization
   * @dev "Flush all" performs a flush operation on ALL of a buyer's escrow accounts:
   *      For each account:
   *      1. Withdraws any funds that have completed their thawing period (ready to withdraw)
   *      2. Initiates thawing for any remaining balance that isn't already thawing
   *      This allows a Facilitator to help a buyer recover all their escrowed funds across
   *      all sellers and assets with just a single signature.
   * @param auth The flush all authorization struct containing buyer, nonce, and expiry
   * @param signature Buyer's signature for the authorization
   */
  function flushAllWithAuthorization(
    FlushAllAuthorization calldata auth,
    bytes calldata signature
  ) external nonReentrant {
    // Check expiry
    require(block.timestamp <= auth.expiry, AuthorizationExpired(auth.expiry, block.timestamp));

    // Check and mark nonce as used
    MainStorage storage $ = _getMainStorage();
    require(!$.usedFlushAllNonces[auth.buyer][auth.nonce], NonceAlreadyUsed(auth.nonce));
    $.usedFlushAllNonces[auth.buyer][auth.nonce] = true;

    // Validate signature
    require(
      EscrowSignatureLib.isFlushAllAuthorizationValid(auth, signature, _domainSeparatorV4()),
      InvalidAuthorization()
    );

    uint256 accountsFlushed = 0;

    // Get all escrow keys for this buyer
    EnumerableSet.Bytes32Set storage escrowKeys = $.buyerEscrowKeys[auth.buyer];
    uint256 keysLength = escrowKeys.length();

    // Process each account: withdraw ready funds AND thaw remaining balance
    // Iterate backwards to handle removals safely
    for (uint256 i = keysLength; i > 0; i--) {
      bytes32 escrowKey = escrowKeys.at(i - 1);
      EscrowKey storage keyInfo = $.escrowKeyToInfo[escrowKey];

      // First, withdraw any funds that are ready
      uint256 withdrawnAmount = _withdraw(auth.buyer, keyInfo.seller, keyInfo.asset);

      // Then, calculate and thaw any remaining balance that isn't already thawing
      IDeferredPaymentEscrow.EscrowAccount storage account = $.accounts[auth.buyer][keyInfo.seller][keyInfo.asset];
      uint256 availableToThaw = account.balance > account.thawingAmount ? account.balance - account.thawingAmount : 0;

      uint256 thawedAmount = 0;
      if (availableToThaw > 0) {
        thawedAmount = _thaw(auth.buyer, keyInfo.seller, keyInfo.asset, availableToThaw);
      }

      // Count accounts that had activity
      if (withdrawnAmount > 0 || thawedAmount > 0) {
        accountsFlushed++;
      }
    }

    emit FlushAllAuthorized(auth.buyer, auth.nonce, accountsFlushed);
  }

  /**
   * @notice Collect a single voucher
   * @param voucher The voucher to collect
   * @param signature Buyer's signature for the voucher
   */
  function collect(Voucher calldata voucher, bytes calldata signature) external nonReentrant {
    _collectVoucher(voucher, signature);
  }

  /**
   * @notice Collect multiple vouchers in a single transaction
   * @param vouchers Array of signed vouchers
   */
  function collectMany(SignedVoucher[] calldata vouchers) external nonReentrant {
    require(vouchers.length != 0, NoVouchersProvided());

    for (uint256 i = 0; i < vouchers.length; i++) {
      _collectVoucher(vouchers[i].voucher, vouchers[i].signature);
    }
  }

  /**
   * @notice Get escrow account details for a buyer-seller-asset combination
   * @param buyer Address of the buyer
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @return EscrowAccount struct with balance, thawing amount, and thaw end time
   */
  function getAccount(address buyer, address seller, address asset) external view returns (EscrowAccount memory) {
    return _getMainStorage().accounts[buyer][seller][asset];
  }

  /**
   * @notice Batch read account data including balance after deducting outstanding vouchers
   * @param buyer Address of the buyer
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @param voucherIds Unique identifiers of the vouchers
   * @param valueAggregates Value aggregates of the vouchers, order must match voucherIds
   * @return balance Available balance after deducting outstanding vouchers
   * @return allowance Allowance from asset contract
   * @return nonce Nonce from asset contract
   */
  function getAccountData(
    address buyer,
    address seller,
    address asset,
    bytes32[] memory voucherIds,
    uint256[] memory valueAggregates
  ) external view returns (uint256 balance, uint256 allowance, uint256 nonce) {
    EscrowAccount memory account = _getMainStorage().accounts[buyer][seller][asset];
    balance = account.balance - account.thawingAmount;
    for (uint256 i = 0; i < voucherIds.length; i++) {
      uint256 alreadyCollected = _getMainStorage().voucherCollected[buyer][seller][asset][voucherIds[i]];
      uint256 toCollect = valueAggregates[i] > alreadyCollected ? valueAggregates[i] - alreadyCollected : 0;
      if (balance >= toCollect) {
        balance -= toCollect;
      } else {
        balance = 0;
        break;
      }
    }
    allowance = IERC20(asset).allowance(buyer, address(this));
    nonce = IERC20Permit(asset).nonces(buyer);
  }

  /**
   * @notice Batch read all data needed for x402 verification in a single call
   * @param voucher The voucher to verify
   * @param depositAuthNonce The deposit authorization nonce (pass bytes32(0) if not using deposit auth)
   * @return voucherOutstanding Outstanding amount for the voucher
   * @return voucherCollectable Collectable amount for the voucher
   * @return balance Balance of the escrow account
   * @return availableBalance Available balance (balance minus thawing amount)
   * @return allowance Allowance from asset contract
   * @return nonce Nonce from asset contract
   * @return isDepositNonceUsed Whether the deposit authorization nonce has been used
   */
  function getVerificationData(
    Voucher calldata voucher,
    bytes32 depositAuthNonce
  )
    external
    view
    returns (
      uint256 voucherOutstanding,
      uint256 voucherCollectable,
      uint256 balance,
      uint256 availableBalance,
      uint256 allowance,
      uint256 nonce,
      bool isDepositNonceUsed
    )
  {
    MainStorage storage $ = _getMainStorage();

    // Get voucher amounts
    uint256 alreadyCollected = $.voucherCollected[voucher.buyer][voucher.seller][voucher.asset][voucher.id];
    (voucherOutstanding, voucherCollectable) = _getOutstandingAndCollectableAmount(voucher, alreadyCollected);

    // Get balance and available balance (balance minus thawing amount)
    EscrowAccount memory account = $.accounts[voucher.buyer][voucher.seller][voucher.asset];
    balance = account.balance;
    availableBalance = account.balance - account.thawingAmount;

    // Get both allowance and nonce from asset contract
    allowance = IERC20(voucher.asset).allowance(voucher.buyer, address(this));
    nonce = IERC20Permit(voucher.asset).nonces(voucher.buyer);

    // Check if deposit authorization nonce is used
    isDepositNonceUsed = $.usedDepositNonces[voucher.buyer][depositAuthNonce];
  }

  /**
   * @notice Get the amount already collected for a specific voucher
   * @param buyer Address of the buyer
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @param voucherId Unique identifier of the voucher
   * @return Amount already collected
   */
  function getVoucherCollected(
    address buyer,
    address seller,
    address asset,
    bytes32 voucherId
  ) external view returns (uint256) {
    return _getMainStorage().voucherCollected[buyer][seller][asset][voucherId];
  }

  /**
   * @notice Calculate the outstanding and collectable amounts for a voucher
   * @param voucher The voucher to check
   * @return outstanding Total amount still owed on the voucher
   * @return collectable Amount that can actually be collected now (considering available balance)
   */
  function getOutstandingAndCollectableAmount(
    Voucher calldata voucher
  ) external view returns (uint256 outstanding, uint256 collectable) {
    MainStorage storage $ = _getMainStorage();
    uint256 alreadyCollected = $.voucherCollected[voucher.buyer][voucher.seller][voucher.asset][voucher.id];
    return _getOutstandingAndCollectableAmount(voucher, alreadyCollected);
  }

  /**
   * @notice Validate a voucher signature
   * @param voucher The voucher to validate
   * @param signature The signature to validate
   * @return True if signature is valid
   */
  function isVoucherSignatureValid(Voucher calldata voucher, bytes calldata signature) external view returns (bool) {
    return EscrowSignatureLib.isVoucherSignatureValid(voucher, signature, _domainSeparatorV4());
  }

  /**
   * @notice Validate a deposit authorization signature
   * @param auth The deposit authorization to validate
   * @param signature The signature to validate
   * @return True if signature is valid
   */
  function isDepositAuthorizationValid(
    DepositAuthorization calldata auth,
    bytes calldata signature
  ) external view returns (bool) {
    return EscrowSignatureLib.isDepositAuthorizationValid(auth, signature, _domainSeparatorV4());
  }

  /**
   * @notice Validate a flush authorization signature
   * @param auth The flush authorization to validate
   * @param signature The signature to validate
   * @return True if signature is valid
   */
  function isFlushAuthorizationValid(
    FlushAuthorization calldata auth,
    bytes calldata signature
  ) external view returns (bool) {
    return EscrowSignatureLib.isFlushAuthorizationValid(auth, signature, _domainSeparatorV4());
  }

  /**
   * @notice Validate a flush all authorization signature
   * @param auth The flush all authorization to validate
   * @param signature The signature to validate
   * @return True if signature is valid
   */
  function isFlushAllAuthorizationValid(
    FlushAllAuthorization calldata auth,
    bytes calldata signature
  ) external view returns (bool) {
    return EscrowSignatureLib.isFlushAllAuthorizationValid(auth, signature, _domainSeparatorV4());
  }

  /**
   * @notice Validate a deposit authorization nonce
   * @param buyer Address of the buyer
   * @param nonce The nonce to validate
   * @return True if nonce is used
   */
  function isDepositAuthorizationNonceUsed(address buyer, bytes32 nonce) external view returns (bool) {
    return _getMainStorage().usedDepositNonces[buyer][nonce];
  }

  /**
   * @notice Validate a flush authorization nonce
   * @param buyer Address of the buyer
   * @param nonce The nonce to validate
   * @return True if nonce is used
   */
  function isFlushAuthorizationNonceUsed(address buyer, bytes32 nonce) external view returns (bool) {
    return _getMainStorage().usedFlushNonces[buyer][nonce];
  }

  /**
   * @notice Validate a flush all authorization nonce
   * @param buyer Address of the buyer
   * @param nonce The nonce to validate
   * @return True if nonce is used
   */
  function isFlushAllAuthorizationNonceUsed(address buyer, bytes32 nonce) external view returns (bool) {
    return _getMainStorage().usedFlushAllNonces[buyer][nonce];
  }

  /**
   * @notice Get the EIP-712 domain separator
   * @return Domain separator hash
   */
  function DOMAIN_SEPARATOR() external view returns (bytes32) {
    return _domainSeparatorV4();
  }

  /**
   * @notice Internal function to collect a voucher
   * @param voucher The voucher to collect
   * @param signature Buyer's signature for the voucher
   */
  function _collectVoucher(Voucher calldata voucher, bytes calldata signature) internal {
    // Validate basic voucher parameters
    require(voucher.buyer != address(0), InvalidAddress(voucher.buyer));
    require(voucher.asset != address(0), InvalidAsset(voucher.asset));
    require(voucher.escrow == address(this), InvalidEscrow(voucher.escrow, address(this)));
    require(voucher.chainId == block.chainid, InvalidChainId(voucher.chainId, block.chainid));
    require(voucher.valueAggregate != 0, InvalidAmount(voucher.valueAggregate));
    require(block.timestamp <= voucher.expiry, VoucherExpired(voucher.id, block.timestamp, voucher.expiry));

    // Validate signature
    require(
      EscrowSignatureLib.isVoucherSignatureValid(voucher, signature, _domainSeparatorV4()),
      InvalidSignature(voucher.id, voucher.buyer)
    );

    MainStorage storage $ = _getMainStorage();

    // Get current collected amount and calculate what can be collected
    uint256 alreadyCollected = $.voucherCollected[voucher.buyer][voucher.seller][voucher.asset][voucher.id];
    (uint256 outstanding, uint256 collectAmount) = _getOutstandingAndCollectableAmount(voucher, alreadyCollected);

    if (outstanding == 0) {
      // Voucher is already fully collected
      emit VoucherAlreadyCollected(voucher.id, voucher.buyer, voucher.seller, voucher.asset, alreadyCollected);
      return;
    }

    if (collectAmount == 0) {
      // Voucher has outstanding amount but no balance available
      emit VoucherNoCollectableBalance(
        voucher.id,
        voucher.buyer,
        voucher.seller,
        voucher.asset,
        outstanding,
        alreadyCollected
      );
      return;
    }

    // Proceed with collection
    IDeferredPaymentEscrow.EscrowAccount storage account = $.accounts[voucher.buyer][voucher.seller][voucher.asset];

    // Update state
    $.voucherCollected[voucher.buyer][voucher.seller][voucher.asset][voucher.id] = alreadyCollected + collectAmount;

    // Deduct from balance
    account.balance -= collectAmount;

    // If balance drops below thawing amount, adjust thawing amount
    if (account.balance < account.thawingAmount) {
      account.thawingAmount = account.balance;
    }

    // Transfer tokens directly to seller (no protocol fee)
    IERC20(voucher.asset).safeTransfer(voucher.seller, collectAmount);

    emit VoucherCollected(
      voucher.id,
      voucher.buyer,
      voucher.seller,
      voucher.asset,
      collectAmount,
      alreadyCollected + collectAmount
    );

    // Clean up if account is empty
    if (account.balance == 0 && account.thawingAmount == 0) {
      bytes32 key = keccak256(abi.encodePacked(voucher.seller, voucher.asset));
      $.buyerEscrowKeys[voucher.buyer].remove(key);
    }
  }

  /**
   * @notice Internal function to handle deposits
   * @param buyer Address of the buyer who will own the escrow
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @param amount Amount to deposit
   * @param payer Address paying for the deposit
   */
  function _deposit(address buyer, address seller, address asset, uint256 amount, address payer) internal {
    require(seller != address(0), InvalidAddress(seller));
    require(asset != address(0), InvalidAsset(asset));
    require(amount != 0, InvalidAmount(amount));

    MainStorage storage $ = _getMainStorage();
    IDeferredPaymentEscrow.EscrowAccount storage account = $.accounts[buyer][seller][asset];

    // Transfer tokens from payer to this contract
    IERC20(asset).safeTransferFrom(payer, address(this), amount);

    // Update account balance
    account.balance += amount;

    // Track account in buyerEscrowKeys set
    bytes32 key = keccak256(abi.encodePacked(seller, asset));
    if ($.buyerEscrowKeys[buyer].add(key)) {
      $.escrowKeyToInfo[key] = EscrowKey(seller, asset);
    }

    emit Deposited(buyer, seller, asset, amount, account.balance);
  }

  /**
   * @notice Internal function to initiate or increase thawing
   * @dev This function will NOT revert if the requested amount exceeds the available balance.
   *      Instead, it will cap the thaw amount to the maximum available (balance - already thawing).
   *      If funds are already thawing, this will ADD to the thawing amount and reset the timer.
   *      The thaw timer always resets to a full thawing period from the current timestamp,
   *      regardless of any previous thaw progress.
   * @param buyer Address of the buyer
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @param amount Amount to thaw (must be > 0)
   * @return thawedAmount The actual amount that was set to thaw (may be less than requested if capped)
   */
  function _thaw(address buyer, address seller, address asset, uint256 amount) internal returns (uint256 thawedAmount) {
    require(amount > 0, InvalidAmount(amount));

    MainStorage storage $ = _getMainStorage();
    IDeferredPaymentEscrow.EscrowAccount storage account = $.accounts[buyer][seller][asset];

    // Calculate how much can be thawed
    uint256 availableToThaw = account.balance - account.thawingAmount;
    if (availableToThaw == 0) {
      return 0; // Nothing to thaw
    }

    // Cap to available amount
    thawedAmount = amount > availableToThaw ? availableToThaw : amount;

    // Store previous values for event
    uint256 previousThawingAmount = account.thawingAmount;
    uint256 previousThawEndTime = account.thawEndTime;

    // Update thawing state
    account.thawingAmount = previousThawingAmount + thawedAmount;
    account.thawEndTime = uint64(block.timestamp + THAWING_PERIOD);

    emit ThawInitiated(
      buyer,
      seller,
      asset,
      account.thawingAmount,
      previousThawingAmount,
      account.thawEndTime,
      previousThawEndTime
    );
  }

  /**
   * @notice Internal function to withdraw funds that have completed thawing
   * @dev This function will NOT revert if there are no funds ready to withdraw.
   *      It will simply return 0 if:
   *      - No funds are currently thawing (thawingAmount == 0)
   *      - The thaw period hasn't completed yet (block.timestamp < thawEndTime)
   *      The function automatically handles edge cases like collections during thaw period
   *      by capping the withdrawal to the actual balance if needed.
   *      If the account becomes empty after withdrawal, it is automatically cleaned up
   *      and removed from the buyer's escrow keys set.
   * @param buyer Address of the buyer
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @return withdrawnAmount The actual amount withdrawn (0 if nothing was ready)
   */
  function _withdraw(address buyer, address seller, address asset) internal returns (uint256 withdrawnAmount) {
    MainStorage storage $ = _getMainStorage();
    IDeferredPaymentEscrow.EscrowAccount storage account = $.accounts[buyer][seller][asset];

    // Check if there's anything to withdraw
    if (account.thawingAmount == 0 || block.timestamp < account.thawEndTime) {
      return 0; // Nothing ready to withdraw
    }

    withdrawnAmount = account.thawingAmount;

    // Ensure balance still covers the thawing amount (in case of collections during thaw)
    if (withdrawnAmount > account.balance) {
      withdrawnAmount = account.balance;
    }

    // Update balance and clear thawing state
    account.balance -= withdrawnAmount;
    account.thawingAmount = 0;
    account.thawEndTime = 0;

    // Transfer tokens to buyer
    if (withdrawnAmount > 0) {
      IERC20(asset).safeTransfer(buyer, withdrawnAmount);
      emit Withdrawn(buyer, seller, asset, withdrawnAmount, account.balance);
    }

    // Clean up if account is empty
    if (account.balance == 0 && account.thawingAmount == 0) {
      bytes32 key = keccak256(abi.encodePacked(seller, asset));
      $.buyerEscrowKeys[buyer].remove(key);
    }
  }

  /**
   * @notice Internal function to calculate outstanding and collectable amounts
   * @param voucher The voucher to check
   * @param alreadyCollected Amount already collected for this voucher
   * @return outstanding Total amount still owed on the voucher
   * @return collectable Amount that can actually be collected now
   */
  function _getOutstandingAndCollectableAmount(
    Voucher calldata voucher,
    uint256 alreadyCollected
  ) internal view returns (uint256 outstanding, uint256 collectable) {
    outstanding = 0;
    collectable = 0;

    if (voucher.valueAggregate > alreadyCollected) {
      outstanding = voucher.valueAggregate - alreadyCollected;

      MainStorage storage $ = _getMainStorage();
      EscrowAccount memory account = $.accounts[voucher.buyer][voucher.seller][voucher.asset];

      // Full balance is available for collection (thawing doesn't block sellers)
      collectable = outstanding > account.balance ? account.balance : outstanding;
    }
  }
}
