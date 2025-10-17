// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

/**
 * @title IDeferredPaymentEscrow
 * @notice Interface for a multi-token escrow system supporting off-chain vouchers
 * @dev Enables micropayments between buyers and sellers using EIP-712 signed vouchers
 */
interface IDeferredPaymentEscrow {
  // ============ ERRORS ============

  error InvalidAddress(address provided);
  error InvalidAmount(uint256 provided);
  error InvalidAsset(address provided);
  error InvalidThawingPeriod(uint256 provided, uint256 maximum);
  error InsufficientBalance(uint256 available, uint256 requested);
  error NoThawingInProgress(address buyer, address seller, address asset);
  error ThawingPeriodNotCompleted(uint256 currentTime, uint256 thawEndTime);
  error InvalidEscrow(address provided, address expected);
  error InvalidChainId(uint256 provided, uint256 expected);
  error VoucherExpired(bytes32 voucherId, uint256 currentTime, uint256 expiry);
  error InvalidSignature(bytes32 voucherId, address buyer);
  error NoDepositsProvided();
  error NoVouchersProvided();
  error AuthorizationExpired(uint64 expiry, uint256 currentTime);
  error NonceAlreadyUsed(bytes32 nonce);
  error InvalidAuthorization();

  // ============ STRUCTS ============

  /**
   * @notice Represents an escrow account for a specific buyer-seller-asset combination
   * @param balance Current deposited balance available for payments
   * @param thawingAmount Amount currently in the thawing process
   * @param thawEndTime Timestamp when the thawing period completes
   */
  struct EscrowAccount {
    uint256 balance;
    uint256 thawingAmount;
    uint64 thawEndTime;
  }

  /**
   * @notice Represents a payment voucher with all required fields
   * @param id Unique identifier for the voucher (unique per buyer-seller pair)
   * @param buyer Address of the payment initiator
   * @param seller Address of the payment recipient
   * @param valueAggregate Total outstanding amount (monotonically increasing)
   * @param asset ERC-20 token address
   * @param timestamp Last aggregation timestamp
   * @param nonce Incremented with each aggregation
   * @param escrow Address of this escrow contract
   * @param chainId Network chain ID
   * @param expiry Expiration timestamp after which voucher cannot be collected
   */
  struct Voucher {
    bytes32 id;
    address buyer;
    address seller;
    uint256 valueAggregate;
    address asset;
    uint64 timestamp;
    uint256 nonce;
    address escrow;
    uint256 chainId;
    uint64 expiry;
  }

  /**
   * @notice Input structure for batch deposits
   * @param seller Address of the seller to deposit for
   * @param amount Amount to deposit
   */
  struct DepositInput {
    address seller;
    uint256 amount;
  }

  /**
   * @notice Signed voucher (Input structure for batch voucher collections)
   * @param voucher The voucher to collect
   * @param signature Buyer's signature for the voucher
   * @param amount Amount to collect (0 means collect all available)
   */
  struct SignedVoucher {
    Voucher voucher;
    bytes signature;
  }

  /**
   * @notice Authorization for depositing funds into escrow
   * @param buyer Address of the buyer authorizing the deposit
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @param amount Amount to deposit
   * @param nonce Random bytes32 for replay protection
   * @param expiry Expiration timestamp
   */
  struct DepositAuthorization {
    address buyer;
    address seller;
    address asset;
    uint256 amount;
    bytes32 nonce;
    uint64 expiry;
  }

  /**
   * @notice Authorization for flushing a specific escrow
   * @param buyer Address of the buyer authorizing the flush
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @param nonce Random bytes32 for replay protection
   * @param expiry Expiration timestamp
   */
  struct FlushAuthorization {
    address buyer;
    address seller;
    address asset;
    bytes32 nonce;
    uint64 expiry;
  }

  /**
   * @notice Authorization for flushing all escrows for a buyer
   * @param buyer Address of the buyer authorizing the flush
   * @param nonce Random bytes32 for replay protection
   * @param expiry Expiration timestamp
   */
  struct FlushAllAuthorization {
    address buyer;
    bytes32 nonce;
    uint64 expiry;
  }

  // ============ EVENTS ============

  /**
   * @notice Emitted when funds are deposited into an escrow account
   * @param buyer Address of the buyer
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @param amount Amount deposited
   * @param newBalance New total balance for the account
   */
  event Deposited(
    address indexed buyer,
    address indexed seller,
    address indexed asset,
    uint256 amount,
    uint256 newBalance
  );

