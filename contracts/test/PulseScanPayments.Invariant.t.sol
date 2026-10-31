// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PulseScanPayments} from "../PulseScanPayments.sol";
import {PulseScanPaymentsTestBase} from "./PulseScanPayments.Base.t.sol";

/// @dev Drives bounded pay / setPrice / setTreasury / direct-send calls.
contract PulseScanPaymentsHandler is Test {
    PulseScanPayments public immutable payments;
    address public immutable owner;
    address[] public treasuries;
    uint256 public ghostForwarded; // sum of successful payments
    uint256 public ghostPayCalls;

    constructor(PulseScanPayments p, address owner_, address t0, address t1) {
        payments = p;
        owner = owner_;
        treasuries.push(t0);
        treasuries.push(t1);
    }

    function totalTreasuryBalance() external view returns (uint256 total) {
        for (uint256 i; i < treasuries.length; ++i) {
            total += treasuries[i].balance;
        }
    }

    function pay(uint256 amount, uint256 payerSeed, address target, uint8 st) external {
        amount = bound(amount, 0, 2e18);
        if (target == address(0)) target = address(0xCAFE);
        address payer = address(uint160(bound(payerSeed, 0x10000, 0x10010)));
        vm.deal(payer, amount);
        uint256 price = payments.price();
        vm.prank(payer);
        try payments.pay{value: amount}(PulseScanPayments.ScanType(st % 2), target) {
            ghostForwarded += amount;
            ghostPayCalls++;
            assert(amount >= price);
        } catch {
            assert(amount < price);
        }
    }

    function setPrice(uint256 newPrice) external {
        newPrice = bound(newPrice, 1, 1e18);
        vm.prank(owner);
        payments.setPrice(newPrice);
    }

    function setTreasury(uint256 idx) external {
        vm.prank(owner);
        payments.setTreasury(treasuries[idx % treasuries.length]);
    }

    /// @dev Direct sends must revert and never leave funds behind.
    function directSend(uint256 amount) external {
        amount = bound(amount, 0, 1e18);
        vm.deal(address(this), amount);
        (bool ok,) = address(payments).call{value: amount}("");
        assert(!ok);
    }
}

contract PulseScanPaymentsInvariantTest is PulseScanPaymentsTestBase {
    PulseScanPaymentsHandler internal handler;
    address internal treasuryB = makeAddr("treasuryB");

    function setUp() public override {
        super.setUp();
        handler = new PulseScanPaymentsHandler(pay_, owner, treasury, treasuryB);
        targetContract(address(handler));
    }

    /// PROPERTY: the payment contract never holds native funds.
    function invariant_ContractBalanceStaysZero() public view {
        assertEq(address(pay_).balance, 0);
    }

    /// PROPERTY: every successfully paid wei ended up at a treasury.
    function invariant_TreasuriesReceivedAllPaidFunds() public view {
        assertEq(handler.totalTreasuryBalance(), handler.ghostForwarded());
    }

    /// PROPERTY: price always stays inside [1, MAX_PRICE].
    function invariant_PriceWithinBounds() public view {
        uint256 p = pay_.price();
        assertGe(p, 1);
        assertLe(p, MAX_PRICE);
    }

    /// PROPERTY: treasury is never zero and ownership never lost.
    function invariant_TreasuryNonZeroOwnerSet() public view {
        assertTrue(pay_.treasury() != address(0));
        assertEq(pay_.owner(), owner);
    }
}
