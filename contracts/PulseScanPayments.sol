// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PulseScanPayments
/// @notice Single-transaction native-USDC payments for Pulse scans on Arc.
/// @dev Native amounts use 18 decimals, not the separate ERC-20 view's 6 decimals.
///      Successful payments forward all msg.value; ordinary direct transfers revert.
///      EVM-forced funds cannot be prevented and there is no recovery/admin sweep.
contract PulseScanPayments is Ownable2Step, ReentrancyGuard {
    /// @notice The scanner service requested by a payment.
    enum ScanType {
        /// @notice Token safety scan.
        Token,
        /// @notice Contract safety scan.
        Contract
    }

    /// @notice Maximum scan price: 1 USDC in Arc native units.
    uint256 public constant MAX_PRICE = 1e18;

    /// @notice Recipient of the entire value of each scan payment.
    address public treasury;

    /// @notice Minimum scan payment in 18-decimal native-USDC units.
    uint256 public price;

    /// @notice A required address was zero.
    error ZeroAddress();

    /// @notice A price was outside the inclusive range [1, MAX_PRICE].
    /// @param value The rejected price in native units.
    error InvalidPrice(uint256 value);

    /// @notice The payment did not cover the current price.
    /// @param sent Native amount supplied by the payer.
    /// @param required Minimum native amount required.
    error PaymentTooLow(uint256 sent, uint256 required);

    /// @notice Forwarding the payment to the treasury failed.
    /// @param recipient Treasury that rejected the payment.
    /// @param amount Native amount that could not be forwarded.
    error TreasuryTransferFailed(address recipient, uint256 amount);

    /// @notice Direct native transfers and unknown function calls are not accepted.
    error DirectPaymentDisabled();

    /// @notice Ownership cannot be renounced.
    error RenounceOwnershipDisabled();

    /// @notice A scan payment was successfully forwarded to the treasury.
    /// @param payer Address that called pay.
    /// @param target Token or contract to scan.
    /// @param scanType Requested scanner service.
    /// @param amount Entire native amount paid, including any overpayment.
    event ScanPaid(address indexed payer, address indexed target, ScanType scanType, uint256 amount);

    /// @notice The minimum scan price changed.
    /// @param oldPrice Previous price in native units.
    /// @param newPrice New price in native units.
    event PriceUpdated(uint256 oldPrice, uint256 newPrice);

    /// @notice The payment recipient changed.
    /// @param old Previous treasury.
    /// @param newTreasury New treasury.
    event TreasuryUpdated(address old, address newTreasury);

    /// @notice Initialize the owner, payment recipient, and scan price.
    /// @dev Ownable rejects a zero initialOwner with its custom error.
    /// @param initialOwner Initial owner, with two-step ownership transfers.
    /// @param treasury_ Nonzero recipient of scan payments.
    /// @param price_ Initial price, greater than zero and no greater than MAX_PRICE.
    constructor(address initialOwner, address treasury_, uint256 price_) Ownable(initialOwner) {
        if (treasury_ == address(0)) revert ZeroAddress();
        _validatePrice(price_);
        treasury = treasury_;
        price = price_;
    }

    /// @notice Pay for a scan without an ERC-20 approval transaction.
    /// @dev Forwards the entire msg.value, including overpayment, or reverts atomically.
    /// @param scanType Requested scanner service.
    /// @param target Nonzero token or contract address to scan.
    function pay(ScanType scanType, address target) external payable nonReentrant {
        if (target == address(0)) revert ZeroAddress();
        if (msg.value < price) revert PaymentTooLow(msg.value, price);

        (bool success, ) = treasury.call{value: msg.value}("");
        if (!success) revert TreasuryTransferFailed(treasury, msg.value);

        emit ScanPaid(msg.sender, target, scanType, msg.value);
    }

    /// @notice Update the minimum payment for either scan type.
    /// @param newPrice New price, greater than zero and no greater than MAX_PRICE.
    function setPrice(uint256 newPrice) external onlyOwner {
        _validatePrice(newPrice);
        uint256 oldPrice = price;
        price = newPrice;
        emit PriceUpdated(oldPrice, newPrice);
    }

    /// @notice Update the recipient of future scan payments.
    /// @param newTreasury Nonzero treasury address.
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    /// @notice Always revert; ownership must be transferred using the two-step flow.
    /// @dev Only the owner can invoke this override, and it never changes ownership.
    function renounceOwnership() public override onlyOwner {
        revert RenounceOwnershipDisabled();
    }

    /// @notice Reject native-USDC transfers without a scan request.
    receive() external payable {
        revert DirectPaymentDisabled();
    }

    /// @notice Reject unknown function calls, with or without native USDC.
    fallback() external payable {
        revert DirectPaymentDisabled();
    }

    /// @notice Enforce the scan price bounds.
    /// @param value Proposed price in native units.
    function _validatePrice(uint256 value) private pure {
        if (value == 0 || value > MAX_PRICE) revert InvalidPrice(value);
    }
}