  /**
   * @notice Emitted when a thawing process is initiated or increased
   * @param buyer Address of the buyer
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @param newThawingAmount New total amount being thawed
   * @param previousThawingAmount Previous amount that was thawing (0 if new thaw)
   * @param newThawEndTime New timestamp when thawing completes
   * @param previousThawEndTime Previous thaw end time (0 if new thaw)
   */
  event ThawInitiated(
    address indexed buyer,
    address indexed seller,
    address indexed asset,
    uint256 newThawingAmount,
    uint256 previousThawingAmount,
    uint256 newThawEndTime,
    uint256 previousThawEndTime
  );

  /**
   * @notice Emitted when a thawing process is cancelled
   * @param buyer Address of the buyer
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @param amount Amount that was being thawed
   */
  event ThawCancelled(address indexed buyer, address indexed seller, address indexed asset, uint256 amount);

  /**
   * @notice Emitted when funds are withdrawn from an escrow account
   * @param buyer Address of the buyer
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @param amount Amount withdrawn
   * @param remainingBalance Remaining balance after withdrawal
   */
  event Withdrawn(
    address indexed buyer,
    address indexed seller,
    address indexed asset,
    uint256 amount,
    uint256 remainingBalance
  );

  /**
   * @notice Emitted when a voucher is collected
   * @param voucherId Unique identifier of the voucher
   * @param buyer Address of the buyer
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @param amount Amount collected
   * @param totalCollected Total amount collected for this voucher
   */
  event VoucherCollected(
    bytes32 indexed voucherId,
    address indexed buyer,
    address indexed seller,
    address asset,
    uint256 amount,
    uint256 totalCollected
  );

  /**
   * @notice Emitted when a voucher collection is skipped because it was already fully collected
   * @param voucherId Unique identifier of the voucher
   * @param buyer Address of the buyer
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @param totalCollected Total amount already collected for this voucher
   */
  event VoucherAlreadyCollected(
    bytes32 indexed voucherId,
    address indexed buyer,
    address indexed seller,
    address asset,
    uint256 totalCollected
  );

  /**
   * @notice Emitted when a voucher has outstanding amount but no collectable balance
   * @param voucherId Unique identifier of the voucher
   * @param buyer Address of the buyer
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @param outstanding Amount still owed on the voucher
   * @param alreadyCollected Amount already collected for this voucher
   */
  event VoucherNoCollectableBalance(
    bytes32 indexed voucherId,
    address indexed buyer,
    address indexed seller,
    address asset,
    uint256 outstanding,
    uint256 alreadyCollected
  );

  /**
   * @notice Emitted when a deposit is made using authorization
   * @param buyer Address of the buyer
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @param amount Amount deposited
   * @param nonce Nonce used for the authorization
   */
  event DepositAuthorized(
    address indexed buyer,
    address indexed seller,
    address indexed asset,
    uint256 amount,
    bytes32 nonce
  );

  /**
   * @notice Emitted when a flush is initiated or completed using authorization
   * @param buyer Address of the buyer
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @param nonce Nonce used for the authorization
   * @param thawing True if thawing was initiated, false if withdrawal completed
   */
  event FlushAuthorized(
    address indexed buyer,
    address indexed seller,
    address indexed asset,
    bytes32 nonce,
    bool thawing
  );

  /**
   * @notice Emitted when all escrows are flushed using authorization
   * @param buyer Address of the buyer
   * @param nonce Nonce used for the authorization
   * @param accountsFlushed Number of accounts affected
   */
  event FlushAllAuthorized(address indexed buyer, bytes32 nonce, uint256 accountsFlushed);

  // ============ DEPOSIT FUNCTIONS ============

  /**
   * @notice Deposit tokens into escrow for a specific seller and asset
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @param amount Amount to deposit
   */
  function deposit(address seller, address asset, uint256 amount) external;

  /**
   * @notice Deposit tokens into escrow on behalf of a buyer
   * @param buyer Address of the buyer who will own the escrow
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @param amount Amount to deposit
   */
  function depositTo(address buyer, address seller, address asset, uint256 amount) external;

  /**
   * @notice Deposit tokens for multiple sellers with a single asset in a single transaction
   * @param asset ERC-20 token address
   * @param deposits Array of deposit inputs
   */
  function depositMany(address asset, DepositInput[] calldata deposits) external;

  /**
   * @notice Deposit tokens using EIP-712 signed authorization
   * @param auth The deposit authorization struct
   * @param signature Buyer's signature for the authorization
   */
  function depositWithAuthorization(DepositAuthorization calldata auth, bytes calldata signature) external;

  // ============ WITHDRAWAL FUNCTIONS ============

  /**
   * @notice Initiate withdrawal process (starts thawing period)
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @param amount Amount to withdraw
   */
  function thaw(address seller, address asset, uint256 amount) external;

