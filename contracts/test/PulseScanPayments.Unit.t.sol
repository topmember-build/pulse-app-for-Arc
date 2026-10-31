// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Vm} from "forge-std/Vm.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PulseScanPayments} from "../PulseScanPayments.sol";
import {
    PulseScanPaymentsTestBase,
    RejectingTreasury,
    ReentrantTreasury,
    SwallowingReentrantTreasury
} from "./PulseScanPayments.Base.t.sol";

contract PulseScanPaymentsUnitTest is PulseScanPaymentsTestBase {
    event ScanPaid(address indexed payer, address indexed target, PulseScanPayments.ScanType scanType, uint256 amount);
    event PriceUpdated(uint256 oldPrice, uint256 newPrice);
    event TreasuryUpdated(address old, address newTreasury);

    // ---------------------------------------------------------------- constructor

    function test_Constructor_SetsState() public view {
        assertEq(pay_.owner(), owner);
        assertEq(pay_.pendingOwner(), address(0));
        assertEq(pay_.treasury(), treasury);
        assertEq(pay_.price(), PRICE);
        assertEq(pay_.MAX_PRICE(), MAX_PRICE);
        assertEq(address(pay_).balance, 0);
    }

    function test_Constructor_RevertsOnZeroOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new PulseScanPayments(address(0), treasury, PRICE);
    }

    function test_Constructor_RevertsOnZeroTreasury() public {
        vm.expectRevert(PulseScanPayments.ZeroAddress.selector);
        new PulseScanPayments(owner, address(0), PRICE);
    }

    function test_Constructor_RevertsOnZeroPrice() public {
        vm.expectRevert(abi.encodeWithSelector(PulseScanPayments.InvalidPrice.selector, 0));
        new PulseScanPayments(owner, treasury, 0);
    }

    function test_Constructor_RevertsOnPriceAboveMax() public {
        vm.expectRevert(abi.encodeWithSelector(PulseScanPayments.InvalidPrice.selector, MAX_PRICE + 1));
        new PulseScanPayments(owner, treasury, MAX_PRICE + 1);
    }

    function test_Constructor_AcceptsPriceBounds() public {
        assertEq(new PulseScanPayments(owner, treasury, 1).price(), 1);
        assertEq(new PulseScanPayments(owner, treasury, MAX_PRICE).price(), MAX_PRICE);
    }

    // ---------------------------------------------------------------- pay: happy path

    function test_Pay_ExactPriceForwardsToTreasury() public {
        uint256 tBefore = treasury.balance;
        uint256 aBefore = alice.balance;
        vm.prank(alice);
        pay_.pay{value: PRICE}(PulseScanPayments.ScanType.Token, scanTarget);
        assertEq(treasury.balance, tBefore + PRICE);
        assertEq(alice.balance, aBefore - PRICE);
        assertEq(address(pay_).balance, 0);
    }

    function test_Pay_OverpaymentFullyForwarded() public {
        uint256 amount = PRICE * 7 + 123;
        uint256 tBefore = treasury.balance;
        uint256 aBefore = alice.balance;
        vm.prank(alice);
        pay_.pay{value: amount}(PulseScanPayments.ScanType.Contract, scanTarget);
        assertEq(treasury.balance, tBefore + amount);
        assertEq(alice.balance, aBefore - amount);
        assertEq(address(pay_).balance, 0);
    }

    function test_Pay_BothScanTypesWork() public {
        vm.startPrank(alice);
        pay_.pay{value: PRICE}(PulseScanPayments.ScanType.Token, scanTarget);
        pay_.pay{value: PRICE}(PulseScanPayments.ScanType.Contract, scanTarget);
        vm.stopPrank();
        assertEq(treasury.balance, 2 * PRICE);
        assertEq(address(pay_).balance, 0);
    }

    function test_Pay_MultiplePayersAccumulateAtTreasury() public {
        vm.prank(alice);
        pay_.pay{value: PRICE}(PulseScanPayments.ScanType.Token, scanTarget);
        vm.prank(bob);
        pay_.pay{value: 3 * PRICE}(PulseScanPayments.ScanType.Token, scanTarget);
        assertEq(treasury.balance, 4 * PRICE);
        assertEq(address(pay_).balance, 0);
    }

    // ---------------------------------------------------------------- pay: events

    function test_Pay_EmitsScanPaid_Token() public {
        vm.expectEmit(true, true, false, true, address(pay_));
        emit ScanPaid(alice, scanTarget, PulseScanPayments.ScanType.Token, PRICE);
        vm.prank(alice);
        pay_.pay{value: PRICE}(PulseScanPayments.ScanType.Token, scanTarget);
    }

    function test_Pay_EmitsScanPaid_ContractWithOverpayment() public {
        uint256 amount = 5 * PRICE;
        vm.expectEmit(true, true, false, true, address(pay_));
        emit ScanPaid(bob, scanTarget, PulseScanPayments.ScanType.Contract, amount);
        vm.prank(bob);
        pay_.pay{value: amount}(PulseScanPayments.ScanType.Contract, scanTarget);
    }

    function test_Pay_ScanPaidTopicsAreIndexedPayerAndTarget() public {
        vm.recordLogs();
        vm.prank(alice);
        pay_.pay{value: PRICE}(PulseScanPayments.ScanType.Contract, scanTarget);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);
        assertEq(logs[0].emitter, address(pay_));
        assertEq(logs[0].topics.length, 3);
        assertEq(logs[0].topics[0], ScanPaidSig());
        assertEq(address(uint160(uint256(logs[0].topics[1]))), alice);
        assertEq(address(uint160(uint256(logs[0].topics[2]))), scanTarget);
        (uint8 st, uint256 amt) = abi.decode(logs[0].data, (uint8, uint256));
        assertEq(st, uint8(PulseScanPayments.ScanType.Contract));
        assertEq(amt, PRICE);
    }

    function ScanPaidSig() internal pure returns (bytes32) {
        return keccak256("ScanPaid(address,address,uint8,uint256)");
    }

    // ---------------------------------------------------------------- pay: reverts

    function test_Pay_RevertsOnUnderpayment() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PulseScanPayments.PaymentTooLow.selector, PRICE - 1, PRICE));
        pay_.pay{value: PRICE - 1}(PulseScanPayments.ScanType.Token, scanTarget);
    }

    function test_Pay_RevertsOnZeroValue() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PulseScanPayments.PaymentTooLow.selector, 0, PRICE));
        pay_.pay(PulseScanPayments.ScanType.Token, scanTarget);
    }

    function test_Pay_RevertsOnZeroTarget() public {
        vm.prank(alice);
        vm.expectRevert(PulseScanPayments.ZeroAddress.selector);
        pay_.pay{value: PRICE}(PulseScanPayments.ScanType.Token, address(0));
    }

    function test_Pay_UnderpaymentRevertLeavesBalancesUntouched() public {
        uint256 aBefore = alice.balance;
        vm.prank(alice);
        vm.expectRevert();
        pay_.pay{value: PRICE - 1}(PulseScanPayments.ScanType.Token, scanTarget);
        assertEq(alice.balance, aBefore);
        assertEq(treasury.balance, 0);
        assertEq(address(pay_).balance, 0);
    }

    function test_Pay_InvalidScanTypeReverts() public {
        vm.prank(alice);
        (bool ok,) = address(pay_).call{value: PRICE}(abi.encodeWithSignature("pay(uint8,address)", uint8(2), scanTarget));
        assertFalse(ok);
        assertEq(treasury.balance, 0);
    }

    function test_Pay_RejectingTreasuryRevertsAndPayerKeepsFunds() public {
        RejectingTreasury bad = new RejectingTreasury();
        vm.prank(owner);
        pay_.setTreasury(address(bad));

        uint256 aBefore = alice.balance;
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(PulseScanPayments.TreasuryTransferFailed.selector, address(bad), PRICE)
        );
        pay_.pay{value: PRICE}(PulseScanPayments.ScanType.Token, scanTarget);

        assertEq(alice.balance, aBefore);
        assertEq(address(bad).balance, 0);
        assertEq(address(pay_).balance, 0);
    }

    function test_Pay_RejectingTreasuryEmitsNoEvent() public {
        RejectingTreasury bad = new RejectingTreasury();
        vm.prank(owner);
        pay_.setTreasury(address(bad));
        vm.recordLogs();
        vm.prank(alice);
        (bool ok,) = address(pay_).call{value: PRICE}(
            abi.encodeCall(PulseScanPayments.pay, (PulseScanPayments.ScanType.Token, scanTarget))
        );
        assertFalse(ok);
        assertEq(vm.getRecordedLogs().length, 0);
    }

    // ---------------------------------------------------------------- reentrancy

    function test_Pay_ReentrantTreasuryIsBlocked() public {
        ReentrantTreasury evil = new ReentrantTreasury(pay_);
        vm.prank(owner);
        pay_.setTreasury(address(evil));

        uint256 aBefore = alice.balance;
        vm.prank(alice);
        // inner reentry reverts inside treasury's receive -> outer call sees failed transfer
        vm.expectRevert(
            abi.encodeWithSelector(PulseScanPayments.TreasuryTransferFailed.selector, address(evil), PRICE)
        );
        pay_.pay{value: PRICE}(PulseScanPayments.ScanType.Token, scanTarget);

        assertEq(alice.balance, aBefore);
        assertEq(address(evil).balance, 0);
        assertEq(address(pay_).balance, 0);
    }

    function test_Pay_ReentrancyAttemptRevertsWithGuardError() public {
        SwallowingReentrantTreasury sw = new SwallowingReentrantTreasury(pay_);
        vm.prank(owner);
        pay_.setTreasury(address(sw));

        vm.prank(alice);
        pay_.pay{value: PRICE}(PulseScanPayments.ScanType.Token, scanTarget);

        assertTrue(sw.attempted());
        assertFalse(sw.reentrySucceeded());
        assertEq(
            keccak256(sw.reentryRevertData()),
            keccak256(abi.encodeWithSelector(ReentrancyGuard.ReentrancyGuardReentrantCall.selector))
        );
        // only the single outer payment was forwarded
        assertEq(address(sw).balance, PRICE);
        assertEq(address(pay_).balance, 0);
    }

    // ---------------------------------------------------------------- receive / fallback

    function test_Receive_Reverts() public {
        vm.prank(alice);
        vm.expectRevert(PulseScanPayments.DirectPaymentDisabled.selector);
        (bool ok,) = address(pay_).call{value: 1 ether}("");
        ok;
        assertEq(address(pay_).balance, 0);
    }

    function test_Receive_RevertsWithZeroValue() public {
        vm.prank(alice);
        vm.expectRevert(PulseScanPayments.DirectPaymentDisabled.selector);
        (bool ok,) = address(pay_).call("");
        ok;
    }

    function test_Fallback_RevertsWithoutValue() public {
        vm.prank(alice);
        vm.expectRevert(PulseScanPayments.DirectPaymentDisabled.selector);
        (bool ok,) = address(pay_).call(abi.encodeWithSignature("doesNotExist()"));
        ok;
    }

    function test_Fallback_RevertsWithValue() public {
        vm.prank(alice);
        vm.expectRevert(PulseScanPayments.DirectPaymentDisabled.selector);
        (bool ok,) = address(pay_).call{value: 1 ether}(abi.encodeWithSignature("doesNotExist()"));
        ok;
        assertEq(address(pay_).balance, 0);
    }

    // ---------------------------------------------------------------- setPrice

    function test_SetPrice_OwnerUpdatesAndEmits() public {
        uint256 newPrice = 0.5e18;
        vm.expectEmit(false, false, false, true, address(pay_));
        emit PriceUpdated(PRICE, newPrice);
        vm.prank(owner);
        pay_.setPrice(newPrice);
        assertEq(pay_.price(), newPrice);
    }

    function test_SetPrice_AcceptsBounds() public {
        vm.startPrank(owner);
        pay_.setPrice(1);
        assertEq(pay_.price(), 1);
        pay_.setPrice(MAX_PRICE);
        assertEq(pay_.price(), MAX_PRICE);
        vm.stopPrank();
    }

    function test_SetPrice_NonOwnerReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        pay_.setPrice(1);
    }

    function test_SetPrice_ZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PulseScanPayments.InvalidPrice.selector, 0));
        pay_.setPrice(0);
    }

    function test_SetPrice_AboveMaxReverts() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(PulseScanPayments.InvalidPrice.selector, MAX_PRICE + 1));
        pay_.setPrice(MAX_PRICE + 1);
    }

    function test_SetPrice_AffectsSubsequentPayments() public {
        vm.prank(owner);
        pay_.setPrice(2 * PRICE);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(PulseScanPayments.PaymentTooLow.selector, PRICE, 2 * PRICE));
        pay_.pay{value: PRICE}(PulseScanPayments.ScanType.Token, scanTarget);
        vm.prank(alice);
        pay_.pay{value: 2 * PRICE}(PulseScanPayments.ScanType.Token, scanTarget);
        assertEq(treasury.balance, 2 * PRICE);
    }

    // ---------------------------------------------------------------- setTreasury

    function test_SetTreasury_OwnerUpdatesAndEmits() public {
        address newT = makeAddr("newTreasury");
        vm.expectEmit(false, false, false, true, address(pay_));
        emit TreasuryUpdated(treasury, newT);
        vm.prank(owner);
        pay_.setTreasury(newT);
        assertEq(pay_.treasury(), newT);
    }

    function test_SetTreasury_NewTreasuryReceivesFutureFunds() public {
        address newT = makeAddr("newTreasury");
        vm.prank(owner);
        pay_.setTreasury(newT);
        vm.prank(alice);
        pay_.pay{value: PRICE}(PulseScanPayments.ScanType.Token, scanTarget);
        assertEq(newT.balance, PRICE);
        assertEq(treasury.balance, 0);
    }

    function test_SetTreasury_NonOwnerReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        pay_.setTreasury(alice);
    }

    function test_SetTreasury_ZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(PulseScanPayments.ZeroAddress.selector);
        pay_.setTreasury(address(0));
    }

    // ---------------------------------------------------------------- ownership

    function test_Ownership_TwoStepTransfer() public {
        vm.expectEmit(true, true, false, false, address(pay_));
        emit Ownable2Step.OwnershipTransferStarted(owner, alice);
        vm.prank(owner);
        pay_.transferOwnership(alice);
        assertEq(pay_.owner(), owner, "owner unchanged until accept");
        assertEq(pay_.pendingOwner(), alice);

        vm.expectEmit(true, true, false, false, address(pay_));
        emit Ownable.OwnershipTransferred(owner, alice);
        vm.prank(alice);
        pay_.acceptOwnership();
        assertEq(pay_.owner(), alice);
        assertEq(pay_.pendingOwner(), address(0));

        // new owner can administer, old owner cannot
        vm.prank(alice);
        pay_.setPrice(2);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        pay_.setPrice(3);
    }

    function test_Ownership_OnlyPendingOwnerCanAccept() public {
        vm.prank(owner);
        pay_.transferOwnership(alice);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, bob));
        pay_.acceptOwnership();
        assertEq(pay_.owner(), owner);
    }

    function test_Ownership_NonOwnerCannotStartTransfer() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        pay_.transferOwnership(alice);
    }

    function test_RenounceOwnership_OwnerRevertsAndKeepsOwnership() public {
        vm.prank(owner);
        vm.expectRevert(PulseScanPayments.RenounceOwnershipDisabled.selector);
        pay_.renounceOwnership();
        assertEq(pay_.owner(), owner);
    }

    function test_RenounceOwnership_NonOwnerReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        pay_.renounceOwnership();
    }
}