  /**
   * @notice Cancel an ongoing thawing process
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   */
  function cancelThaw(address seller, address asset) external;

  /**
   * @notice Complete withdrawal after thawing period
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   */
  function withdraw(address seller, address asset) external;

  /**
   * @notice Initiate or complete flush using EIP-712 signed authorization
   * @param auth The flush authorization struct
   * @param signature Buyer's signature for the authorization
   */
  function flushWithAuthorization(FlushAuthorization calldata auth, bytes calldata signature) external;

  /**
   * @notice Flush all escrows for a buyer using EIP-712 signed authorization
   * @param auth The flush all authorization struct
   * @param signature Buyer's signature for the authorization
   */
  function flushAllWithAuthorization(FlushAllAuthorization calldata auth, bytes calldata signature) external;

  // ============ COLLECTION FUNCTIONS ============

  /**
   * @notice Collect a single voucher (partial or full)
   * @param voucher The voucher to collect
   * @param signature Buyer's signature for the voucher
   */
  function collect(Voucher calldata voucher, bytes calldata signature) external;

  /**
   * @notice Collect multiple vouchers in a single transaction
   * @param vouchers Array of signed vouchers
   */
  function collectMany(SignedVoucher[] calldata vouchers) external;

  // ============ VIEW FUNCTIONS ============

  /**
   * @notice Get escrow account details for a buyer-seller-asset combination
   * @param buyer Address of the buyer
   * @param seller Address of the seller
   * @param asset ERC-20 token address
   * @return EscrowAccount struct with balance, thawing amount, and thaw end time
   */
  function getAccount(address buyer, address seller, address asset) external view returns (EscrowAccount memory);

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
  ) external view returns (uint256 balance, uint256 allowance, uint256 nonce);

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
    );

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
  ) external view returns (uint256);

  /**
   * @notice Calculate the outstanding and collectable amounts for a voucher
   * @param voucher The voucher to check
   * @return outstanding Total amount still owed on the voucher
   * @return collectable Amount that can actually be collected now (considering available balance)
   */
  function getOutstandingAndCollectableAmount(
    Voucher calldata voucher
  ) external view returns (uint256 outstanding, uint256 collectable);

  /**
   * @notice Validate a voucher signature
   * @param voucher The voucher to validate
   * @param signature The signature to validate
   * @return True if signature is valid
   */
  function isVoucherSignatureValid(Voucher calldata voucher, bytes calldata signature) external view returns (bool);

  /**
   * @notice Validate a deposit authorization signature
   * @param auth The deposit authorization to validate
   * @param signature The signature to validate
   * @return True if signature is valid
   */
  function isDepositAuthorizationValid(
    DepositAuthorization calldata auth,
    bytes calldata signature
  ) external view returns (bool);

  /**
   * @notice Validate a flush authorization signature
   * @param auth The flush authorization to validate
   * @param signature The signature to validate
   * @return True if signature is valid
   */
  function isFlushAuthorizationValid(
    FlushAuthorization calldata auth,
    bytes calldata signature
  ) external view returns (bool);

  /**
   * @notice Validate a flush all authorization signature
   * @param auth The flush all authorization to validate
   * @param signature The signature to validate
   * @return True if signature is valid
   */
  function isFlushAllAuthorizationValid(
    FlushAllAuthorization calldata auth,
    bytes calldata signature
  ) external view returns (bool);

  /**
   * @notice Get the current thawing period
   * @return Thawing period in seconds
   */
  function THAWING_PERIOD() external view returns (uint256);

  /**
   * @notice Get the EIP-712 domain separator
   * @return Domain separator hash
   */
  function DOMAIN_SEPARATOR() external view returns (bytes32);

  // ============ CONSTANTS ============

  /**
   * @notice Maximum allowed thawing period
   * @return Maximum thawing period in seconds (30 days)
   */
  function MAX_THAWING_PERIOD() external view returns (uint256);

  /**
   * @notice EIP-712 type hash for voucher structure
   * @return Type hash for voucher
   */
  function VOUCHER_TYPEHASH() external view returns (bytes32);

  /**
   * @notice EIP-712 type hash for deposit authorization structure
   * @return Type hash for deposit authorization
   */
  function DEPOSIT_AUTHORIZATION_TYPEHASH() external view returns (bytes32);

  /**
   * @notice EIP-712 type hash for flush authorization structure
   * @return Type hash for flush authorization
   */
  function FLUSH_AUTHORIZATION_TYPEHASH() external view returns (bytes32);

  /**
   * @notice EIP-712 type hash for flush all authorization structure
   * @return Type hash for flush all authorization
   */
  function FLUSH_ALL_AUTHORIZATION_TYPEHASH() external view returns (bytes32);
}
